import mongoose from "mongoose";

const QUOTA_USAGE_RETENTION_SECONDS = 30 * 24 * 60 * 60;

// YouTube quota spent per Pacific-time day and bucket (see utils/quotaTracker.js). It lives in MongoDB, so a
// restart or a deploy can't forget what was already spent.
const quotaUsageSchema = new mongoose.Schema(
  {
    // Pacific-time date ("2026-10-13"): YouTube resets its quota at midnight Pacific time.
    day: {
      type: String,
      required: true,
    },
    // "search": search.list calls. "general": units of every other method.
    bucket: {
      type: String,
      enum: ["search", "general"],
      required: true,
    },
    used: {
      type: Number,
      default: 0,
    },
    byConsumer: {
      user: { type: Number, default: 0 },
      nicheCrawler: { type: Number, default: 0 },
      trendCrawler: { type: Number, default: 0 },
      refresh: { type: Number, default: 0 },
    },
    // Set when YouTube itself answered quotaExceeded for this bucket.
    spentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

quotaUsageSchema.index({ day: 1, bucket: 1 }, { unique: true });
quotaUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: QUOTA_USAGE_RETENTION_SECONDS });

export const QuotaUsage = mongoose.model("QuotaUsage", quotaUsageSchema);
