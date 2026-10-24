import mongoose, { Schema } from "mongoose";

// One entry per user and platform video, moved to the top by every rewatch. Only logged-in users have a history.
const watchHistorySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Which video. Keyed like playlist items, not by Video row: one platform video can have several rows.
    platform: {
      type: String,
      enum: ["youtube", "dailymotion"],
      required: true,
    },
    platformVideoId: {
      type: String,
      required: true,
    },
    // One of the video's rows, for the History page's cards. Every watch points it at the freshest row.
    video: {
      type: Schema.Types.ObjectId,
      ref: "Video",
      required: true,
    },
    firstWatchedAt: {
      type: Date,
      required: true,
    },
    lastWatchedAt: {
      type: Date,
      required: true,
    },
    // No default: the record upsert's $inc sets it to 1 on insert.
    watchCount: {
      type: Number,
    },
  },
  { timestamps: true }
);

// One entry per platform video. The record upsert relies on it, so connectDB builds it before serving.
watchHistorySchema.index({ user: 1, platform: 1, platformVideoId: 1 }, { unique: true });
// The History page (newest first), the cap's trimming and account deletion requests (handled by hand).
watchHistorySchema.index({ user: 1, lastWatchedAt: -1, _id: -1 });
// A video's recent watchers ("people who watched this also watched") and the refresh job's cleanup.
watchHistorySchema.index({ platform: 1, platformVideoId: 1, lastWatchedAt: -1 });

export const WatchHistory = mongoose.model("WatchHistory", watchHistorySchema);
