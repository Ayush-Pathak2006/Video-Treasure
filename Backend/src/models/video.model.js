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

    // The uploader's id on the platform: YouTube's channelId, Dailymotion's owner.id. Unlike channelTitle it is
    // unique, and Dailymotion rows cached before Oct 2026 hold a category in channelTitle. Rows cached before this
    // field and rows created by findOrCreateVideo don't have it.
    channelId: {
      type: String,
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

    // Optional, like channelId. Recommendations push Shorts (60 s or less) down.
    durationSeconds: {
      type: Number,
    },

    // At most 15 (utils/videoTags.js). Left out when the platform sent none, instead of Mongoose's default [].
    tags: {
      type: [String],
      default: undefined,
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

// The 30-day refresh job looks for the stalest YouTube rows (services/videoRefresh.service.js).
videoSchema.index({ platform: 1, fetchedAt: 1 });

// Recommendations: more from the same channel, most viewed first.
videoSchema.index({ platform: 1, channelId: 1, views: -1 });

// Recommendations: similar titles. MongoDB allows one text index per collection, so this is it.
videoSchema.index(
  { title: "text", tags: "text" },
  { name: "related_text", weights: { title: 3, tags: 1 }, default_language: "english" }
);

export const Video = mongoose.model("Video", videoSchema);
