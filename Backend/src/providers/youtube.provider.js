import axios from "axios";
import { canConsumeQuotaUnits, consumeQuotaUnits } from "../utils/quotaTracker.js";

const YOUTUBE_SEARCH_API = "https://www.googleapis.com/youtube/v3/search";

const YOUTUBE_VIDEOS_API = "https://www.googleapis.com/youtube/v3/videos";

const YOUTUBE_SEARCH_COST_UNITS = 100;
const YOUTUBE_VIDEOS_COST_UNITS = 1;

const buildQuotaError = () => {
  const error = new Error("YouTube quota budget reserved for users.");
  error.response = { status: 429 };
  return error;
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

const getStatisticsMap = async videoIds => {
  if (!videoIds.length) {
    return new Map();
  }

  const response = await axios.get(YOUTUBE_VIDEOS_API, {
    params: {
      key: process.env.YOUTUBE_API_KEY,
      part: "statistics,contentDetails",
      id: videoIds.join(","),
      maxResults: 50,
    },
  });

  const statsMap = new Map();

  for (const item of response.data.items || []) {
    statsMap.set(item.id, {
      views: Number(item.statistics?.viewCount) || 0,
      likes: Number(item.statistics?.likeCount) || 0,
      durationSeconds: parseDurationSeconds(item.contentDetails?.duration),
    });
  }

  return statsMap;
};

export const searchYouTube = async (query, pageToken = null, options = {}) => {
  const params = {
    key: process.env.YOUTUBE_API_KEY,
    part: "snippet",
    q: query,
    type: "video",
    // The app plays everything in an embed, where a non-embeddable video only shows "Video unavailable".
    videoEmbeddable: "true",
    maxResults: options.maxResults || 12,
  };

  if (pageToken) params.pageToken = pageToken;

  const estimatedUnits = YOUTUBE_SEARCH_COST_UNITS + YOUTUBE_VIDEOS_COST_UNITS;

  if (!canConsumeQuotaUnits(estimatedUnits)) {
    throw buildQuotaError();
  }

  consumeQuotaUnits({ units: YOUTUBE_SEARCH_COST_UNITS, reason: "youtube.search" });
  const response = await axios.get(YOUTUBE_SEARCH_API, { params });
  const items = response.data.items || [];
  const videoIds = items.map(item => item.id.videoId).filter(Boolean);

  let statsMap = new Map();

  if (videoIds.length > 0) {
    if (!canConsumeQuotaUnits(YOUTUBE_VIDEOS_COST_UNITS)) {
      throw buildQuotaError();
    }

    consumeQuotaUnits({ units: YOUTUBE_VIDEOS_COST_UNITS, reason: "youtube.videos.statistics" });
    statsMap = await getStatisticsMap(videoIds);
  }

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