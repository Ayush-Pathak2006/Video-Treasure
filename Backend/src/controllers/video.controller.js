import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { fetchVideosByQuery } from "../services/videoFetch.service.js";
import { resolveCachedSearchIntent, resolveSearchIntent } from "../utils/nicheResolver.js";
import { findSimilarCachedSearch } from "../utils/similarSearch.js";

const searchVideos = asyncHandler(async (req, res) => {
  const { q: query, cursor, platform = "all", limit, exact } = req.query;

  if (!query) {
    throw new ApiError(400, "Search query is required");
  }

  let intent = resolveSearchIntent(query);

  // A search with nothing cached reuses a cached search that means the same ("shape of you song",
  // "sape of yuo" -> "shape of you") instead of paying for a new API search. exact=true searches the text as typed.
  const similarQuery = !intent.niche && exact !== "true" ? await findSimilarCachedSearch(intent.dbQuery) : null;

  if (similarQuery) {
    intent = resolveCachedSearchIntent(similarQuery);
  }

  const { videos, byPlatform, nextCursor, hasMore, terminalReasonByPlatform, cachedAhead } = await fetchVideosByQuery({
    query: intent.dbQuery,
    cursor,
    platform,
    limit,
    providerQuery: intent.providerQuery,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        videos,
        byPlatform,
        nextCursor,
        hasMore,
        terminalReasonByPlatform,
        cachedAhead,
        matchedNiche: intent.niche,
        // The cache key these results belong to. Later pages must ask for this key, not the typed text.
        resolvedQuery: intent.dbQuery,
        similarMatch: Boolean(similarQuery),
      },
      "Videos fetched successfully"
    )
  );
});

export { searchVideos };
