import mongoose from "mongoose";
import { Comment, MAX_REPLY_DEPTH } from "../models/comment.model.js";
import { CommentLike } from "../models/commentLike.model.js";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { ApiError } from "../utils/ApiError.js";
import { refundSpendToken, takeSpendToken } from "../utils/spendMeter.js";

export const COMMENTS_PAGE_SIZE = 20;
export const THREAD_PAGE_SIZE = 50;

const SORT_ORDERS = {
  top: { likeCount: -1, _id: -1 },
  newest: { _id: -1 },
};

// Cursors. Top: "<likeCount>_<_id>". Newest: "<_id>". A thread: the last comment's path (up to 4 ids).
const TOP_CURSOR = /^(\d+)_([a-f\d]{24})$/i;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const THREAD_PATH = /^[a-f\d]{24}(\/[a-f\d]{24}){0,3}$/;

const encodePageCursor = (sort, comment) => (sort === "newest" ? String(comment._id) : `${comment.likeCount}_${comment._id}`);

const decodePageCursor = (sort, cursor) => {
  if (sort === "newest") {
    if (!OBJECT_ID.test(cursor)) throw new ApiError(400, "Invalid cursor.");
    return { _id: { $lt: new mongoose.Types.ObjectId(cursor) } };
  }

  const match = TOP_CURSOR.exec(cursor);
  if (!match) throw new ApiError(400, "Invalid cursor.");

  const likeCount = Number(match[1]);
  const _id = new mongoose.Types.ObjectId(match[2]);
  return { $or: [{ likeCount: { $lt: likeCount } }, { likeCount, _id: { $lt: _id } }] };
};

/**
 * Comments in their response shape, in a fixed number of queries however many there are: one for all their authors
 * and replyTo users, and one for which of them the viewer liked (skipped for anonymous visitors). The like and reply
 * counts are stored on each comment, so they cost nothing.
 */
export const hydrateComments = async (comments, viewerId = null) => {
  if (!comments.length) return [];

  const userIds = new Set();
  for (const comment of comments) {
    if (!comment.deletedAt) userIds.add(String(comment.author));
    if (comment.replyTo) userIds.add(String(comment.replyTo));
  }

  const [users, likes] = await Promise.all([
    User.find({ _id: { $in: [...userIds] } }).select("fullName").lean(),
    viewerId ? CommentLike.find({ user: viewerId, comment: { $in: comments.map(comment => comment._id) } }).select("comment").lean() : [],
  ]);

  // fullName, never username: a Google user's username is the start of their email address.
  const people = new Map(users.map(user => [String(user._id), { _id: user._id, fullName: user.fullName }]));
  const liked = new Set(likes.map(like => String(like.comment)));

  return comments.map(comment => {
    const deleted = Boolean(comment.deletedAt);

    return {
      _id: comment._id,
      parent: comment.parent,
      root: comment.root,
      depth: comment.depth,
      text: deleted ? "" : comment.text,
      // null for a deleted comment, and for an author whose account is gone ("Deleted user").
      author: deleted ? null : people.get(String(comment.author)) ?? null,
      replyTo: comment.replyTo ? people.get(String(comment.replyTo)) ?? null : null,
      likeCount: deleted ? 0 : comment.likeCount,
      replyCount: comment.replyCount,
      threadReplyCount: comment.threadReplyCount,
      likedByMe: !deleted && liked.has(String(comment._id)),
      isMine: !deleted && Boolean(viewerId) && String(comment.author) === String(viewerId),
      createdAt: comment.createdAt,
      editedAt: comment.editedAt,
      deleted,
    };
  });
};

// Live comments only: every reply counts, deleted placeholders don't.
export const countVideoComments = (platform, platformVideoId) =>
  Comment.countDocuments({ platform, platformVideoId, deletedAt: null });

/** A page of a video's top-level comments. `total` (the video's comment count) comes with the first page only. */
export const listVideoComments = async ({ platform, platformVideoId, sort = "top", cursor = null, viewerId = null }) => {
  const filter = { platform, platformVideoId, parent: null, ...(cursor && decodePageCursor(sort, cursor)) };
  const page = await Comment.find(filter).sort(SORT_ORDERS[sort]).limit(COMMENTS_PAGE_SIZE + 1).lean();
  const comments = page.slice(0, COMMENTS_PAGE_SIZE);
  const hasMore = page.length > COMMENTS_PAGE_SIZE;

  const [hydrated, total] = await Promise.all([
    hydrateComments(comments, viewerId),
    cursor ? null : countVideoComments(platform, platformVideoId),
  ]);

  return {
    comments: hydrated,
    nextCursor: hasMore ? encodePageCursor(sort, comments.at(-1)) : null,
    hasMore,
    ...(!cursor && { total }),
  };
};

/**
 * The whole thread under a top-level comment as a flat list in reading order (sorted by path), THREAD_PAGE_SIZE at a
 * time. One indexed query per page: the server never recurses.
 */
export const listThread = async ({ rootId, cursor = null, viewerId = null }) => {
  if (cursor && !THREAD_PATH.test(cursor)) throw new ApiError(400, "Invalid cursor.");

  const root = await Comment.findById(rootId).select("parent").lean();
  if (!root) throw new ApiError(404, "Comment not found");
  if (root.parent) throw new ApiError(400, "Replies are loaded per top-level comment.");

  const page = await Comment.find({ root: root._id, ...(cursor && { path: { $gt: cursor } }) })
    .sort({ path: 1 })
    .limit(THREAD_PAGE_SIZE + 1)
    .lean();
  const comments = page.slice(0, THREAD_PAGE_SIZE);
  const hasMore = page.length > THREAD_PAGE_SIZE;

  return {
    comments: await hydrateComments(comments, viewerId),
    nextCursor: hasMore ? comments.at(-1).path : null,
    hasMore,
  };
};

const plural = (count, unit) => `${count} ${unit}${count === 1 ? "" : "s"}`;

const formatWait = retryAt => {
  const seconds = Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1000));
  if (seconds < 90) return plural(seconds, "second");
  const minutes = Math.ceil(seconds / 60);
  return minutes < 90 ? plural(minutes, "minute") : plural(Math.ceil(minutes / 60), "hour");
};

/**
 * Posts a comment, or a reply when parentId is set. A reply to a comment at MAX_REPLY_DEPTH is flattened: it goes
 * under that comment's parent, at the same depth, and names the author it answers (replyTo). Takes a token from the
 * user's comment meter, and gives it back if the comment can't be posted after all.
 */
export const createComment = async ({ user, platform, platformVideoId, text, parentId = null }) => {
  // Comments only exist for videos we have, so the 30-day refresh job checks every video that has comments.
  if (!(await Video.exists({ platform, platformVideoId }))) {
    throw new ApiError(404, "Video not found");
  }

  let placement = { parent: null, root: null, depth: 0, replyTo: null };

  if (parentId) {
    const target = await Comment.findById(parentId).lean();

    if (!target || target.platform !== platform || target.platformVideoId !== platformVideoId) {
      throw new ApiError(404, "Comment not found");
    }
    if (target.deletedAt) {
      throw new ApiError(400, "This comment was deleted.");
    }

    placement =
      target.depth < MAX_REPLY_DEPTH
        ? { parent: target._id, root: target.root ?? target._id, depth: target.depth + 1, replyTo: null }
        : { parent: target.parent, root: target.root, depth: MAX_REPLY_DEPTH, replyTo: target.author };
  }

  const spender = { identity: `user:${user._id}`, meter: "comment" };
  const token = await takeSpendToken({ ...spender, viewer: "user" });

  if (!token.ok) {
    throw new ApiError(429, `You're commenting too fast. Try again in ${formatWait(token.retryAt)}.`);
  }

  // The id comes first, so the path can be built before the insert.
  const _id = new mongoose.Types.ObjectId();
  let claimedParent = false;
  let comment;

  try {
    let path = String(_id);

    if (placement.parent) {
      // Claim the parent before inserting. A hard delete only matches replyCount 0, so this reply and a delete
      // can't both win. A direct reply needs a live parent; a flattened one may hang under a placeholder.
      const parent = await Comment.findOneAndUpdate(
        { _id: placement.parent, ...(!placement.replyTo && { deletedAt: null }) },
        { $inc: { replyCount: 1 } },
        { new: true }
      )
        .select("path")
        .lean();

      if (!parent) throw new ApiError(400, "This comment was deleted.");
      claimedParent = true;
      path = `${parent.path}/${_id}`;
    }

    comment = await Comment.create({ _id, platform, platformVideoId, author: user._id, text, path, ...placement });
  } catch (error) {
    // Undo what this attempt took: the claim on the parent and the user's token.
    if (claimedParent) await Comment.updateOne({ _id: placement.parent }, { $inc: { replyCount: -1 } });
    await refundSpendToken(spender);
    throw error;
  }

  if (placement.root) {
    await Comment.updateOne({ _id: placement.root }, { $inc: { threadReplyCount: 1 } });
  }

  const [hydrated] = await hydrateComments([comment.toObject()], user._id);
  return { comment: hydrated, commentCount: await countVideoComments(platform, platformVideoId) };
};

// The user's own comment. Someone else's answers 404 like a missing one, as playlists do.
const findOwnComment = async (commentId, userId) => {
  const comment = await Comment.findById(commentId).lean();

  if (!comment || String(comment.author) !== String(userId)) {
    throw new ApiError(404, "Comment not found");
  }
  if (comment.deletedAt) {
    throw new ApiError(400, "This comment was deleted.");
  }

  return comment;
};

/** Replaces the text of the user's own comment and marks it edited (unchanged text isn't an edit). */
export const updateCommentText = async ({ commentId, userId, text }) => {
  const comment = await findOwnComment(commentId, userId);

  if (comment.text === text) {
    const [unchanged] = await hydrateComments([comment], userId);
    return unchanged;
  }

  const updated = await Comment.findOneAndUpdate(
    { _id: comment._id, deletedAt: null },
    { $set: { text, editedAt: new Date() } },
    { new: true }
  ).lean();

  if (!updated) throw new ApiError(400, "This comment was deleted.");

  const [hydrated] = await hydrateComments([updated], userId);
  return hydrated;
};

/**
 * After a hard delete: the parent has one reply less and the thread one entry less. A parent that is a deleted
 * placeholder with no replies left goes too, and so on up the thread (at most MAX_REPLY_DEPTH levels). Returns the
 * ids of the placeholders it removed.
 */
const detachFromThread = async comment => {
  const removed = [];
  let child = comment;

  while (child.parent) {
    if (child.root) await Comment.updateOne({ _id: child.root }, { $inc: { threadReplyCount: -1 } });

    const parent = await Comment.findOneAndUpdate({ _id: child.parent }, { $inc: { replyCount: -1 } }, { new: true }).lean();
    if (!parent?.deletedAt || parent.replyCount > 0) break;

    // Conditional like every hard delete: a reply may have just claimed it.
    const { deletedCount } = await Comment.deleteOne({ _id: parent._id, deletedAt: { $ne: null }, replyCount: 0 });
    if (deletedCount === 0) break;

    removed.push(parent._id);
    child = parent;
  }

  return removed;
};

/**
 * Deletes the user's own comment. One without replies is removed ("hard"), along with the deleted placeholders above
 * it that it leaves without replies. One with replies becomes a placeholder ("soft"): its text and likes go, its
 * replies stay. `removedIds` lists what a hard delete removed, the comment first.
 */
export const deleteOwnComment = async ({ commentId, userId }) => {
  const comment = await findOwnComment(commentId, userId);
  let mode = "hard";
  let removedIds = [];

  // Only matches while nothing hangs under it, so a reply that has just claimed this comment wins.
  let { deletedCount } = await Comment.deleteOne({ _id: comment._id, replyCount: 0, deletedAt: null });

  if (deletedCount === 0) {
    mode = "soft";
    const placeholder = await Comment.findOneAndUpdate(
      { _id: comment._id, deletedAt: null },
      { $set: { deletedAt: new Date(), text: "", likeCount: 0 } },
      { new: true }
    ).lean();

    if (!placeholder) throw new ApiError(400, "This comment was deleted.");

    // Its last reply may have gone between the two steps. A placeholder with nothing under it isn't kept.
    if (placeholder.replyCount === 0) {
      ({ deletedCount } = await Comment.deleteOne({ _id: comment._id, deletedAt: { $ne: null }, replyCount: 0 }));
      if (deletedCount === 1) mode = "hard";
    }
  }

  if (mode === "hard") {
    removedIds = [comment._id, ...(await detachFromThread(comment))];
  }

  await CommentLike.deleteMany({ comment: comment._id });

  return { mode, removedIds, commentCount: await countVideoComments(comment.platform, comment.platformVideoId) };
};

const loadLikeCount = async commentId => (await Comment.findById(commentId).select("likeCount").lean())?.likeCount ?? 0;

/**
 * Likes a comment. Idempotent: the unique { comment, user } index turns a second like (a double click, another tab)
 * into a duplicate-key error, and only a like that was really created moves the count.
 */
export const addCommentLike = async ({ commentId, userId }) => {
  const comment = await Comment.findById(commentId).select("deletedAt").lean();

  if (!comment) throw new ApiError(404, "Comment not found");
  if (comment.deletedAt) throw new ApiError(400, "This comment was deleted.");

  try {
    await CommentLike.create({ comment: commentId, user: userId });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return { liked: true, likeCount: await loadLikeCount(commentId) };
  }

  const updated = await Comment.findOneAndUpdate({ _id: commentId, deletedAt: null }, { $inc: { likeCount: 1 } }, { new: true })
    .select("likeCount")
    .lean();

  if (!updated) {
    // Deleted in between: take the like back.
    await CommentLike.deleteOne({ comment: commentId, user: userId });
    throw new ApiError(400, "This comment was deleted.");
  }

  return { liked: true, likeCount: updated.likeCount };
};

/** Unlikes a comment. Idempotent: only a like that was really removed moves the count, and it never goes below 0. */
export const removeCommentLike = async ({ commentId, userId }) => {
  if (!(await Comment.exists({ _id: commentId }))) throw new ApiError(404, "Comment not found");

  const { deletedCount } = await CommentLike.deleteOne({ comment: commentId, user: userId });

  if (deletedCount === 1) {
    const updated = await Comment.findOneAndUpdate({ _id: commentId, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } }, { new: true })
      .select("likeCount")
      .lean();
    if (updated) return { liked: false, likeCount: updated.likeCount };
  }

  return { liked: false, likeCount: await loadLikeCount(commentId) };
};

// Deletes the comments of these videos and their likes, likes first. Called by the refresh job's removeVideos when
// a video is gone from YouTube.
export const removeCommentsForVideos = async (platform, platformVideoIds) => {
  if (!platformVideoIds.length) return 0;

  const comments = await Comment.find({ platform, platformVideoId: { $in: platformVideoIds } }).select("_id").lean();
  if (!comments.length) return 0;

  const commentIds = comments.map(comment => comment._id);
  await CommentLike.deleteMany({ comment: { $in: commentIds } });
  const { deletedCount } = await Comment.deleteMany({ _id: { $in: commentIds } });
  return deletedCount;
};
