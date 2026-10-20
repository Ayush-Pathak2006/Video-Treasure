import { Video } from "../models/video.model.js";
import { QueryState } from "../models/queryState.model.js";
import { PROVIDERS, SUPPORTED_PLATFORMS } from "../providers/provider.registry.js";
import { rankByRelevance } from "../utils/videoRanking.js";
import { assignSearchRanks } from "../utils/searchRanks.js";
import { rememberCachedSearch } from "../utils/similarSearch.js";
import { refundSpendToken, takeSpendToken } from "../utils/spendMeter.js";
import { acquireLease, readLiveLease, releaseLease, updateLease } from "../utils/lease.js";
import { ApiError } from "../utils/ApiError.js";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;
const MAX_REFILL_CYCLES = 4;

// A YouTube search is one of the day's 100 search calls whether it returns 12 or 50 videos, and 50 candidates
// give the ranker room to find the official upload.
const SEARCH_CANDIDATES_PER_CALL = 50;

// A search stops growing its cache of a metered platform (YouTube) at this depth, for everyone: about 6 API
// calls. Few people scroll that far, and the quota does more good on new searches.
const MAX_METERED_VIDEOS_PER_SEARCH = 300;

// Refills in flight, keyed by search, platform and page token. A request that needs the same page waits for the
// same provider call instead of making its own: through this Map within one process, and through a MongoDB
// lease ("refill:<key>") across processes, when several API instances run.
const inFlightRefills = new Map();

// A finished refill stays shared this long, so a request that loaded the page token just before the refill
// saved the next one reuses that refill instead of fetching the same page again.
const FINISHED_REFILL_REUSE_MS = 30 * 1000;
// Longer than any provider call. A process that crashes mid-refill frees its lease when this passes.
const REFILL_LEASE_MS = 20 * 1000;
const LEASE_POLL_MS = 200;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Waits for another process's refill. True when it finished with a fetch to reuse, false when it stopped
// without one (its lease was released or expired).
const waitForOtherInstance = async leaseName => {
  for (let waited = 0; waited <= REFILL_LEASE_MS; waited += LEASE_POLL_MS) {
    const lease = await readLiveLease(leaseName);
    if (!lease) return false;
    if (lease.status === "done") return true;
    await sleep(LEASE_POLL_MS);
  }

  return false;
};

// The refill as seen by the first request of this process: take the cross-process lease and call the provider,
// or wait for the process that holds it.
const runSharedRefill = async (leaseName, providerCall) => {
  if (!(await acquireLease(leaseName, { ttlMs: REFILL_LEASE_MS, renewable: false }))) {
    return { fetched: await waitForOtherInstance(leaseName), limit: null, byOtherInstance: true };
  }

  let outcome;

  try {
    outcome = await providerCall();
  } catch (error) {
    await releaseLease(leaseName);
    throw error;
  }

  // Only a successful fetch is shared; anything else frees the lease so the others try themselves.
  if (outcome.fetched) {
    await updateLease(leaseName, { status: "done", expiresAt: new Date(Date.now() + FINISHED_REFILL_REUSE_MS) });
  } else {
    await releaseLease(leaseName);
  }

  return outcome;
};

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

const getOrCreateQueryState = async (query, platform, regionCode = null) => {
  const state = await QueryState.findOneAndUpdate(
    { query, platform },
    {
      $setOnInsert: { query, platform, exhausted: false, exhaustedReason: null, exhaustedAt: null, nextPageToken: null, regionCode },
    },
    { upsert: true, new: true }
  );

  return reopenIfCooldownPassed(state);
};

// One provider call made by this request, charged to the visitor's spend meter on a metered platform.
// Returns whether videos were fetched, and the limit that stopped the call, if any.
const callProviderAndCache = async ({ dbQuery, providerQuery, platform, state, spender, consumer }) => {
  const provider = PROVIDERS[platform];
  const charged = Boolean(provider.metered && spender);

  if (charged) {
    const token = await takeSpendToken(spender);

    if (!token.ok) {
      console.log(
        `🎟️ [videos:${dbQuery}] ${provider.name}: ${spender.viewer} visitor reached the ${spender.meter} limit until ${token.retryAt.toISOString()}.`
      );
      return { fetched: false, limit: { reason: "visitor_limit", retryAt: token.retryAt } };
    }
  }

  try {
    const { videos: apiVideos, nextPageToken } = await provider.search(providerQuery, state.nextPageToken, {
      maxResults: SEARCH_CANDIDATES_PER_CALL,
      consumer,
      regionCode: state.regionCode || undefined,
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

    await state.save();
    return { fetched: true, limit: null };
  } catch (error) {
    // The daily quota blocks everyone until the reset, and the ledger already enforces that. Marking the
    // search's QueryState would keep it closed for an hour after the reset too.
    if (error.quotaLimit) {
      if (charged) await refundSpendToken(spender);
      console.log(`⏳ [videos:${dbQuery}] ${provider.name}: daily quota used up until ${error.quotaLimit.retryAt.toISOString()}.`);
      return { fetched: false, limit: error.quotaLimit };
    }

    const providerError = mapProviderErrorToReason(error);

    if (!providerError) {
      throw error;
    }

    markExhausted(state, providerError.exhaustedReason);
    console.log(`⚠️ [videos:${dbQuery}] ${provider.name}: ${providerError.logMessage}`);
    await state.save();
    return { fetched: false, limit: null };
  }
};

// Grows the cache of one search and platform by one provider page, or reuses the same refill when another
// request is already making it. Returns the state to continue from and the limit that stopped this request.
const refillVideosFromApi = async ({ dbQuery, providerQuery, platform, state, spender, consumer }) => {
  if (state.exhausted) {
    return { state, limit: null };
  }

  if (PROVIDERS[platform].metered && (await Video.countDocuments({ query: dbQuery, platform })) >= MAX_METERED_VIDEOS_PER_SEARCH) {
    return { state, limit: { reason: "depth_limit", retryAt: null } };
  }

  const key = JSON.stringify([dbQuery, platform, state.nextPageToken]);
  const inFlight = inFlightRefills.get(key);

  if (inFlight) {
    const outcome = await inFlight.catch(() => ({ fetched: false }));
    // Another request fetched this page, so continue from the page token it saved. If that request was stopped
    // instead (its own visitor limit, an error), this one tries itself on its next refill cycle.
    return { state: outcome.fetched ? await getOrCreateQueryState(dbQuery, platform) : state, limit: null };
  }

  const refill = runSharedRefill(`refill:${key}`, () =>
    callProviderAndCache({ dbQuery, providerQuery, platform, state, spender, consumer })
  );
  inFlightRefills.set(key, refill);

  const forget = () => {
    if (inFlightRefills.get(key) === refill) inFlightRefills.delete(key);
  };

  refill.then(
    outcome => (outcome.fetched ? setTimeout(forget, FINISHED_REFILL_REUSE_MS).unref() : forget()),
    forget
  );

  const outcome = await refill;
  // Another process fetched the page: continue from the page token it saved.
  const reloaded = outcome.byOtherInstance && outcome.fetched ? await getOrCreateQueryState(dbQuery, platform) : state;
  return { state: reloaded, limit: outcome.limit };
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

const loadStatesByPlatform = async (query, platformsToSearch, regionCode = null) => {
  const stateEntries = await Promise.all(
    platformsToSearch.map(async currentPlatform => {
      const state = await getOrCreateQueryState(query, currentPlatform, regionCode);
      return [currentPlatform, state];
    })
  );

  return Object.fromEntries(stateEntries);
};

const refillFromApiUntilPageFilled = async ({
  dbQuery,
  providerQuery,
  platform,
  cursor,
  platformsToSearch,
  pageSize,
  spender,
  consumer,
  regionCode,
}) => {
  const statesByPlatform = await loadStatesByPlatform(dbQuery, platformsToSearch, regionCode);
  // Limits this request ran into. They stop its refills, but they are never saved to the QueryState, which is
  // shared by everyone.
  const limitsByPlatform = {};

  for (let refillCycle = 0; refillCycle < MAX_REFILL_CYCLES; refillCycle += 1) {
    const remainingInDb = await countRemainingDbVideos(dbQuery, platform, cursor);

    if (remainingInDb >= pageSize) {
      break;
    }

    const activePlatforms = platformsToSearch.filter(
      currentPlatform => !statesByPlatform[currentPlatform]?.exhausted && !limitsByPlatform[currentPlatform]
    );

    if (!activePlatforms.length) {
      break;
    }

    await Promise.all(
      activePlatforms.map(async currentPlatform => {
        const { state, limit } = await refillVideosFromApi({
          dbQuery,
          providerQuery,
          platform: currentPlatform,
          state: statesByPlatform[currentPlatform],
          spender,
          consumer,
        });

        statesByPlatform[currentPlatform] = state;
        if (limit) limitsByPlatform[currentPlatform] = limit;
      })
    );
  }

  return { statesByPlatform, limitsByPlatform };
};

// When the platform can be asked again: the end of a temporary exhaustion's cooldown, the visitor's next token,
// or the quota reset. null when there is nothing to wait for.
const getRetryAt = (state, limit) => {
  if (state?.exhausted && TEMPORARY_EXHAUSTION_REASONS.has(state.exhaustedReason) && state.exhaustedAt) {
    return new Date(state.exhaustedAt.getTime() + EXHAUSTION_RETRY_COOLDOWN_MS).toISOString();
  }

  return limit?.retryAt ? limit.retryAt.toISOString() : null;
};

/**
 * One page of a search's cached videos, refilled from the providers when it comes up short.
 * `spender` ({ identity, viewer, meter }, see utils/spendMeter.js) pays for metered calls with its tokens;
 * `consumer` is who the YouTube quota is charged to. `regionCode` is stored on a QueryState this call creates.
 */
export const fetchVideosByQuery = async ({
  query,
  cursor = null,
  platform = "all",
  limit = DEFAULT_PAGE_SIZE,
  providerQuery = null,
  spender = null,
  consumer = "user",
  regionCode = null,
}) => {
  const pageSize = normalizeLimit(limit);
  const decodedCursor = cursor ? decodeCursor(cursor) : null;
  const platformsToSearch = getPlatformsToSearch(platform);
  const filter = buildVideoFilter(query, decodedCursor, platform);
  const normalizedProviderQuery = providerQuery || query;
  let videos = await Video.find(filter).sort(SEARCH_ORDER).limit(pageSize);

  let statesByPlatform = {};
  let limitsByPlatform = {};

  if (videos.length < pageSize) {
    ({ statesByPlatform, limitsByPlatform } = await refillFromApiUntilPageFilled({
      dbQuery: query,
      providerQuery: normalizedProviderQuery,
      platform,
      cursor: decodedCursor,
      platformsToSearch,
      pageSize,
      spender,
      consumer,
      regionCode,
    }));

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
      const reason = state?.exhausted ? state.exhaustedReason || "all_videos_accessed" : limitsByPlatform[currentPlatform]?.reason;
      return [currentPlatform, reason ?? null];
    })
  );

  const retryAtByPlatform = Object.fromEntries(
    platformsToSearch.map(currentPlatform => [
      currentPlatform,
      getRetryAt(freshStates[currentPlatform], limitsByPlatform[currentPlatform]),
    ])
  );

  // A limit only stops new API calls. The cached videos after this page are still served, so hasMore turns
  // false only at the edge of the cache.
  const canStillFetchFromApi = platformsToSearch.some(
    currentPlatform => !freshStates[currentPlatform]?.exhausted && !limitsByPlatform[currentPlatform]
  );
  const hasMore = remainingAfterPage > 0 || canStillFetchFromApi;

  // The real counts only go to the server log. "shown" is how far into the cached results this page reaches.
  const cachedTotal = await countRemainingDbVideos(query, platform, null);
  const limitText = Object.entries(limitsByPlatform)
    .map(([currentPlatform, { reason }]) => ` ${currentPlatform}Limit=${reason}`)
    .join("");

  console.log(
    `ℹ️ [videos:${query}] pageSize=${pageSize} platform=${platform} returned=${videos.length} shown=${cachedTotal - remainingAfterPage} fetched=${cachedTotal} remainingInDb=${remainingAfterPage} canStillFetchFromApi=${canStillFetchFromApi} hasMore=${hasMore}${limitText}`
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
    retryAtByPlatform,
    // Videos already in the DB after this page, capped at the largest page size. That's enough for the frontend
    // to know whether the next page needs an API call, without telling every visitor how much is cached.
    cachedAhead: Math.min(remainingAfterPage, MAX_PAGE_SIZE),
  };
};
/**
 * Fetches one more provider page for a search that is already cached, however much of it is cached. The trend
 * crawler uses it when a cached search is spiking, so the people scrolling it hit the cache instead of spending
 * their own meters. Shares refills in flight and respects the depth cap like any refill.
 */
// Returns the limit that stopped it, if any.
export const growCachedSearch = async ({ dbQuery, providerQuery, platform, consumer }) => {
  const state = await getOrCreateQueryState(dbQuery, platform);
  const { limit } = await refillVideosFromApi({ dbQuery, providerQuery, platform, state, spender: null, consumer });

  return { limit };
};
