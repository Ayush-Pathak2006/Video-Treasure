import mongoose, { Schema } from "mongoose";

const videoSchema = new Schema(
  {
    platform: {
      type: String,
      enum: ["youtube"], // scalable later
      required: true,
      index: true,
    },

    platformVideoId: {
      type: String,
      required: true,
    },

    query: {
      type: String, // search keyword / niche
      index: true,
    },

    title: {
      type: String,
      required: true,
    },

    description: String,

    thumbnail: {
      type: String,
      required: true,
    },

    channelTitle: {
      type: String,
      required: true,
    },

    publishedAt: Date,

    fetchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// IMPORTANT: dedupe across platforms
videoSchema.index(
  { platform: 1, platformVideoId: 1, query: 1, createdAt: -1 },
  { unique: true }
);

export const Video = mongoose.model("Video", videoSchema);
