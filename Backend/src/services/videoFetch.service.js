import { Video } from "../models/video.model.js";
import { searchYouTube } from "../providers/youtube.provider.js";

const PAGE_SIZE = 12;

export const fetchVideosByQuery = async (query, cursor = null) => {
  // 🔹 Step 1: Build DB filter
  const filter = { query };

  if (cursor) {
    filter.createdAt = { $lt: new Date(cursor) };
  }

  // 🔹 Step 2: Fetch from DB
  let videos = await Video.find(filter)
    .sort({ createdAt: -1 })
    .limit(PAGE_SIZE);

  // 🔹 Step 3: If DB is empty (first page only), hydrate cache
  if (!cursor && videos.length < PAGE_SIZE) {
    const { videos: apiVideos } = await searchYouTube(query);

    if (apiVideos.length) {
      await Video.insertMany(apiVideos, { ordered: false }).catch(() => {});
    }

    videos = await Video.find({ query })
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE);
  }

  // 🔹 Step 4: Cursor for next page
  const nextCursor =
    videos.length === PAGE_SIZE
      ? videos[videos.length - 1].createdAt
      : null;

  return {
    videos,
    nextCursor,
  };
};
