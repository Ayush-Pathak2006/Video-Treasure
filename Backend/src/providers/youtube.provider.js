import axios from "axios";

const YOUTUBE_SEARCH_API = "https://www.googleapis.com/youtube/v3/search";

const YOUTUBE_VIDEOS_API = "https://www.googleapis.com/youtube/v3/videos";

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

  const response = await axios.get(YOUTUBE_SEARCH_API, { params });
  const items = response.data.items || [];
  const videoIds = items.map(item => item.id.videoId).filter(Boolean);
  const statsMap = await getStatisticsMap(videoIds);

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
