import mongoose from "mongoose";

const queryStateSchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      unique: true,
    },
    platform: {
      type: String,
      default: "youtube",
    },
    nextPageToken: {
      type: String,
      default: null,
    },
    exhausted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const QueryState = mongoose.model("QueryState", queryStateSchema);
