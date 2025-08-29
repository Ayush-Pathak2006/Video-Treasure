import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Like } from "../models/like.model.js";
import { Video } from "../models/video.model.js";

const toggleVideoLike = asyncHandler(async (req, res) => {
    // Frontend will send video details in the body
    const { platformVideoId, title, thumbnail, channelTitle } = req.body;
    const userId = req.user._id;

    if (!platformVideoId) {
        throw new ApiError(400, "platformVideoId is required");
    }

    // 1. Find or create the video in our database
    let video = await Video.findOne({ platformVideoId });
    if (!video) {
        // If the frontend doesn't provide all details, throw an error
        if (!title || !thumbnail || !channelTitle) {
            throw new ApiError(400, "Video details are required for the first like");
        }
        video = await Video.create({
            platformVideoId,
            title,
            thumbnail,
            channelTitle
        });
    }

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
        {
            $replaceRoot: { newRoot: "$videoDetails" }
        }
    ]);

    return res
        .status(200)
        .json(new ApiResponse(200, likedVideos, "Liked videos fetched successfully"));
});

const getLikedVideoIds = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // Find all likes by the user
    const likes = await Like.find({ likedBy: userId }).populate('video');

    // Extract the platformVideoId from each liked video
    const likedVideoIds = likes.map(like => like.video.platformVideoId);

    return res
        .status(200)
        .json(new ApiResponse(200, { likedVideoIds }, "Liked video IDs fetched successfully"));
});

export { toggleVideoLike, getLikedVideos, getLikedVideoIds};