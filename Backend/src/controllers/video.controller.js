import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { fetchVideosByQuery } from "../services/videoFetch.service.js";
import { getTrendingVideos as readTrendingVideos } from "../services/trending.service.js";
import { SUPPORTED_PLATFORMS } from "../providers/provider.registry.js";
import { TREND_REGION } from "../config/trends.config.js";
import { normalizeSearchText, resolveCachedSearchIntent, resolveSearchIntent } from "../utils/nicheResolver.js";
import { findSimilarCachedSearch } from "../utils/similarSearch.js";
import { buildSpender } from "../utils/spendMeter.js";
import { recordSearchEvent } from "../utils/searchLog.js";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
// Any script's letters or digits, so Hindi or Japanese searches pass.
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

const searchVideos = asyncHandler(async (req, res) => {
  const { q: query, cursor, platform = "all", limit, exact } = req.query;
  // A repeated ?q= arrives as an array.
  const normalizedQuery = typeof query === "string" ? normalizeSearchText(query) : "";

  if (!normalizedQuery) {
    throw new ApiError(400, "Search query is required");
  }

  if (
    normalizedQuery.length < MIN_QUERY_LENGTH ||
    normalizedQuery.length > MAX_QUERY_LENGTH ||
    !HAS_LETTER_OR_DIGIT.test(normalizedQuery)
  ) {
    throw new ApiError(
      400,
      `Search for ${MIN_QUERY_LENGTH} to ${MAX_QUERY_LENGTH} characters, with at least one letter or number.`
    );
  }

  let intent = resolveSearchIntent(query);

  // A search with nothing cached reuses a cached search that means the same ("shape of you song",
  // "sape of yuo" -> "shape of you") instead of paying for a new API search. exact=true searches the text as typed.
  const similarQuery = !intent.niche && exact !== "true" ? await findSimilarCachedSearch(intent.dbQuery) : null;

  if (similarQuery) {
    intent = resolveCachedSearchIntent(similarQuery);
  }

  // Who pays for this request's YouTube calls: the logged-in user, or the visitor's IP.
  const spender = buildSpender({ user: req.user, ip: req.ip, cursor });

  // First pages feed trend detection. The frontend asks once per platform, so only the YouTube (or "all")
  // request is logged. Not awaited: logging must never slow a search down.
  if (!cursor && platform !== "dailymotion") {
    recordSearchEvent({ key: intent.dbQuery, ip: req.ip });
  }

  const { videos, byPlatform, nextCursor, hasMore, terminalReasonByPlatform, retryAtByPlatform, cachedAhead } =
    await fetchVideosByQuery({
      query: intent.dbQuery,
      cursor,
      platform,
      limit,
      providerQuery: intent.providerQuery,
      spender,
    });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        videos,
        byPlatform,
        nextCursor,
        hasMore,
        // Also "visitor_limit" or "daily_limit" for YouTube; retryAtByPlatform says when to try again.
        terminalReasonByPlatform,
        retryAtByPlatform,
        cachedAhead,
        matchedNiche: intent.niche,
        // The cache key these results belong to. Later pages must ask for this key, not the typed text.
        resolvedQuery: intent.dbQuery,
        similarMatch: Boolean(similarQuery),
        // Which limits applied. "anonymous" while AppContext has a user means the access token expired.
        viewer: spender.viewer,
      },
      "Videos fetched successfully"
    )
  );
});

// GET /videos/trending?platform=youtube|dailymotion (default: both). Served from the stored snapshots only.
const getTrendingVideos = asyncHandler(async (req, res) => {
  const { platform = "all" } = req.query;

  if (platform !== "all" && !SUPPORTED_PLATFORMS.includes(platform)) {
    throw new ApiError(400, `Unsupported platform: ${platform}`);
  }

  const platforms = platform === "all" ? SUPPORTED_PLATFORMS : [platform];
  const results = await Promise.all(platforms.map(readTrendingVideos));
  const updatedAt = results.reduce((latest, result) => (result.updatedAt && (!latest || result.updatedAt > latest) ? result.updatedAt : latest), null);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        region: TREND_REGION,
        byPlatform: Object.fromEntries(platforms.map((current, index) => [current, results[index].videos])),
        updatedAt,
      },
      "Trending videos fetched successfully"
    )
  );
});

export { searchVideos, getTrendingVideos };
