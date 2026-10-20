import { searchYouTube } from "./youtube.provider.js";
import { searchDailymotion } from "./dailymotion.provider.js";

// `metered`: each API call takes a token from the visitor's spend meter (utils/spendMeter.js). Dailymotion
// has no quota, so its calls are free.
export const PROVIDERS = {
  youtube: { name: "YouTube", search: searchYouTube, metered: true },
  dailymotion: { name: "Dailymotion", search: searchDailymotion, metered: false },
};

export const SUPPORTED_PLATFORMS = Object.keys(PROVIDERS);
