import { Video } from "../models/video.model.js";
import { SUPPORTED_PLATFORMS } from "../providers/provider.registry.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * A Video row for the whole video object the frontend posts when it likes or saves a video. Any cached row of
 * that platform video will do. When none exists (the video was never cached), one is created from the posted
 * details, so saving works for every video the user can see.
 */
export const findOrCreateVideo = async body => {
  const { platform = "youtube", platformVideoId, title, thumbnail, channelTitle, query = null } = body;

  if (!platformVideoId) {
    throw new ApiError(400, "platformVideoId is required");
  }

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new ApiError(400, `Unsupported platform: ${platform}`);
  }

  const existing = await Video.findOne({ platform, platformVideoId });
  if (existing) return existing;

  if (!title || !thumbnail || !channelTitle) {
    throw new ApiError(400, "Video details are required the first time a video is saved");
  }

  try {
    return await Video.create({
      platform,
      platformVideoId,
      title,
      description: body.description || "",
      thumbnail,
      channelTitle,
      query,
      publishedAt: body.publishedAt || new Date(),
    });
  } catch (error) {
    // A parallel request created it first.
    if (error.code === 11000) return Video.findOne({ platform, platformVideoId });
    throw error;
  }
};
