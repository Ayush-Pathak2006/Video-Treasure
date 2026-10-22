import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { MAX_COMMENT_LENGTH } from "../models/comment.model.js";
import { parseVideoKey, validateVideoIdentity } from "../utils/videoKey.js";
import {
  addCommentLike,
  createComment,
  deleteOwnComment,
  listThread,
  listVideoComments,
  removeCommentLike,
  updateCommentText,
} from "../services/comment.service.js";

const OBJECT_ID = /^[a-f\d]{24}$/i;
const SORTS = ["top", "newest"];

// Values that must be one string: a repeated query parameter arrives as an array.
const readVideoKey = value => {
  if (typeof value !== "string") throw new ApiError(400, "Invalid video key");
  return validateVideoIdentity(parseVideoKey(value));
};

const readCommentId = value => {
  if (typeof value !== "string" || !OBJECT_ID.test(value)) throw new ApiError(400, "Invalid comment id");
  return value;
};

const readCursor = value => {
  if (value === undefined) return null;
  if (typeof value !== "string" || !value) throw new ApiError(400, "Invalid cursor.");
  return value;
};

const readText = value => {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text || text.length > MAX_COMMENT_LENGTH) {
    throw new ApiError(400, `Comments need 1 to ${MAX_COMMENT_LENGTH.toLocaleString("en")} characters.`);
  }

  return text;
};

// As in search: "anonymous" while the frontend has a user means the access token expired.
const viewerOf = req => (req.user ? "user" : "anonymous");

// GET /comments?video=<videoKey>&sort=top|newest&cursor=. Public.
const getComments = asyncHandler(async (req, res) => {
  const { platform, platformVideoId } = readVideoKey(req.query.video);
  const sort = req.query.sort ?? "top";

  if (!SORTS.includes(sort)) {
    throw new ApiError(400, "Sort by top or newest.");
  }

  const page = await listVideoComments({
    platform,
    platformVideoId,
    sort,
    cursor: readCursor(req.query.cursor),
    viewerId: req.user?._id ?? null,
  });

  return res.status(200).json(new ApiResponse(200, { ...page, viewer: viewerOf(req) }, "Comments fetched"));
});

// GET /comments/:commentId/replies?cursor=. Public. The whole thread under a top-level comment.
const getReplies = asyncHandler(async (req, res) => {
  const page = await listThread({
    rootId: readCommentId(req.params.commentId),
    cursor: readCursor(req.query.cursor),
    viewerId: req.user?._id ?? null,
  });

  return res.status(200).json(new ApiResponse(200, { ...page, viewer: viewerOf(req) }, "Replies fetched"));
});

// POST /comments { videoKey, text, parentId? }
const postComment = asyncHandler(async (req, res) => {
  const { videoKey, text, parentId } = req.body ?? {};
  const { platform, platformVideoId } = readVideoKey(videoKey);

  const result = await createComment({
    user: req.user,
    platform,
    platformVideoId,
    text: readText(text),
    parentId: parentId == null ? null : readCommentId(parentId),
  });

  return res.status(201).json(new ApiResponse(201, result, "Comment posted"));
});

// PATCH /comments/:commentId { text }. The author's own comment only; someone else's answers 404.
const editComment = asyncHandler(async (req, res) => {
  const commentId = readCommentId(req.params.commentId);
  const comment = await updateCommentText({ commentId, userId: req.user._id, text: readText((req.body ?? {}).text) });

  return res.status(200).json(new ApiResponse(200, comment, "Comment updated"));
});

// DELETE /comments/:commentId. The author's own comment only. Answers { mode, removedIds, commentCount }.
const deleteComment = asyncHandler(async (req, res) => {
  const result = await deleteOwnComment({ commentId: readCommentId(req.params.commentId), userId: req.user._id });

  return res.status(200).json(new ApiResponse(200, result, "Comment deleted"));
});

// PUT /comments/:commentId/like. Idempotent.
const likeComment = asyncHandler(async (req, res) => {
  const result = await addCommentLike({ commentId: readCommentId(req.params.commentId), userId: req.user._id });

  return res.status(200).json(new ApiResponse(200, result, "Comment liked"));
});

// DELETE /comments/:commentId/like. Idempotent.
const unlikeComment = asyncHandler(async (req, res) => {
  const result = await removeCommentLike({ commentId: readCommentId(req.params.commentId), userId: req.user._id });

  return res.status(200).json(new ApiResponse(200, result, "Comment unliked"));
});

export { getComments, getReplies, postComment, editComment, deleteComment, likeComment, unlikeComment };
