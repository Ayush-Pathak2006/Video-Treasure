// Trend detection for India (services/trendCrawler.service.js).
export const TREND_REGION = "IN";

// Trending videos are cached under "trending:<region>", not under a search key. These rows get no searchRank,
// so search, the similar-search index and the startup rank backfill never treat them as a search.
export const TRENDING_KEY_PREFIX = "trending:";
export const getTrendingKey = region => `${TRENDING_KEY_PREFIX}${region.toLowerCase()}`;

// YouTube's chart (videos.list?chart=mostPopular) only holds trending Music, Movies and Gaming since YouTube
// retired its Trending page in July 2025. One category is polled per tick, rotating. `id: null` is the chart
// without a category. A category YouTube doesn't chart for the region fails or comes back empty and is skipped;
// confirm the list for IN with a few general units before relying on it.
export const YOUTUBE_CHART_CATEGORIES = [
  { id: null, name: "all" },
  { id: "10", name: "music" },
  { id: "20", name: "gaming" },
  { id: "1", name: "film" },
];

// How many trending videos the rail gets per platform.
export const TRENDING_RAIL_SIZE = 24;
