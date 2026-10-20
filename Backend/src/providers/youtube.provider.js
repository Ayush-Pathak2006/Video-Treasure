import axios from "axios";
import { getNextResetTime, markBucketSpent, reserveQuota } from "../utils/quotaTracker.js";
import { getStubResponse } from "./youtube.stub.js";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

// YOUTUBE_MODE=stub answers with canned results (see youtube.stub.js). A missing value means live, so
// production keeps calling YouTube.
const isStubMode = () => process.env.YOUTUBE_MODE === "stub";

// Thrown when the day's quota (or the consumer's share of it) is used up. videoFetch.service.js returns it
// as the response's terminal reason and leaves the search's QueryState alone.
const buildDailyLimitError = retryAt => {
  const error = new Error("YouTube's daily quota is used up.");
  error.response = { status: 429 };
  error.quotaLimit = { reason: "daily_limit", retryAt };
  return error;
};

// Google lists the reasons in error.errors (and in error.details in newer responses).
const isQuotaExceeded = error => {
  const body = error.response?.data?.error;
  const reasons = [...(body?.errors || []), ...(body?.details || [])].map(entry => entry.reason);
  return error.response?.status === 403 && reasons.includes("quotaExceeded");
};

// One Data API call. The quota is reserved by the caller, before this runs, in stub mode too, so local runs
// exercise the same limits.
const callYouTube = async (method, params, bucket) => {
  try {
    if (isStubMode()) {
      return { data: getStubResponse(method, params) };
    }

    return await axios.get(`${YOUTUBE_API}/${method}`, { params: { ...params, key: process.env.YOUTUBE_API_KEY } });
  } catch (error) {
    if (isQuotaExceeded(error)) {
      await markBucketSpent(bucket);
      throw buildDailyLimitError(getNextResetTime());
    }

    throw error;
  }
};

// search.list returns HTML-escaped text ("Tom &amp; Jerry").
const HTML_ENTITIES = { amp: "&", quot: '"', "#39": "'", lt: "<", gt: ">" };
const decodeHtmlEntities = text => (text || "").replace(/&(amp|quot|#39|lt|gt);/g, (_, entity) => HTML_ENTITIES[entity]);

// ISO 8601 duration ("PT4M13S") to seconds; null for anything else.
const parseDurationSeconds = isoDuration => {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(isoDuration || "");

  if (!match) return null;

  const [days, hours, minutes, seconds] = match.slice(1).map(part => Number(part) || 0);
  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
};

// One videos.list call (1 general unit, charged to `consumer`), by ids (up to 50) or by chart. Throws the
// daily_limit error when the general bucket is used up.
const listVideos = async (params, consumer) => {
  const reservation = await reserveQuota({ bucket: "general", units: 1, consumer });

  if (!reservation.ok) {
    throw buildDailyLimitError(reservation.retryAt);
  }

  const response = await callYouTube("videos", { maxResults: 50, ...params }, "general");
  return response.data.items || [];
};

const toStats = item => ({
  views: Number(item.statistics?.viewCount) || 0,
  likes: Number(item.statistics?.likeCount) || 0,
  durationSeconds: parseDurationSeconds(item.contentDetails?.duration),
});

// A videos.list item in the Video shape. Unlike search.list, videos.list doesn't HTML-escape its text. Fields
// missing from the item (no snippet part) stay undefined.
const toVideoFromDetails = item => {
  const { views, likes, durationSeconds } = toStats(item);

  return {
    platform: "youtube",
    platformVideoId: item.id,
    title: item.snippet?.title,
    description: item.snippet?.description,
    thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url,
    channelTitle: item.snippet?.channelTitle,
    publishedAt: item.snippet?.publishedAt,
    views,
    likes,
    // Read by rankByRelevance; not stored.
    rankingHints: { durationSeconds },
  };
};

// Views, likes and duration feed the ranking, but the search call is already paid for by now. If the stats
// call is denied or fails, the videos are still returned, with 0 views.
const getStatisticsMap = async (videoIds, consumer) => {
  if (!videoIds.length) {
    return new Map();
  }

  try {
    const items = await listVideos({ part: "statistics,contentDetails", id: videoIds.join(",") }, consumer);
    return new Map(items.map(item => [item.id, toStats(item)]));
  } catch (error) {
    console.log(`⚠️ [youtube] statistics call failed, keeping the results without stats: ${error.message}`);
    return new Map();
  }
};

/**
 * Current details of up to 50 videos by id: one videos.list call (1 general unit). A video missing from the
 * returned Map was deleted or made private. `embeddable: false` means the app can no longer play it.
 */
export const getYouTubeVideoDetails = async (videoIds, { consumer = "refresh" } = {}) => {
  const items = await listVideos({ part: "snippet,statistics,contentDetails,status", id: videoIds.join(",") }, consumer);
  return new Map(items.map(item => [item.id, { ...toVideoFromDetails(item), embeddable: item.status?.embeddable !== false }]));
};

/**
 * YouTube's trending chart for a region (videos.list?chart=mostPopular): one call, 1 general unit, no search
 * call. `videoCategoryId` narrows it to one category. Only embeddable videos are returned.
 */
export const getYouTubeChart = async ({ regionCode, videoCategoryId = null, consumer = "trendCrawler" }) => {
  const items = await listVideos(
    {
      part: "snippet,statistics,contentDetails,status",
      chart: "mostPopular",
      regionCode,
      ...(videoCategoryId && { videoCategoryId }),
    },
    consumer
  );

  return items.filter(item => item.status?.embeddable !== false).map(toVideoFromDetails);
};

/**
 * One search.list call (one of the day's search calls, charged to `consumer`) plus one videos.list call for
 * the stats (1 general unit). Throws the daily_limit error when the ledger denies the search call or YouTube
 * says the quota is used up. `publishedAfter` (a Date) returns only newer videos; `regionCode` ("IN") only
 * videos viewable in that country.
 */
export const searchYouTube = async (query, pageToken = null, options = {}) => {
  const { maxResults = 12, consumer = "user", publishedAfter, regionCode } = options;

  const params = {
    part: "snippet",
    q: query,
    type: "video",
    // The app plays everything in an embed, where a non-embeddable video only shows "Video unavailable".
    videoEmbeddable: "true",
    maxResults,
  };

  if (pageToken) params.pageToken = pageToken;
  if (publishedAfter) params.publishedAfter = new Date(publishedAfter).toISOString();
  if (regionCode) params.regionCode = regionCode;

  const reservation = await reserveQuota({ bucket: "search", units: 1, consumer });

  if (!reservation.ok) {
    throw buildDailyLimitError(reservation.retryAt);
  }

  const response = await callYouTube("search", params, "search");
  const items = response.data.items || [];
  const videoIds = items.map(item => item.id.videoId).filter(Boolean);
  const statsMap = await getStatisticsMap(videoIds, consumer);

  const videos = items.map(item => {
    const id = item.id.videoId;
    const stats = statsMap.get(id) || { views: 0, likes: 0, durationSeconds: null };

    return {
      platform: "youtube",
      platformVideoId: id,
      query,
      title: decodeHtmlEntities(item.snippet.title),
      description: decodeHtmlEntities(item.snippet.description),
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      channelTitle: decodeHtmlEntities(item.snippet.channelTitle),
      publishedAt: item.snippet.publishedAt,
      views: stats.views,
      likes: stats.likes,
      // Read by rankByRelevance; not stored.
      rankingHints: { durationSeconds: stats.durationSeconds },
    };
  });

  return {
    videos,
    nextPageToken: response.data.nextPageToken,
  };
};
