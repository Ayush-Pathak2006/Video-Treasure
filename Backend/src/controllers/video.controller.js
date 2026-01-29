import { fetchVideosByQuery } from "../services/videoFetch.service.js";

const searchVideos = async (req, res) => {
  const { q: query, cursor } = req.query; // ✅ correct params

  if (!query) {
    return res.status(400).json({ error: "Search query is required" });
  }

  const { videos, nextCursor } = await fetchVideosByQuery(query, cursor);

  return res.status(200).json({
    data: {
      videos,
      nextCursor,
    },
  });
};

export { searchVideos };
