import mongoose, { Schema } from "mongoose";

const commentLikeSchema = new Schema(
  {
    comment: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// One like per user and comment. Liking relies on it to stay idempotent (a duplicate means "already liked"), and
// it also serves "which of these comments did I like" (comment: { $in } with user).
commentLikeSchema.index({ comment: 1, user: 1 }, { unique: true });

export const CommentLike = mongoose.model("CommentLike", commentLikeSchema);
