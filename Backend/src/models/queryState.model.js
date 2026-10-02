import mongoose from "mongoose";

const queryStateSchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["youtube", "dailymotion"],
      required: true,
      index: true,
    },
    nextPageToken: {
      type: String,
      default: null,
    },
    exhausted: {
      type: Boolean,
      default: false,
    },
    exhaustedReason: {
      type: String,
      default: null,
    },
    // When it was marked exhausted. Temporary reasons are retried after a cooldown (see videoFetch.service.js).
    exhaustedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

queryStateSchema.index({ query: 1, platform: 1 }, { unique: true });

export const QueryState = mongoose.model("QueryState", queryStateSchema);