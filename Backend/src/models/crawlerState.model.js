import mongoose from "mongoose";

// What a scheduled job remembers between ticks and restarts (see services/scheduler.service.js).
// One document per job and key: a niche for the niche crawler, a topic for the trend crawler, and so on.
const crawlerStateSchema = new mongoose.Schema(
  {
    job: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      required: true,
    },
    // The last successful run for this key.
    lastRunAt: {
      type: Date,
      default: null,
    },
    // Which of the key's keywords (or categories) the next run uses, rotating.
    keywordIndex: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

crawlerStateSchema.index({ job: 1, key: 1 }, { unique: true });

export const CrawlerState = mongoose.model("CrawlerState", crawlerStateSchema);
