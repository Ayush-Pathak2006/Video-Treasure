import mongoose, { Schema } from "mongoose";

const videoSchema = new Schema(
  {
    platform: {
      type: String,
      enum: ["youtube", "dailymotion"],
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

    publishedAt: {
      type: Date,
      required: true,
      index: true,
    },

    views: {
      type: Number,
      default: 0,
      index: true,
    },

    likes: {
      type: Number,
      default: 0,
    },

    score: {
      type: Number,
      default: 0,
      index: true,
    },

    // Position in this search's cached results, best first (see utils/searchRanks.js). Can be negative:
    // the crawler puts its picks in front of everything cached before.
    searchRank: {
      type: Number,
    },

    fetchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// IMPORTANT: one row per video per cache key. The same video can still be cached under several queries.
videoSchema.index(
  { platform: 1, platformVideoId: 1, query: 1 },
  { unique: true }
);

// Search results are paged in this order.
videoSchema.index({ query: 1, searchRank: 1, _id: 1 });

export const Video = mongoose.model("Video", videoSchema);
