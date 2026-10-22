import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Like } from "../models/like.model.js";
import { findOrCreateVideo } from "../services/video.service.js";
import { buildVideoKey } from "../utils/videoKey.js";

const toggleVideoLike = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // 1. Find or create the video in our database (shared with playlists)
    const video = await findOrCreateVideo(req.body);

    // 2. Check if the like already exists
    const existingLike = await Like.findOne({
        video: video._id,
        likedBy: userId
    });

    let likeStatus;
    if (existingLike) {
        // If like exists, remove it (unlike)
        await Like.findByIdAndDelete(existingLike._id);
        likeStatus = "unliked";
    } else {
        // If like doesn't exist, create it (like)
        await Like.create({
            video: video._id,
            likedBy: userId
        });
        likeStatus = "liked";
    }

    return res.status(200).json(new ApiResponse(200, { likeStatus }, "Like status toggled successfully"));
});

const getLikedVideos = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const likedVideos = await Like.aggregate([
        {
            $match: {
                likedBy: userId
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "videoDetails"
            }
        },
        {
            $unwind: "$videoDetails"
        },
         { $sort: { createdAt: -1 } },
        {
            $replaceRoot: { newRoot: "$videoDetails" }
        },
        // No card shows the description; the Player loads it on its own.
        {
            $project: { description: 0 }
        }
    ]);

    return res
        .status(200)
        .json(new ApiResponse(200, likedVideos, "Liked videos fetched successfully"));
});

const getLikedVideoIds = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // Find all likes by the user
    const likes = await Like.find({ likedBy: userId }).populate(
    "video",
    "platform platformVideoId"
  );

    // Extract the platformVideoId from each liked video
    const likedVideoIds = likes
  .filter(like => like.video !== null) // 🔥 CRITICAL
  .map(like => buildVideoKey(like.video));

    return res
        .status(200)
        .json(new ApiResponse(200, { likedVideoIds }, "Liked video IDs fetched successfully"));
});

export { toggleVideoLike, getLikedVideos, getLikedVideoIds };