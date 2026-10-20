import mongoose from "mongoose";

// Request counts of the flood limit when several API instances share it (utils/mongoRateLimitStore.js). One
// document per client key and time window; the TTL index deletes them once the window is over.
const rateLimitHitSchema = new mongoose.Schema({
  // "<client key>|<window start in ms>"
  _id: {
    type: String,
  },
  key: {
    type: String,
    required: true,
    index: true,
  },
  hits: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

rateLimitHitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitHit = mongoose.model("RateLimitHit", rateLimitHitSchema);
