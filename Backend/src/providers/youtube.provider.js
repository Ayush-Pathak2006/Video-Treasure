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

const getStatisticsMap = async videoIds => {
  if (!videoIds.length) {
    return new Map();
  }

  const response = await axios.get(YOUTUBE_VIDEOS_API, {
    params: {
      key: process.env.YOUTUBE_API_KEY,
      part: "statistics",
      id: videoIds.join(","),
      maxResults: 50,
    },
  });

  const statsMap = new Map();

  for (const item of response.data.items || []) {
    statsMap.set(item.id, {
      views: Number(item.statistics?.viewCount) || 0,
      likes: Number(item.statistics?.likeCount) || 0,
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
    const stats = statsMap.get(id) || { views: 0, likes: 0 };

    return {
      platform: "youtube",
      platformVideoId: id,
      query,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      views: stats.views,
      likes: stats.likes,
    };
  });

  return {
    videos,
    nextPageToken: response.data.nextPageToken,
  };
};