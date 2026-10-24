import mongoose from "mongoose";
import { WatchHistory } from "../models/watchHistory.model.js";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { ApiError } from "../utils/ApiError.js";
import { buildVideoKey, parseVideoKey } from "../utils/videoKey.js";

export const HISTORY_PAGE_SIZE = 30;
// The flood limit alone would let a script add 172,800 entries a day.
const MAX_ENTRIES_PER_USER = 2000;

const NEWEST_FIRST = { lastWatchedAt: -1, _id: -1 };
// "<lastWatchedAt in ms>_<_id>" of the last entry sent.
const CURSOR = /^(\d{1,15})_([a-f\d]{24})$/i;

// Entries after `entry` in NEWEST_FIRST order.
const olderThan = entry => ({
  $or: [{ lastWatchedAt: { $lt: entry.lastWatchedAt } }, { lastWatchedAt: entry.lastWatchedAt, _id: { $lt: entry._id } }],
});

const encodeCursor = entry => `${entry.lastWatchedAt.getTime()}_${entry._id}`;

const decodeCursor = cursor => {
  const match = CURSOR.exec(cursor);
  if (!match) throw new ApiError(400, "Invalid cursor.");

  return olderThan({ lastWatchedAt: new Date(Number(match[1])), _id: new mongoose.Types.ObjectId(match[2]) });
};

// Keeps the user's newest MAX_ENTRIES_PER_USER entries. Runs only after an insert: a rewatch can't grow the history.
const trimHistory = async userId => {
  if ((await WatchHistory.countDocuments({ user: userId })) <= MAX_ENTRIES_PER_USER) return 0;

  const [lastKept] = await WatchHistory.find({ user: userId })
    .sort(NEWEST_FIRST)
    .skip(MAX_ENTRIES_PER_USER - 1)
    .limit(1)
    .select("lastWatchedAt")
    .lean();

  if (!lastKept) return 0;

  const { deletedCount } = await WatchHistory.deleteMany({ user: userId, ...olderThan(lastKept) });
  return deletedCount;
};

/**
 * Records that the user watched a video (the Player sends it after 10 seconds of visible time). One upsert: the first
 * watch inserts the entry, a rewatch moves it to the top and counts it. Nothing is written while the user's history
 * is paused. Answers 404 for a video we never cached, so the Player's placeholders never become a Video row.
 */
export const recordWatch = async ({ user, platform, platformVideoId, now = new Date() }) => {
  if (user.historyPaused) return { recorded: false, paused: true };

  // The freshest row has the newest title and thumbnail for the History page.
  const row = await Video.findOne({ platform, platformVideoId }).sort({ fetchedAt: -1 }).select("_id").lean();

  if (!row) {
    throw new ApiError(404, "Video not found");
  }

  const upsert = () =>
    WatchHistory.findOneAndUpdate(
      { user: user._id, platform, platformVideoId },
      { $set: { lastWatchedAt: now, video: row._id }, $setOnInsert: { firstWatchedAt: now }, $inc: { watchCount: 1 } },
      { upsert: true, new: true, includeResultMetadata: true }
    );

  let result;

  try {
    result = await upsert();
  } catch (error) {
    // Two first watches at the same moment: the other one inserted the entry, so this one updates it.
    if (error.code !== 11000) throw error;
    result = await upsert();
  }

  if (!result.lastErrorObject?.updatedExisting) {
    await trimHistory(user._id);
  }

  return { recorded: true, watchedAt: now };
};

/** A page of the user's history, newest first. Entries whose Video row is gone are skipped. */
export const listHistory = async ({ userId, cursor = null }) => {
  const page = await WatchHistory.find({ user: userId, ...(cursor && decodeCursor(cursor)) })
    .sort(NEWEST_FIRST)
    .limit(HISTORY_PAGE_SIZE + 1)
    // No card shows the description; the Player loads it on its own.
    .populate({ path: "video", select: "-description" })
    .lean();
  const entries = page.slice(0, HISTORY_PAGE_SIZE);
  const hasMore = page.length > HISTORY_PAGE_SIZE;

  return {
    items: entries
      .filter(entry => entry.video)
      .map(entry => ({ _id: entry._id, watchedAt: entry.lastWatchedAt, watchCount: entry.watchCount, video: entry.video })),
    nextCursor: hasMore ? encodeCursor(entries.at(-1)) : null,
    hasMore,
  };
};

export const removeHistoryEntry = async ({ userId, platform, platformVideoId }) => {
  const { deletedCount } = await WatchHistory.deleteOne({ user: userId, platform, platformVideoId });
  return deletedCount === 1;
};

export const clearHistory = async userId => {
  const { deletedCount } = await WatchHistory.deleteMany({ user: userId });
  return deletedCount;
};

// Pausing only stops new entries; the existing ones stay.
export const setHistoryPaused = async (userId, paused) => {
  await User.updateOne({ _id: userId }, { $set: { historyPaused: paused } });
  return paused;
};

// Deletes the history entries of these videos. Called by the refresh job's removeVideos when a video is gone from YouTube.
export const removeHistoryForVideos = async (platform, platformVideoIds) => {
  if (!platformVideoIds.length) return 0;

  const { deletedCount } = await WatchHistory.deleteMany({ platform, platformVideoId: { $in: platformVideoIds } });
  return deletedCount;
};

/** Which of these video keys ("youtube:abc") are in the user's history, in one query. */
export const getWatchedKeys = async (userId, videoKeys) => {
  if (!userId || !videoKeys.length) return new Set();

  const idsByPlatform = {};

  for (const key of videoKeys) {
    const { platform, platformVideoId } = parseVideoKey(key);
    (idsByPlatform[platform] ??= []).push(platformVideoId);
  }

  const entries = await WatchHistory.find({
    user: userId,
    $or: Object.entries(idsByPlatform).map(([platform, ids]) => ({ platform, platformVideoId: { $in: ids } })),
  })
    .select("platform platformVideoId")
    .lean();

  return new Set(entries.map(buildVideoKey));
};
