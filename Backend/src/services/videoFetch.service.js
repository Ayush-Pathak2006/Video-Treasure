import { Video } from "../models/video.model.js";
import { QueryState } from "../models/queryState.model.js";
import { searchYouTube } from "../providers/youtube.provider.js";
import { searchDailymotion } from "../providers/dailymotion.provider.js";

const PAGE_SIZE = 12;
const API_REFILL_THRESHOLD = 5;
const SUPPORTED_PLATFORMS = ["youtube", "dailymotion"];

const PROVIDERS = {
  youtube: {
    name: "YouTube",
    search: searchYouTube,
  },
  dailymotion: {
    name: "Dailymotion",
    search: searchDailymotion,
  },
};
const buildVideoFilter = (query, cursorDate) => ({
  query,
  ...(cursorDate && { publishedAt: { $lt: cursorDate } }),
});

const getOrCreateQueryState = async (query, platform) => {
  const existingState = await QueryState.findOne({
    query,
    platform,
  });

  if (existingState) {
    return existingState;
  }
  return QueryState.create({ query, platform });
};

const refillVideosFromApi = async (query, platform, state) => {
  const provider = PROVIDERS[platform];
  if (state.exhausted) {
    console.log(
      `ℹ️ [videos:${query}] ${provider.name} source exhausted. Serving from DB only.`
    );
    return state;
  }

  const { videos: apiVideos, nextPageToken } = await provider.search(
    query,
    state.nextPageToken
  );

  if (apiVideos.length > 0) {
    await Video.insertMany(apiVideos, { ordered: false }).catch(() => {});
  }
  if (nextPageToken) {
    state.nextPageToken = nextPageToken;
    console.log(
       `📡 [videos:${query}] Fetched ${apiVideos.length} videos from ${provider.name}. Next page token available.`
    );
  } else {
    state.exhausted = true;
    console.log(
       `🛑 [videos:${query}] ${provider.name} returned no nextPageToken. All available pages fetched.`
    );
  }
  await state.save();
  return state;
};

export const fetchVideosByQuery = async (query, cursor = null) => {
  const cursorDate = cursor ? new Date(cursor) : null;
  const filter = buildVideoFilter(query, cursorDate);
  const remainingCount = await Video.countDocuments(filter);
  let statesByPlatform = {};

  if (remainingCount < API_REFILL_THRESHOLD) {
    const stateEntries = await Promise.all(
      SUPPORTED_PLATFORMS.map(async platform => {
        let state = await getOrCreateQueryState(query, platform);
        state = await refillVideosFromApi(query, platform, state);
        return [platform, state];
      })
    );

    statesByPlatform = Object.fromEntries(stateEntries);
  }

  const videos = await Video.find(filter)
    .sort({ publishedAt: -1 })
    .limit(PAGE_SIZE);
    const nextCursor =
    videos.length > 0 ? videos[videos.length - 1].publishedAt : null;
  const allSourcesExhausted =
    Object.keys(statesByPlatform).length > 0 &&
    Object.values(statesByPlatform).every(state => state.exhausted);
  const hasMore =
    Boolean(nextCursor) && (!allSourcesExhausted || videos.length === PAGE_SIZE);

  if (!hasMore) {
    console.log(`✅ [videos:${query}] No more videos available for infinite scroll.`);
  }
  return {
    videos,
    nextCursor,
    hasMore,
  };
};