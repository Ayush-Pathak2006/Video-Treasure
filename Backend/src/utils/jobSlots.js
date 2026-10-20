import { CrawlerState } from "../models/crawlerState.model.js";

/**
 * Claims `job`/`key` for a run when its last run is at least `minGapMs` ago (or it never ran), and marks it as
 * run at `now`. Atomic, so two processes (the old and the new instance overlap during a deploy) can't both win.
 * Returns { claimed, previousRunAt }.
 */
export const claimJobSlot = async ({ job, key, minGapMs, now = new Date() }) => {
  try {
    await CrawlerState.updateOne({ job, key }, { $setOnInsert: { job, key } }, { upsert: true });
  } catch (error) {
    // Created by a parallel claim at the same moment.
    if (error.code !== 11000) throw error;
  }

  // Kept apart from the upsert above: with these conditions in an upsert's filter, a slot that isn't free
  // wouldn't match, and MongoDB would try to insert a second document for it.
  const previous = await CrawlerState.findOneAndUpdate(
    { job, key, $or: [{ lastRunAt: null }, { lastRunAt: { $lte: new Date(now.getTime() - minGapMs) } }] },
    { $set: { lastRunAt: now } },
    { new: false }
  ).lean();

  return previous ? { claimed: true, previousRunAt: previous.lastRunAt } : { claimed: false, previousRunAt: null };
};

// Gives a claimed slot back (the run didn't happen), so the next tick can try again.
export const releaseJobSlot = ({ job, key, previousRunAt }) =>
  CrawlerState.updateOne({ job, key }, { $set: { lastRunAt: previousRunAt } });
