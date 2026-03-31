import { searchYouTube } from "./youtube.provider.js";
import { searchDailymotion } from "./dailymotion.provider.js";

export const PROVIDERS = {
  youtube: { name: "YouTube", search: searchYouTube },
  dailymotion: { name: "Dailymotion", search: searchDailymotion },
};

export const SUPPORTED_PLATFORMS = Object.keys(PROVIDERS);