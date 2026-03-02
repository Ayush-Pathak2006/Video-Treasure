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
      default: "youtube",
    },
    nextPageToken: {
      type: String,
      default: null,
      enum: ["youtube", "dailymotion"],
      index: true,
    },
    exhausted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);
queryStateSchema.index({ query: 1, platform: 1 }, { unique: true });

export const QueryState = mongoose.model("QueryState", queryStateSchema);
