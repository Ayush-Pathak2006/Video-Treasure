import { fetchVideosByQuery } from "../services/videoFetch.service.js";

const searchVideos = async (req, res) => {
  const { q: query, cursor, platform = "all" } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Search query is required" });
  }

  try {
    const { videos, byPlatform, nextCursor, hasMore, terminalReasonByPlatform } =
      await fetchVideosByQuery(query, cursor, platform);

    return res.status(200).json({
      data: {
        videos,
        byPlatform,
        nextCursor,
        hasMore,
        terminalReasonByPlatform,
      },
    });
  } catch (error) {
    if (error.message.includes("Unsupported platform")) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
};

export { searchVideos };