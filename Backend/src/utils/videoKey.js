import { SUPPORTED_PLATFORMS } from "../providers/provider.registry.js";
import { ApiError } from "./ApiError.js";

// YouTube ids are 11 of these characters, Dailymotion's start with "x", and stub ids with "stub".
const PLATFORM_VIDEO_ID = /^[A-Za-z0-9_-]{1,64}$/;

// A video's identity everywhere in the app (likes, playlists, the frontend): "youtube:dQw4w9WgXcQ".
export const buildVideoKey = ({ platform, platformVideoId }) => `${platform}:${platformVideoId}`;

// "youtube:dQw4w9WgXcQ" -> { platform, platformVideoId }. The id itself may contain ":".
export const parseVideoKey = videoKey => {
  const separator = String(videoKey).indexOf(":");

  if (separator <= 0 || separator === videoKey.length - 1) {
    throw new ApiError(400, "Invalid video key");
  }

  return { platform: videoKey.slice(0, separator), platformVideoId: videoKey.slice(separator + 1) };
};

// Answers 400 unless the platform is supported and the id looks like a platform video id.
export const validateVideoIdentity = ({ platform, platformVideoId }) => {
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new ApiError(400, `Unsupported platform: ${platform}`);
  }

  if (typeof platformVideoId !== "string" || !PLATFORM_VIDEO_ID.test(platformVideoId)) {
    throw new ApiError(400, "Invalid video id");
  }

  return { platform, platformVideoId };
};

// A video key from a request: 400 unless it is one string (a repeated query parameter arrives as an array) holding
// a well-formed key of a supported platform.
export const readVideoKey = value => {
  if (typeof value !== "string") throw new ApiError(400, "Invalid video key");
  return validateVideoIdentity(parseVideoKey(value));
};
