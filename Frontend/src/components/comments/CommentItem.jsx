import React, { useEffect, useRef, useState } from "react";
import LoginPrompt from "../LoginPrompt";
import CommentComposer from "./CommentComposer";
import { formatCount, formatTimeAgo, getInitial } from "../../utils/format";
import { useClampedOverflow } from "../../utils/useClampedOverflow";

const repliesLabel = count => `${count.toLocaleString("en")} ${count === 1 ? "reply" : "replies"}`;

// Replies loaded under a comment, at every level.
const countLoaded = (commentId, childrenByParent) =>
  (childrenByParent.get(commentId) || []).reduce((total, child) => total + 1 + countLoaded(child._id, childrenByParent), 0);

const HeartIcon = ({ filled }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.5l1.318-1.182a4.5 4.5 0 116.364 6.364L12 20.25l-7.682-7.682a4.5 4.5 0 010-6.364z"
    />
  </svg>
);

// The indented column of replies. Its line is a button that collapses the branch; at most 3 levels deep, so the
// deepest text keeps enough width on a 320 px phone.
const RepliesBranch = ({ collapseLabel, onCollapse, children }) => (
  <div className="relative ml-4 sm:ml-7 pl-3 sm:pl-4">
    <button
      type="button"
      onClick={onCollapse}
      aria-label={collapseLabel}
      title={collapseLabel}
      className="group absolute inset-y-0 left-0 flex w-3 -translate-x-1/2 justify-center"
    >
      <span className="h-full w-px bg-white/10 transition-colors group-hover:bg-purple-400/50" />
    </button>
    {children}
  </div>
);

/**
 * One comment and, below it, its replies (recursively). Top-level comments open and close their thread with
 * "▾ N replies" (the first click loads it); a reply's own replies collapse with the branch line. Deleted comments
 * stay as "This comment was deleted." while they have replies.
 */
function CommentItem({ comment, childrenByParent, threads, actions, loggedIn, returnTo }) {
  const [expanded, setExpanded] = useState(false);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [showLikePrompt, setShowLikePrompt] = useState(false);
  const textRef = useRef(null);
  const menuRef = useRef(null);
  const showReadMore = useClampedOverflow(textRef, comment.text, expanded);

  const isTopLevel = comment.depth === 0;
  const thread = isTopLevel ? threads[comment._id] : null;
  const children = childrenByParent.get(comment._id) || [];
  const authorName = comment.author?.fullName ?? "Deleted user";

  // The ⋯ menu closes on a click outside it or on Escape.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnOutsideClick = event => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const handleLike = async () => {
    if (!loggedIn) {
      setShowLikePrompt(true);
      return;
    }
    // One request at a time per comment, so answers can't arrive out of order.
    if (likePending) return;
    setLikePending(true);
    try {
      await actions.like(comment);
    } finally {
      setLikePending(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await actions.remove(comment);
    } catch (requestError) {
      setDeleteError(requestError.response?.data?.message || "Couldn't delete the comment. Try again.");
      setDeleting(false);
    }
  };

  const renderChildren = () => (
    <ul className="space-y-4 pt-3">
      {children.map(child => (
        <li key={child._id}>
          <CommentItem
            comment={child}
            childrenByParent={childrenByParent}
            threads={threads}
            actions={actions}
            loggedIn={loggedIn}
            returnTo={returnTo}
          />
        </li>
      ))}
    </ul>
  );

  // Replies: a top-level comment's thread (opened with its toggle), or a reply's own replies (shown unless collapsed).
  let replies = null;

  if (isTopLevel) {
    const replyCount = Math.max(comment.threadReplyCount, countLoaded(comment._id, childrenByParent));
    replies = (
      <>
        {replyCount > 0 && (
          <button
            type="button"
            onClick={() => actions.toggleThread(comment)}
            aria-expanded={Boolean(thread?.open)}
            className="mt-2 ml-11 rounded-full px-3 py-1 text-sm font-semibold text-purple-300 hover:bg-purple-500/10"
          >
            {thread?.open ? "▴" : "▾"} {repliesLabel(replyCount)}
          </button>
        )}
        {thread?.open && (
          <RepliesBranch collapseLabel="Hide replies" onCollapse={() => actions.toggleThread(comment)}>
            {children.length > 0 && renderChildren()}
            {thread.loading && <p className="pt-3 text-sm text-white/50">Loading replies…</p>}
            {thread.error && (
              <p className="pt-3 text-sm text-red-400">
                {thread.error}{" "}
                <button type="button" onClick={() => actions.loadReplies(comment)} className="underline hover:text-white">
                  Try again
                </button>
              </p>
            )}
            {thread.hasMore && !thread.loading && (
              <button
                type="button"
                onClick={() => actions.loadReplies(comment)}
                className="mt-3 rounded-full px-3 py-1 text-sm font-semibold text-purple-300 hover:bg-purple-500/10"
              >
                Show more replies
              </button>
            )}
          </RepliesBranch>
        )}
      </>
    );
  } else if (children.length > 0) {
    const hidden = countLoaded(comment._id, childrenByParent);
    replies = collapsed ? (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-expanded="false"
        className="mt-1 ml-8 rounded-full px-3 py-1 text-sm font-semibold text-purple-300 hover:bg-purple-500/10"
      >
        ▸ {repliesLabel(hidden)}
      </button>
    ) : (
      <RepliesBranch collapseLabel={`Collapse ${repliesLabel(hidden)}`} onCollapse={() => setCollapsed(true)}>
        {renderChildren()}
      </RepliesBranch>
    );
  }

  const avatarSize = isTopLevel ? "h-8 w-8 text-sm" : "h-6 w-6 text-xs";

  if (comment.deleted) {
    return (
      <div>
        <div className="flex gap-3">
          <span className={`${avatarSize} shrink-0 rounded-full bg-white/10`} aria-hidden="true" />
          <p className="pt-1 text-sm italic text-white/40">This comment was deleted.</p>
        </div>
        {replies}
      </div>
    );
  }

  return (
    <div>
      <div className={`flex ${isTopLevel ? "gap-3" : "gap-2"}`}>
        <span
          className={`${avatarSize} shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold`}
          aria-hidden="true"
        >
          {getInitial(comment.author?.fullName)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold break-words">{authorName}</span>{" "}
              <span className="text-xs text-white/50">
                {formatTimeAgo(comment.createdAt)}
                {comment.editedAt && " (edited)"}
              </span>
            </p>

            {comment.isMine && !editing && (
              <div ref={menuRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setMenuOpen(current => !current)}
                  aria-label="Comment actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="rounded-full px-2 leading-6 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  ⋯
                </button>
                {menuOpen && (
                  <div role="menu" className="absolute right-0 z-10 mt-1 w-32 rounded-lg border border-white/10 bg-gray-900/95 py-1 shadow-xl">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setEditing(true);
                      }}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-white/10"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmingDelete(true);
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-pink-300 hover:bg-white/10"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {editing ? (
            <div className="mt-1">
              <CommentComposer
                placeholder="Edit your comment…"
                submitLabel="Save"
                initialText={comment.text}
                autoFocus
                alwaysOpen
                onSubmit={async text => {
                  await actions.edit(comment, text);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            </div>
          ) : (
            <>
              {/* Plain text only: comments are written by strangers. The "@Name" of a flattened reply isn't part of
                  the stored text. */}
              <p ref={textRef} className={`mt-0.5 whitespace-pre-line break-words text-sm text-white/90 ${expanded ? "" : "line-clamp-6"}`}>
                {comment.replyTo && <span className="mr-1 font-semibold text-purple-300">@{comment.replyTo.fullName}</span>}
                {comment.text}
              </p>
              {showReadMore && (
                <button
                  type="button"
                  onClick={() => setExpanded(current => !current)}
                  aria-expanded={expanded}
                  className="text-xs font-semibold text-white/60 hover:text-white"
                >
                  {expanded ? "Show less" : "Read more"}
                </button>
              )}
            </>
          )}

          {confirmingDelete ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-white/80">Delete this comment?</span>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeleteError("");
                }}
                disabled={deleting}
                className="rounded-full px-3 py-1 font-semibold text-white/80 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-full bg-pink-600 px-3 py-1 font-semibold text-white hover:bg-pink-500 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
              {deleteError && <p className="w-full text-red-400">{deleteError}</p>}
            </div>
          ) : (
            !editing && (
              <div className="mt-1 flex items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={handleLike}
                  disabled={likePending}
                  aria-pressed={comment.likedByMe}
                  aria-label={`Like (${comment.likeCount})`}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/10 ${comment.likedByMe ? "text-pink-500" : "text-white/60 hover:text-white"}`}
                >
                  <HeartIcon filled={comment.likedByMe} />
                  {comment.likeCount > 0 && <span className="text-xs">{formatCount(comment.likeCount)}</span>}
                </button>
                {loggedIn && (
                  <button
                    type="button"
                    onClick={() => setReplying(true)}
                    className="rounded-full px-3 py-1 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    Reply
                  </button>
                )}
              </div>
            )
          )}

          {showLikePrompt && !loggedIn && (
            <LoginPrompt message="Log in to like comments." returnTo={returnTo} compact className="mt-1" />
          )}

          {replying && (
            <div className="mt-2">
              <CommentComposer
                placeholder={`Reply to ${authorName}…`}
                submitLabel="Reply"
                autoFocus
                alwaysOpen
                onSubmit={async text => {
                  await actions.reply(comment, text);
                  setReplying(false);
                }}
                onCancel={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      </div>

      {replies}
    </div>
  );
}

export default CommentItem;
