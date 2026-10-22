import { Video } from "../models/video.model.js";
import { Like } from "../models/like.model.js";
import { SUPPORTED_PLATFORMS } from "../providers/provider.registry.js";
import { ApiError } from "../utils/ApiError.js";
import { htmlToPlainText } from "../utils/htmlText.js";
import { countVideoComments } from "./comment.service.js";

const DETAIL_FIELDS = "platform platformVideoId title description thumbnail channelTitle publishedAt views likes fetchedAt";

// Dailymotion's descriptions are HTML: line breaks arrive as <br /> tags. Rows keep them as received (Dailymotion
// rows are never refreshed, so a conversion on the way in would miss everything cached before it), and they
// become plain text here, the one place descriptions are served.
const toPlainDescription = ({ platform, description }) =>
  platform === "dailymotion" ? htmlToPlainText(description) : description;

/**
 * The Player's details for one platform video. `video` holds the platform's numbers (views, likes on YouTube);
 * `appStats` holds Video Treasure's own, kept apart so nobody adds them together. Answers 404 when the video was
 * never cached.
 */
export const loadVideoDetails = async ({ platform, platformVideoId, viewerId = null }) => {
  // A video has a row per cache key.
  const rows = await Video.find({ platform, platformVideoId }).select(DETAIL_FIELDS).lean();

  if (!rows.length) {
    throw new ApiError(404, "Video not found");
  }

  // The freshest row has the newest stats and, unlike search rows cached before full descriptions, the whole
  // description. Rows without fetchedAt predate the field.
  const freshest = rows.reduce((best, row) => ((row.fetchedAt ?? 0) > (best.fetchedAt ?? 0) ? row : best));
  const { _id, ...video } = freshest;

  // A user may have liked two rows of the same video, so the likes are counted by distinct user.
  const [[likeStats], comments] = await Promise.all([
    Like.aggregate([
      { $match: { video: { $in: rows.map(row => row._id) } } },
      { $group: { _id: "$likedBy" } },
      { $group: { _id: null, likes: { $sum: 1 }, likedByMe: { $max: { $eq: ["$_id", viewerId] } } } },
    ]),
    countVideoComments(platform, platformVideoId),
  ]);

  return {
    video: { ...video, description: toPlainDescription(video) },
    appStats: {
      likes: likeStats?.likes ?? 0,
      likedByMe: Boolean(viewerId && likeStats?.likedByMe),
      comments,
    },
  };
};

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
