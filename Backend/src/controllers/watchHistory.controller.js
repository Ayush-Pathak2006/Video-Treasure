import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { readVideoKey } from "../utils/videoKey.js";
import {
  clearHistory,
  listHistory,
  recordWatch,
  removeHistoryEntry,
  setHistoryPaused,
} from "../services/watchHistory.service.js";

// POST /history { videoKey }. Only the key: a video we never cached answers 404 instead of becoming a row.
const addToHistory = asyncHandler(async (req, res) => {
  const { platform, platformVideoId } = readVideoKey((req.body ?? {}).videoKey);
  const result = await recordWatch({ user: req.user, platform, platformVideoId });

  return res.status(200).json(new ApiResponse(200, result, result.recorded ? "Watch recorded" : "History is paused"));
});

// GET /history?cursor=. Newest first, with whether the history is paused.
const getHistory = asyncHandler(async (req, res) => {
  const { cursor } = req.query;

  // A repeated ?cursor= arrives as an array.
  if (cursor !== undefined && (typeof cursor !== "string" || !cursor)) {
    throw new ApiError(400, "Invalid cursor.");
  }

  const page = await listHistory({ userId: req.user._id, cursor: cursor ?? null });

  return res.status(200).json(new ApiResponse(200, { ...page, paused: Boolean(req.user.historyPaused) }, "History fetched"));
});

// DELETE /history/:videoKey
const removeFromHistory = asyncHandler(async (req, res) => {
  const { platform, platformVideoId } = readVideoKey(req.params.videoKey);
  const removed = await removeHistoryEntry({ userId: req.user._id, platform, platformVideoId });

  return res.status(200).json(new ApiResponse(200, { removed }, removed ? "Removed from history" : "The video wasn't in the history"));
});

// DELETE /history
const clearMyHistory = asyncHandler(async (req, res) => {
  const removedCount = await clearHistory(req.user._id);

  return res.status(200).json(new ApiResponse(200, { removedCount }, "History cleared"));
});

// PUT /history/paused { paused }
const updateHistoryPaused = asyncHandler(async (req, res) => {
  const { paused } = req.body ?? {};

  if (typeof paused !== "boolean") {
    throw new ApiError(400, "paused must be true or false.");
  }

  await setHistoryPaused(req.user._id, paused);

  return res.status(200).json(new ApiResponse(200, { paused }, paused ? "History paused" : "History resumed"));
});

export { addToHistory, getHistory, removeFromHistory, clearMyHistory, updateHistoryPaused };
