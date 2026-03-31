import axios from "axios";

const DAILYMOTION_SEARCH_API = "https://api.dailymotion.com/videos";
const DAILYMOTION_TOKEN_API = "https://api.dailymotion.com/oauth/token";
const PAGE_SIZE = 12;

let cachedToken = null;
let tokenExpiresAt = 0;

const getDailymotionToken = async () => {
  const apiKey = process.env.DAILYMOTION_API_KEY;
  const clientSecret = process.env.DAILYMOTION_CLIENT_SECRET;

  if (!apiKey || !clientSecret) {
    return null;
  }

  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: apiKey,
    client_secret: clientSecret,
    scope: "read",
  });

  const response = await axios.post(DAILYMOTION_TOKEN_API, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  cachedToken = response.data.access_token;
  tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;

  return cachedToken;
};

export const searchDailymotion = async (query, page = null, options = {}) => {
  const pageNumber = page ? Number(page) : 1;
  const token = await getDailymotionToken();
  const params = {
    search: query,
    limit: options.maxResults || PAGE_SIZE,
    page: pageNumber,
    fields: "id,title,description,thumbnail_url,created_time,channel,views_total,likes_total",
  };

  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await axios.get(DAILYMOTION_SEARCH_API, { params, headers });

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
    views: Number(item.views_total) || 0,
    likes: Number(item.likes_total) || 0,
  }));

  const hasExplicitMore = Boolean(response.data.has_more);
  const hasNextBySize = list.length === (options.maxResults || PAGE_SIZE);

  return {
    videos,
    nextPageToken: hasExplicitMore || hasNextBySize ? String(pageNumber + 1) : null,
  };
};