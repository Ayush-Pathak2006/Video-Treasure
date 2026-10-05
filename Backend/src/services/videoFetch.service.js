import { Video } from "../models/video.model.js";
import { QueryState } from "../models/queryState.model.js";
import { PROVIDERS, SUPPORTED_PLATFORMS } from "../providers/provider.registry.js";
import { rankByRelevance } from "../utils/videoRanking.js";
import { assignSearchRanks } from "../utils/searchRanks.js";
import { rememberCachedSearch } from "../utils/similarSearch.js";
import { ApiError } from "../utils/ApiError.js";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;
const MAX_REFILL_CYCLES = 4;

// A YouTube search costs 100 units whether it returns 12 or 50 videos, and 50 candidates give the ranker
// room to find the official upload.
const SEARCH_CANDIDATES_PER_CALL = 50;

// Best first. _id breaks ties: two platforms refilled at the same moment can get the same rank numbers.
const SEARCH_ORDER = { searchRank: 1, _id: 1 };

// A query/platform exhausted by a temporary problem (quota, rate limit, access denied) may call the API
// again after this cooldown. "all_videos_accessed" is permanent: the provider has no more pages.
const TEMPORARY_EXHAUSTION_REASONS = new Set(["rate_limit_hit", "api_access_denied"]);
const EXHAUSTION_RETRY_COOLDOWN_MS = 60 * 60 * 1000;


const mapProviderErrorToReason = error => {
  const status = error?.response?.status;

  if (status === 429) {
    return {
      exhaustedReason: "rate_limit_hit",
      logMessage: "API rate limit hit.",
    };
  }

  if (status === 401 || status === 403) {
    return {
      exhaustedReason: "api_access_denied",
      logMessage: "API access denied (invalid key, quota exhausted, or key restriction mismatch).",
    };
  }

  return null;
};

// The client cursor is "<searchRank>_<_id>" of the last video it was sent.
const encodeCursor = video => `${video.searchRank}_${video._id}`;

const decodeCursor = rawCursor => {
  const [rank, id] = String(rawCursor).split("_");
  const searchRank = Number(rank);

  if (rank === "" || !Number.isFinite(searchRank) || !/^[a-f\d]{24}$/i.test(id || "")) {
    throw new ApiError(400, "Invalid cursor.");
  }

  return { searchRank, _id: id };
};

// Videos without a searchRank aren't ranked yet (ensureSearchRanks ranks them on the next start), so they stay hidden.
const buildVideoFilter = (query, cursor, platformFilter) => ({
  ...(Array.isArray(query) ? { query: { $in: query } } : { query }),
  ...(platformFilter !== "all" && { platform: platformFilter }),
  ...(cursor
    ? {
        $or: [
          { searchRank: { $gt: cursor.searchRank } },
          { searchRank: cursor.searchRank, _id: { $gt: cursor._id } },
        ],
      }
    : { searchRank: { $ne: null } }),
});

const normalizeLimit = rawLimit => {
  const parsedLimit = Number.parseInt(rawLimit, 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(parsedLimit, MAX_PAGE_SIZE);
};

const getPlatformsToSearch = platform => {
  if (!platform || platform === "all") return SUPPORTED_PLATFORMS;
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new ApiError(400, `Unsupported platform: ${platform}`);
  }
  return [platform];
};

const markExhausted = (state, reason) => {
  state.exhausted = true;
  state.exhaustedReason = reason;
  state.exhaustedAt = new Date();
};

const reopenIfCooldownPassed = async state => {
  if (!state.exhausted || !TEMPORARY_EXHAUSTION_REASONS.has(state.exhaustedReason)) {
    return state;
  }

  // States exhausted before `exhaustedAt` existed have no timestamp, so they reopen right away.
  const exhaustedForMs = state.exhaustedAt ? Date.now() - state.exhaustedAt.getTime() : Infinity;

  if (exhaustedForMs < EXHAUSTION_RETRY_COOLDOWN_MS) {
    return state;
  }

  state.exhausted = false;
  state.exhaustedReason = null;
  state.exhaustedAt = null;
  await state.save();
  console.log(`🔁 [videos:${state.query}] ${PROVIDERS[state.platform].name}: cooldown passed, API calls allowed again.`);

  return state;
};

const getOrCreateQueryState = async (query, platform) => {
  const state = await QueryState.findOneAndUpdate(
    { query, platform },
    { $setOnInsert: { query, platform, exhausted: false, exhaustedReason: null, exhaustedAt: null, nextPageToken: null } },
    { upsert: true, new: true }
  );

  return reopenIfCooldownPassed(state);
};

const refillVideosFromApi = async ({ dbQuery, providerQuery, platform, state }) => {
  const provider = PROVIDERS[platform];

  if (state.exhausted) {
    return state;
  }

  try {
    const { videos: apiVideos, nextPageToken } = await provider.search(providerQuery, state.nextPageToken, {
      maxResults: SEARCH_CANDIDATES_PER_CALL,
    });

    if (apiVideos.length > 0) {
      const rankedVideos = await assignSearchRanks(rankByRelevance(apiVideos, providerQuery), dbQuery);
      await Video.insertMany(rankedVideos, { ordered: false }).catch(() => {});
      rememberCachedSearch(dbQuery, rankedVideos);
    }

    if (nextPageToken) {
      state.nextPageToken = nextPageToken;
      console.log(`📡 [videos:${dbQuery}] ${provider.name}: fetched ${apiVideos.length} videos from API and cached in DB.`);
    } else {
      markExhausted(state, "all_videos_accessed");
      console.log(`🛑 [videos:${dbQuery}] ${provider.name}: all videos for this topic are fetched from API.`);
    }
  } catch (error) {
    const providerError = mapProviderErrorToReason(error);

    if (providerError) {
      markExhausted(state, providerError.exhaustedReason);
      console.log(`⚠️ [videos:${dbQuery}] ${provider.name}: ${providerError.logMessage}`);
    } else {
      throw error;
    }
  }

  await state.save();
  return state;
};

const groupVideosByPlatform = videos =>
  videos.reduce((acc, video) => {
    if (!acc[video.platform]) {
      acc[video.platform] = [];
    }

    acc[video.platform].push(video);
    return acc;
  }, {});

const countRemainingDbVideos = (query, platform, cursor) =>
  Video.countDocuments(buildVideoFilter(query, cursor, platform));

const loadStatesByPlatform = async (query, platformsToSearch) => {
  const stateEntries = await Promise.all(
    platformsToSearch.map(async currentPlatform => {
      const state = await getOrCreateQueryState(query, currentPlatform);
      return [currentPlatform, state];
    })
  );

  return Object.fromEntries(stateEntries);
};

const refillFromApiUntilPageFilled = async ({ dbQuery, providerQuery, platform, cursor, platformsToSearch, pageSize }) => {
  let statesByPlatform = await loadStatesByPlatform(dbQuery, platformsToSearch);

  for (let refillCycle = 0; refillCycle < MAX_REFILL_CYCLES; refillCycle += 1) {
    const remainingInDb = await countRemainingDbVideos(dbQuery, platform, cursor);

    if (remainingInDb >= pageSize) {
      break;
    }

    const activePlatforms = platformsToSearch.filter(currentPlatform => !statesByPlatform[currentPlatform]?.exhausted);

    if (!activePlatforms.length) {
      break;
    }

    await Promise.all(
      activePlatforms.map(async currentPlatform => {
        const state = statesByPlatform[currentPlatform] || (await getOrCreateQueryState(dbQuery, currentPlatform));
        statesByPlatform[currentPlatform] = await refillVideosFromApi({
          dbQuery,
          providerQuery,
          platform: currentPlatform,
          state,
        });
      })
    );
  }

  return statesByPlatform;
};

export const fetchVideosByQuery = async ({ query, cursor = null, platform = "all", limit = DEFAULT_PAGE_SIZE, providerQuery = null }) => {
  const pageSize = normalizeLimit(limit);
  const decodedCursor = cursor ? decodeCursor(cursor) : null;
  const platformsToSearch = getPlatformsToSearch(platform);
  const filter = buildVideoFilter(query, decodedCursor, platform);
  const normalizedProviderQuery = providerQuery || query;
  let videos = await Video.find(filter).sort(SEARCH_ORDER).limit(pageSize);

  let statesByPlatform = {};

  if (videos.length < pageSize) {
    statesByPlatform = await refillFromApiUntilPageFilled({
      dbQuery: query,
      providerQuery: normalizedProviderQuery,
      platform,
      cursor: decodedCursor,
      platformsToSearch,
      pageSize,
    });

    videos = await Video.find(filter).sort(SEARCH_ORDER).limit(pageSize);
  }

  const lastVideo = videos.at(-1);
  const nextCursor = lastVideo ? encodeCursor(lastVideo) : null;
  const remainingAfterPage = lastVideo ? await countRemainingDbVideos(query, platform, lastVideo) : 0;

  const freshStates =
    Object.keys(statesByPlatform).length > 0 ? statesByPlatform : await loadStatesByPlatform(query, platformsToSearch);
    
  const terminalReasonByPlatform = Object.fromEntries(
    platformsToSearch.map(currentPlatform => {
      const state = freshStates[currentPlatform];
      return [currentPlatform, state?.exhausted ? state.exhaustedReason || "all_videos_accessed" : null];
    })
  );

  const canStillFetchFromApi = platformsToSearch.some(currentPlatform => !freshStates[currentPlatform]?.exhausted);
  const hasMore = remainingAfterPage > 0 || canStillFetchFromApi;

  // The real counts only go to the server log. "shown" is how far into the cached results this page reaches.
  const cachedTotal = await countRemainingDbVideos(query, platform, null);

  console.log(
    `ℹ️ [videos:${query}] pageSize=${pageSize} platform=${platform} returned=${videos.length} shown=${cachedTotal - remainingAfterPage} fetched=${cachedTotal} remainingInDb=${remainingAfterPage} canStillFetchFromApi=${canStillFetchFromApi} hasMore=${hasMore}`
  );

  if (!hasMore) {
    const reasonText = Object.entries(terminalReasonByPlatform)
      .map(([currentPlatform, reason]) => `${currentPlatform}: ${reason || "all_videos_accessed"}`)
      .join(", ");
    console.log(`✅ [videos:${query}] Infinite scroll exhausted. Reason => ${reasonText}`);
  }

  return {
    videos,
    byPlatform: groupVideosByPlatform(videos),
    nextCursor,
    hasMore,
    terminalReasonByPlatform,
    // Videos already in the DB after this page, capped at the largest page size. That's enough for the frontend
    // to know whether the next page needs an API call, without telling every visitor how much is cached.
    cachedAhead: Math.min(remainingAfterPage, MAX_PAGE_SIZE),
  };
};