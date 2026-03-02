import { Video } from "../models/video.model.js";
import { QueryState } from "../models/queryState.model.js";
import { searchYouTube } from "../providers/youtube.provider.js";
import { searchDailymotion } from "../providers/dailymotion.provider.js";

const PAGE_SIZE = 12;
const API_REFILL_THRESHOLD = 5;
const SUPPORTED_PLATFORMS = ["youtube", "dailymotion"];

const PROVIDERS = {
  youtube: { name: "YouTube", search: searchYouTube },
  dailymotion: { name: "Dailymotion", search: searchDailymotion },
};

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
  query,
  ...(platformFilter !== "all" && { platform: platformFilter }),
  ...(cursorDate && { publishedAt: { $lt: cursorDate } }),
});

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

const refillVideosFromApi = async (query, platform, state) => {
  const provider = PROVIDERS[platform];

  if (state.exhausted) {
    console.log(`ℹ️ [videos:${query}] ${provider.name} exhausted (${state.exhaustedReason || "unknown"}).`);
    return state;
  }

  try {
    const { videos: apiVideos, nextPageToken } = await provider.search(query, state.nextPageToken);

    if (apiVideos.length > 0) {
      await Video.insertMany(apiVideos, { ordered: false }).catch(() => {});
    }

    if (nextPageToken) {
      state.nextPageToken = nextPageToken;
      console.log(`📡 [videos:${query}] ${provider.name}: fetched ${apiVideos.length} videos.`);
    } else {
      state.exhausted = true;
      state.exhaustedReason = "all_videos_accessed";
      console.log(`🛑 [videos:${query}] ${provider.name}: all videos for this query are accessed.`);
    }
  } catch (error) {
    const providerError = mapProviderErrorToReason(error);

    if (providerError) {
      state.exhausted = true;
      state.exhaustedReason = providerError.exhaustedReason;
      console.log(`⚠️ [videos:${query}] ${provider.name}: ${providerError.logMessage}`);
    } else {
      throw error;
    }
  }

  await state.save();
  return state;
};

const groupVideosByPlatform = videos =>
  videos.reduce(
    (acc, video) => {
      acc[video.platform].push(video);
      return acc;
    },
    { youtube: [], dailymotion: [] }
  );

export const fetchVideosByQuery = async (query, cursor = null, platform = "all") => {
  const cursorDate = cursor ? new Date(cursor) : null;
  const platformsToSearch = getPlatformsToSearch(platform);
  const filter = buildVideoFilter(query, cursorDate, platform);

  const remainingCount = await Video.countDocuments(filter);
  let statesByPlatform = {};

  if (remainingCount < API_REFILL_THRESHOLD) {
    const stateEntries = await Promise.all(
      platformsToSearch.map(async currentPlatform => {
        let state = await getOrCreateQueryState(query, currentPlatform);
        state = await refillVideosFromApi(query, currentPlatform, state);
        return [currentPlatform, state];
      })
    );

    statesByPlatform = Object.fromEntries(stateEntries);
  }

  const videos = await Video.find(filter).sort({ publishedAt: -1 }).limit(PAGE_SIZE);
  const nextCursor = videos.length > 0 ? videos[videos.length - 1].publishedAt : null;

  const freshStates =
    Object.keys(statesByPlatform).length > 0
      ? statesByPlatform
      : Object.fromEntries(
          (
            await QueryState.find({
              query,
              platform: { $in: platformsToSearch },
            })
          ).map(state => [state.platform, state])
        );

  const terminalReasonByPlatform = Object.fromEntries(
    platformsToSearch.map(currentPlatform => {
      const state = freshStates[currentPlatform];
      return [currentPlatform, state?.exhausted ? state.exhaustedReason || "all_videos_accessed" : null];
    })
  );

  const allSelectedPlatformsExhausted = platformsToSearch.every(currentPlatform => {
    const state = freshStates[currentPlatform];
    return Boolean(state?.exhausted);
  });

  const hasMore = Boolean(nextCursor) && (!allSelectedPlatformsExhausted || videos.length === PAGE_SIZE);

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
