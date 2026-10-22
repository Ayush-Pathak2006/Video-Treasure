import mongoose, { Schema } from "mongoose";

// Replies nest up to this many levels under a top-level comment (depth 0). A reply to a comment at this depth
// stays at this depth, under the same parent, and names the person it answers (replyTo).
export const MAX_REPLY_DEPTH = 3;
export const MAX_COMMENT_LENGTH = 1000;

const commentSchema = new Schema(
  {
    // Which video. Keyed like playlist items, not by Video row: one platform video can have several rows.
    platform: {
      type: String,
      enum: ["youtube", "dailymotion"],
      required: true,
    },
    platformVideoId: {
      type: String,
      required: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Trimmed, 1 to 1,000 characters. "" once deleted: a placeholder stays while it has replies.
    text: {
      type: String,
      default: "",
      maxlength: MAX_COMMENT_LENGTH,
    },
    // null for a top-level comment.
    parent: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },
    // The thread's top-level comment. null for a top-level comment.
    root: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },
    depth: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_REPLY_DEPTH,
    },
    // The ids from the top-level comment down to this one, joined with "/" (a top-level comment's path is its own
    // id). ObjectIds are 24 hex characters that grow over time, so sorting a thread by path gives reading order: a
    // parent before its replies, siblings oldest first, and a whole branch before the next sibling.
    path: {
      type: String,
      required: true,
    },
    // Only on a flattened reply (one to a comment at MAX_REPLY_DEPTH): the author it answers, shown as "@Name".
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // The counters change only with $inc.
    likeCount: {
      type: Number,
      default: 0,
    },
    // Direct replies.
    replyCount: {
      type: Number,
      default: 0,
    },
    // Top-level comments only: replies at every level of the thread, deleted placeholders included (they're still
    // shown), for "▾ 12 replies".
    threadReplyCount: {
      type: Number,
      default: 0,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// A video's top-level comments, newest first, and the counts.
commentSchema.index({ platform: 1, platformVideoId: 1, parent: 1, _id: -1 });
// Top order: most liked first.
commentSchema.index({ platform: 1, platformVideoId: 1, parent: 1, likeCount: -1, _id: -1 });
// A thread in reading order.
commentSchema.index({ root: 1, path: 1 });
// For account deletion requests, handled by hand.
commentSchema.index({ author: 1 });

export const Comment = mongoose.model("Comment", commentSchema);
