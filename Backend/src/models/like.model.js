import mongoose, { Schema } from "mongoose";

const likeSchema = new Schema(
  {
    video: {
      type: Schema.Types.ObjectId, //In this line I am only storing the reference to the video, not the entire video data
      ref: "Video",
      required: true,
      index: true,
    },

    likedBy: {
      type: Schema.Types.ObjectId, // Reference to the user who liked the video
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

/**
 * 🔒 Prevent duplicate likes
 * One user can like a video only once
 */
likeSchema.index(
  { video: 1, likedBy: 1 },
  { unique: true }
);

export const Like = mongoose.model("Like", likeSchema);
