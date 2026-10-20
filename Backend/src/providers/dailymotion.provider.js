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

// "channel" would be the category ("music", "news"); the uploader is owner.screenname.
const VIDEO_FIELDS =
  "id,title,description,thumbnail_url,created_time,owner.screenname,owner.verified,duration,views_total,likes_total";

const getVideos = async params => {
  const token = await getDailymotionToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await axios.get(DAILYMOTION_SEARCH_API, { params: { ...params, fields: VIDEO_FIELDS }, headers });
  return response.data;
};

const toVideo = (item, query) => ({
  platform: "dailymotion",
  platformVideoId: item.id,
  query,
  title: item.title,
  description: item.description,
  thumbnail: item.thumbnail_url,
  channelTitle: item["owner.screenname"] || "Dailymotion",
  publishedAt: new Date(item.created_time * 1000),
  views: Number(item.views_total) || 0,
  likes: Number(item.likes_total) || 0,
  // Read by rankByRelevance; not stored.
  rankingHints: { durationSeconds: Number(item.duration) || null, verified: Boolean(item["owner.verified"]) },
});

// `publishedAfter` (a Date) returns only newer videos (created_after, in Unix seconds). `consumer` and
// `regionCode` are YouTube options: Dailymotion has no quota, and a country filter would shrink search results.
export const searchDailymotion = async (query, page = null, options = {}) => {
  const pageNumber = page ? Number(page) : 1;
  const params = {
    search: query,
    limit: options.maxResults || PAGE_SIZE,
    page: pageNumber,
  };

  if (options.publishedAfter) params.created_after = Math.floor(new Date(options.publishedAfter).getTime() / 1000);

  const data = await getVideos(params);
  const list = data.list ?? [];
  const hasExplicitMore = Boolean(data.has_more);
  const hasNextBySize = list.length === (options.maxResults || PAGE_SIZE);

  return {
    videos: list.map(item => toVideo(item, query)),
    nextPageToken: hasExplicitMore || hasNextBySize ? String(pageNumber + 1) : null,
  };
};

// Dailymotion's trending videos for a country (sort=trending, country in lowercase ISO). Free, like all
// Dailymotion calls.
export const listTrendingDailymotion = async ({ country, limit = 50 }) => {
  const data = await getVideos({ sort: "trending", country: country.toLowerCase(), limit });
  return (data.list ?? []).map(item => toVideo(item, null));
};
