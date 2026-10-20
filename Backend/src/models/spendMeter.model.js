import mongoose from "mongoose";

const IDLE_METER_TTL_SECONDS = 2 * 24 * 60 * 60;

// A visitor's token bucket for real YouTube API calls (see utils/spendMeter.js).
const spendMeterSchema = new mongoose.Schema(
  {
    // "user:<id>" when the request has a valid access token, "ip:<address>" otherwise.
    identity: {
      type: String,
      required: true,
    },
    // "newSearch": a request without a cursor. "scrollRefill": a request with one.
    meter: {
      type: String,
      enum: ["newSearch", "scrollRefill"],
      required: true,
    },
    tokens: {
      type: Number,
      required: true,
    },
    // When the last token came back. Tokens are added when the meter is next read, not by a timer.
    refilledAt: {
      type: Date,
      required: true,
    },
    // Pacific-time day that usedToday counts, the same day as the YouTube quota.
    day: {
      type: String,
      required: true,
    },
    usedToday: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

spendMeterSchema.index({ identity: 1, meter: 1 }, { unique: true });
// A meter idle for 2 days is full again anyway.
spendMeterSchema.index({ updatedAt: 1 }, { expireAfterSeconds: IDLE_METER_TTL_SECONDS });

export const SpendMeter = mongoose.model("SpendMeter", spendMeterSchema);
