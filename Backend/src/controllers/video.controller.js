import { fetchVideosByQuery } from "../services/videoFetch.service.js";
import { resolveSearchIntent } from "../utils/nicheResolver.js";
const searchVideos = async (req, res) => {
  const { q: query, cursor, platform = "all", limit } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Search query is required" });
  }

  try {
    const intent = resolveSearchIntent(query);

    const { videos, byPlatform, nextCursor, hasMore, terminalReasonByPlatform } = await fetchVideosByQuery({
      query: intent.dbQuery,
      cursor,
      platform,
      limit,
      providerQuery: intent.providerQuery,
    });

    return res.status(200).json({
      data: {
        videos,
        byPlatform,
        nextCursor,
        hasMore,
        terminalReasonByPlatform,
        matchedNiche: intent.niche,
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