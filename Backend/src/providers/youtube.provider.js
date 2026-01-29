import axios from "axios";

const YOUTUBE_SEARCH_API = "https://www.googleapis.com/youtube/v3/search";

export const searchYouTube = async (query, pageToken = null) => {
  const params = {
    key: process.env.YOUTUBE_API_KEY,
    part: "snippet",
    q: query,
    type: "video",
    maxResults: 12,
  };

  if (pageToken) params.pageToken = pageToken;

  const response = await axios.get(YOUTUBE_SEARCH_API, { params });

  const videos = response.data.items.map(item => ({
    platform: "youtube",
    platformVideoId: item.id.videoId,
    query,
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnail: item.snippet.thumbnails.high.url,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
  }));

  return {
    videos,
    nextPageToken: response.data.nextPageToken,
  };
};
