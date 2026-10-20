import mongoose, { Schema } from "mongoose";

// The latest trending order per region, platform and category. GET /videos/trending serves these and never
// calls an API.
const trendingSnapshotSchema = new Schema(
  {
    region: {
      type: String,
      required: true,
    },
    platform: {
      type: String,
      enum: ["youtube", "dailymotion"],
      required: true,
    },
    // A YouTube chart category ("music", "gaming"…), or "all".
    category: {
      type: String,
      required: true,
    },
    // Video rows under the trending key, in trending order.
    videos: [
      {
        type: Schema.Types.ObjectId,
        ref: "Video",
      },
    ],
    fetchedAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

trendingSnapshotSchema.index({ region: 1, platform: 1, category: 1 }, { unique: true });

export const TrendingSnapshot = mongoose.model("TrendingSnapshot", trendingSnapshotSchema);
