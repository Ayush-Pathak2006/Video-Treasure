import { RateLimitHit } from "../models/rateLimitHit.model.js";

/**
 * An express-rate-limit store in MongoDB, so several API instances count one client's requests together.
 * Fixed windows: one document per client and window, incremented atomically. The in-memory store is enough for
 * one instance and saves a database write per request.
 */
export class MongoRateLimitStore {
  // Tells express-rate-limit that the counts are shared, not local to this process.
  localKeys = false;

  init(options) {
    this.windowMs = options.windowMs;
  }

  getWindow() {
    const windowStart = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    return { windowStart, resetTime: new Date(windowStart + this.windowMs) };
  }

  async increment(key) {
    const { windowStart, resetTime } = this.getWindow();
    // An upsert on _id alone: MongoDB retries it itself if two requests create the window at once.
    const doc = await RateLimitHit.findOneAndUpdate(
      { _id: `${key}|${windowStart}` },
      { $inc: { hits: 1 }, $setOnInsert: { key, expiresAt: resetTime } },
      { upsert: true, new: true }
    ).lean();

    return { totalHits: doc.hits, resetTime };
  }

  async decrement(key) {
    const { windowStart } = this.getWindow();
    await RateLimitHit.updateOne({ _id: `${key}|${windowStart}`, hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(key) {
    await RateLimitHit.deleteMany({ key });
  }
}
