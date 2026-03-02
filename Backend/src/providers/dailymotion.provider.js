import axios from "axios";

const DAILYMOTION_SEARCH_API = "https://api.dailymotion.com/videos";
const PAGE_SIZE = 12;

export const searchDailymotion = async (query, page = null) => {
  const pageNumber = page ? Number(page) : 1;
  const params = {
    search: query,
    limit: PAGE_SIZE,
    page: pageNumber,
    fields: "id,title,description,thumbnail_url,created_time,channel",
  };

  const response = await axios.get(DAILYMOTION_SEARCH_API, { params });

  const list = response.data.list ?? [];
  const videos = list.map(item => ({
    platform: "dailymotion",
    platformVideoId: item.id,
    query,
    title: item.title,
    description: item.description,
    thumbnail: item.thumbnail_url,
    channelTitle: item.channel || "Dailymotion",
    publishedAt: new Date(item.created_time * 1000),
  }));

  const hasExplicitMore = Boolean(response.data.has_more);
  const hasNextBySize = list.length === PAGE_SIZE;
  const hasMore = hasExplicitMore || hasNextBySize;

  return {
    videos,
    nextPageToken: hasMore ? String(pageNumber + 1) : null,
  };
};