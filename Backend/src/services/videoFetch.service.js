import { Video } from "../models/video.model.js";
import { QueryState } from "../models/queryState.model.js";
import { searchYouTube } from "../providers/youtube.provider.js";

const PAGE_SIZE = 12;
const API_REFILL_THRESHOLD = 5;

export const fetchVideosByQuery = async (query, cursor = null) => {
  // 1️⃣ Build DB filter
  const filter = { query };

  if (cursor) {
    filter.publishedAt  = { $lt: new Date(cursor) };
  }

  // 2️⃣ Count remaining DB videos
  const remainingCount = await Video.countDocuments({
  query,
  ...(cursor && { createdAt: { $lt: new Date(cursor) } })
});


  // 3️⃣ Hydrate from API if DB is running low
  if (remainingCount < API_REFILL_THRESHOLD) {
    let state = await QueryState.findOne({ query, platform: "youtube" });

    if (!state) {
      state = await QueryState.create({ query });
    }

    if (!state.exhausted) {
      const { videos: apiVideos, nextPageToken } =
        await searchYouTube(query, state.nextPageToken);

      if (apiVideos.length > 0) {
        await Video.insertMany(apiVideos, { ordered: false }).catch(() => {});
      }

      if (nextPageToken) {
        state.nextPageToken = nextPageToken;
      } else {
        // No more pages in YouTube
        state.exhausted = true;
      }

      await state.save();

      console.log("📡 Fetching YouTube page:", state.nextPageToken);

    }
  }

  // 4️⃣ Fetch DB page
  const videos = await Video.find(filter)
    .sort({ publishedAt: -1 })
    .limit(PAGE_SIZE);

  // 5️⃣ Cursor logic
  const nextCursor =
    videos.length === PAGE_SIZE
      ? videos[videos.length - 1].publishedAt
      : null;

  return {
  videos,
  nextCursor,
  hasMore:
    nextCursor !== null || !state.exhausted
};

};
