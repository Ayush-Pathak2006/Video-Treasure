import { Video } from "../models/video.model.js";
import { QueryState } from "../models/queryState.model.js";
import { PROVIDERS, SUPPORTED_PLATFORMS } from "../providers/provider.registry.js";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;
const MAX_REFILL_CYCLES = 4;


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

const buildVideoFilter = (query, cursorDate, platformFilter) => ({
  ...(Array.isArray(query) ? { query: { $in: query } } : { query }),
  ...(platformFilter !== "all" && { platform: platformFilter }),
  ...(cursorDate && { publishedAt: { $lt: cursorDate } }),
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
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return [platform];
};

const getOrCreateQueryState = async (query, platform) =>
  QueryState.findOneAndUpdate(
    { query, platform },
    { $setOnInsert: { query, platform, exhausted: false, exhaustedReason: null, nextPageToken: null } },
    { upsert: true, new: true }
  );

const refillVideosFromApi = async ({ dbQuery, providerQuery, platform, state }) => {
  const provider = PROVIDERS[platform];

  if (state.exhausted) {
    return state;
  }

  try {
    const { videos: apiVideos, nextPageToken } = await provider.search(providerQuery, state.nextPageToken);

    if (apiVideos.length > 0) {
      const normalizedVideos = apiVideos.map(video => ({ ...video, query: dbQuery }));
      await Video.insertMany(normalizedVideos, { ordered: false }).catch(() => {});
    }

    if (nextPageToken) {
      state.nextPageToken = nextPageToken;
      console.log(`📡 [videos:${dbQuery}] ${provider.name}: fetched ${apiVideos.length} videos from API and cached in DB.`);
    } else {
      state.exhausted = true;
      state.exhaustedReason = "all_videos_accessed";
      console.log(`🛑 [videos:${dbQuery}] ${provider.name}: all videos for this topic are fetched from API.`);
    }
  } catch (error) {
    const providerError = mapProviderErrorToReason(error);

    if (providerError) {
      state.exhausted = true;
      state.exhaustedReason = providerError.exhaustedReason;
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

const countRemainingDbVideos = (query, platform, cursorDate) =>
  Video.countDocuments(buildVideoFilter(query, cursorDate, platform));

const loadStatesByPlatform = async (query, platformsToSearch) => {
  const stateEntries = await Promise.all(
    platformsToSearch.map(async currentPlatform => {
      const state = await getOrCreateQueryState(query, currentPlatform);
      return [currentPlatform, state];
    })
  );

  return Object.fromEntries(stateEntries);
};

const refillFromApiUntilPageFilled = async ({ dbQuery, providerQuery, platform, cursorDate, platformsToSearch, pageSize }) => {
  let statesByPlatform = await loadStatesByPlatform(dbQuery, platformsToSearch);

  for (let refillCycle = 0; refillCycle < MAX_REFILL_CYCLES; refillCycle += 1) {
    const remainingInDb = await countRemainingDbVideos(dbQuery, platform, cursorDate);

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
  const cursorDate = cursor ? new Date(cursor) : null;
  const platformsToSearch = getPlatformsToSearch(platform);
  const filter = buildVideoFilter(query, cursorDate, platform);
  const normalizedProviderQuery = providerQuery || query;
  let videos = await Video.find(filter).sort({ publishedAt: -1 }).limit(pageSize);

  let statesByPlatform = {};

  if (videos.length < pageSize) {
    statesByPlatform = await refillFromApiUntilPageFilled({
      dbQuery: query,
      providerQuery: normalizedProviderQuery,
      platform,
      cursorDate,
      platformsToSearch,
      pageSize,
    });

    videos = await Video.find(filter).sort({ publishedAt: -1 }).limit(pageSize);
  }

  const nextCursor = videos.length > 0 ? videos[videos.length - 1].publishedAt : null;
  const remainingAfterPage = nextCursor ? await Video.countDocuments(buildVideoFilter(query, nextCursor, platform)) : 0;

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

  console.log(
    `ℹ️ [videos:${query}] pageSize=${pageSize} platform=${platform} returned=${videos.length} remainingInDb=${remainingAfterPage} canStillFetchFromApi=${canStillFetchFromApi} hasMore=${hasMore}`
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
  };
};