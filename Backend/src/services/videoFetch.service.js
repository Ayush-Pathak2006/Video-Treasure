import { Video } from "../models/video.model.js";
import { QueryState } from "../models/queryState.model.js";
import { searchYouTube } from "../providers/youtube.provider.js";

const PAGE_SIZE = 12;
const API_REFILL_THRESHOLD = 5;
const YOUTUBE_PLATFORM = "youtube";

const buildVideoFilter = (query, cursorDate) => ({
  query,
  ...(cursorDate && { publishedAt: { $lt: cursorDate } }),
});

const getOrCreateQueryState = async query => {
  const existingState = await QueryState.findOne({
    query,
    platform: YOUTUBE_PLATFORM,
  });

  if (existingState) {
    return existingState;
  }
  return QueryState.create({ query, platform: YOUTUBE_PLATFORM });
};

const refillVideosFromApi = async (query, state) => {
  if (state.exhausted) {
    console.log(`ℹ️ [videos:${query}] YouTube source exhausted. Serving from DB only.`);
    return state;
  }

  const { videos: apiVideos, nextPageToken } = await searchYouTube(
    query,
    state.nextPageToken
  );

  if (apiVideos.length > 0) {
    await Video.insertMany(apiVideos, { ordered: false }).catch(() => {});
  }
  if (nextPageToken) {
    state.nextPageToken = nextPageToken;
    console.log(
      `📡 [videos:${query}] Fetched ${apiVideos.length} videos from YouTube. Next page token available.`
    );
  } else {
    state.exhausted = true;
    console.log(
      `🛑 [videos:${query}] YouTube returned no nextPageToken. All available pages fetched.`
    );
  }
  await state.save();
  return state;
};

export const fetchVideosByQuery = async (query, cursor = null) => {
  const cursorDate = cursor ? new Date(cursor) : null;
  const filter = buildVideoFilter(query, cursorDate);
  const remainingCount = await Video.countDocuments(filter);
  let state = await QueryState.findOne({ query, platform: YOUTUBE_PLATFORM });
  if (remainingCount < API_REFILL_THRESHOLD) {
    state = await getOrCreateQueryState(query);
    state = await refillVideosFromApi(query, state);
  }
  const videos = await Video.find(filter)
    .sort({ publishedAt: -1 })
    .limit(PAGE_SIZE);
    const nextCursor = videos.length > 0 ? videos[videos.length - 1].publishedAt : null;
    const hasMore = Boolean(nextCursor) && (!state?.exhausted || videos.length === PAGE_SIZE);

  if (!hasMore) {
    console.log(`✅ [videos:${query}] No more videos available for infinite scroll.`);
  }
  return {
    videos,
    nextCursor,
    hasMore,
  };
};