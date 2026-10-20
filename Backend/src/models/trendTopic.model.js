import mongoose from "mongoose";

const TREND_TOPIC_TTL_SECONDS = 3 * 24 * 60 * 60;

// A topic from an outside trends feed (Google Trends' RSS), refreshed every time the feed lists it.
const trendTopicSchema = new mongoose.Schema({
  region: {
    type: String,
    required: true,
  },
  source: {
    type: String,
    required: true,
  },
  topic: {
    type: String,
    required: true,
  },
  // The feed's rough search volume ("2000+" -> 2000), for picking the biggest topic first.
  traffic: {
    type: Number,
    default: 0,
  },
  // The last time the feed listed it. Topics the feed dropped are no longer candidates.
  seenAt: {
    type: Date,
    required: true,
  },
});

trendTopicSchema.index({ region: 1, source: 1, topic: 1 }, { unique: true });
trendTopicSchema.index({ seenAt: 1 }, { expireAfterSeconds: TREND_TOPIC_TTL_SECONDS });

export const TrendTopic = mongoose.model("TrendTopic", trendTopicSchema);
