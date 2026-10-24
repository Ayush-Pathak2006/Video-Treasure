import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AppContext";
import ppi, { requestAsViewer } from "../../api/axios";
import LoginPrompt from "../LoginPrompt";
import CommentComposer from "./CommentComposer";
import CommentItem from "./CommentItem";
import { getInitial } from "../../utils/format";

const SORTS = [
  { value: "top", label: "Top" },
  { value: "newest", label: "Newest" },
];

const countLabel = count => `${count.toLocaleString("en")} ${count === 1 ? "comment" : "comments"}`;

// Adds or refreshes comments in the id map.
const mergeInto = (current, comments) => {
  const next = { ...current };
  for (const comment of comments) next[comment._id] = comment;
  return next;
};

/**
 * The comments under the Player. Top-level comments come 20 at a time ("Show more comments": a button, not infinite
 * scroll, below a player and a description). Each thread loads when its "▾ N replies" is first opened, 50 at a time.
 * Every write shows what the server answered: the new comment where it belongs, the counts it computed, and for a
 * delete exactly the comments it removed.
 */
function CommentSection({ videoKey, initialCount, returnTo }) {
  const { user } = useAuth();
  const userId = user?._id;
  const [sort, setSort] = useState("top");
  // Every loaded comment by id, top-level and replies. The tree is built from their `parent`.
  const [comments, setComments] = useState({});
  const [topIds, setTopIds] = useState([]);
  // Per top-level comment: { open, loaded, loading, nextCursor, hasMore, error }.
  const [threads, setThreads] = useState({});
  const [count, setCount] = useState(initialCount);
  const [status, setStatus] = useState("loading");
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const threadsRef = useRef(threads);
  // Answers that belong to an older sort, viewer or video are dropped.
  const generationRef = useRef(0);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  // Reads go through requestAsViewer: an expired access token answers as anonymous (likedByMe, isMine missing),
  // so the session is renewed once and the page asked for again.
  const read = useCallback((url, params) => requestAsViewer(() => ppi.get(url, { params }), { loggedIn: Boolean(userId) }), [userId]);

  const requestPage = useCallback(
    pageCursor => read("/api/v1/comments", { video: videoKey, sort, ...(pageCursor && { cursor: pageCursor }) }),
    [read, videoKey, sort]
  );

  // The first page, again when the sort or the viewer changes.
  useEffect(() => {
    const generation = (generationRef.current += 1);
    setComments({});
    setTopIds([]);
    setThreads({});
    setCursor(null);
    setHasMore(false);
    setMoreError("");
    setStatus("loading");

    requestPage(null)
      .then(response => {
        if (generation !== generationRef.current) return;
        const page = response.data.data;
        setComments(current => mergeInto(current, page.comments));
        setTopIds(page.comments.map(comment => comment._id));
        setCount(page.total);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setStatus("ready");
      })
      .catch(() => {
        if (generation === generationRef.current) setStatus("error");
      });
  }, [requestPage, reloadKey]);

  const loadMoreComments = async () => {
    const generation = generationRef.current;
    setLoadingMore(true);
    setMoreError("");

    try {
      const page = (await requestPage(cursor)).data.data;
      if (generation !== generationRef.current) return;
      setComments(current => mergeInto(current, page.comments));
      // Top can shift between pages as likes change, so a comment may come twice.
      setTopIds(current => [...current, ...page.comments.map(comment => comment._id).filter(id => !current.includes(id))]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      if (generation === generationRef.current) setMoreError("Couldn't load more comments.");
    } finally {
      if (generation === generationRef.current) setLoadingMore(false);
    }
  };

  const updateThread = useCallback(
    (rootId, change) => setThreads(current => ({ ...current, [rootId]: { ...current[rootId], ...change } })),
    []
  );

  // The next page of a thread (the first one when it isn't loaded yet). Pages come in reading order, so a reply's
  // parent is always already there.
  const loadReplies = useCallback(
    async rootId => {
      const current = threadsRef.current[rootId];
      if (current?.loading) return;

      const generation = generationRef.current;
      const pageCursor = current?.loaded ? current.nextCursor : null;
      updateThread(rootId, { open: true, loading: true, error: "" });

      try {
        const page = (await read(`/api/v1/comments/${rootId}/replies`, pageCursor ? { cursor: pageCursor } : {})).data.data;
        if (generation !== generationRef.current) return;
        setComments(existing => mergeInto(existing, page.comments));
        updateThread(rootId, { loaded: true, loading: false, nextCursor: page.nextCursor, hasMore: page.hasMore });
      } catch {
        if (generation === generationRef.current) updateThread(rootId, { loading: false, error: "Couldn't load replies." });
      }
    },
    [read, updateThread]
  );

  // Replies grouped under their parent, oldest first, like the thread's own order. Sorting each group (instead of
  // trusting arrival order) keeps a reply posted here in place when older pages arrive later.
  const childrenByParent = useMemo(() => {
    const groups = new Map();
    for (const comment of Object.values(comments)) {
      if (!comment.parent) continue;
      if (!groups.has(comment.parent)) groups.set(comment.parent, []);
      groups.get(comment.parent).push(comment);
    }
    for (const group of groups.values()) group.sort((a, b) => (a._id < b._id ? -1 : 1));
    return groups;
  }, [comments]);

  const updateComment = (commentId, change) =>
    setComments(current => (current[commentId] ? { ...current, [commentId]: { ...current[commentId], ...change } } : current));

  const postComment = async text => {
    const { comment, commentCount } = (await ppi.post("/api/v1/comments", { videoKey, text })).data.data;
    setComments(current => mergeInto(current, [comment]));
    setTopIds(current => [comment._id, ...current.filter(id => id !== comment._id)]);
    setCount(commentCount);
  };

  const actions = {
    // A reply to a level-3 comment comes back under that comment's parent (flattened); `parent` says where it goes.
    reply: async (target, text) => {
      const { comment, commentCount } = (await ppi.post("/api/v1/comments", { videoKey, text, parentId: target._id })).data.data;
      setComments(current => {
        const next = mergeInto(current, [comment]);
        if (next[comment.parent]) next[comment.parent] = { ...next[comment.parent], replyCount: next[comment.parent].replyCount + 1 };
        if (next[comment.root]) next[comment.root] = { ...next[comment.root], threadReplyCount: next[comment.root].threadReplyCount + 1 };
        return next;
      });
      setCount(commentCount);

      // Show the thread. One that isn't loaded yet loads now, and then includes the new reply.
      if (threadsRef.current[comment.root]?.loaded) updateThread(comment.root, { open: true });
      else loadReplies(comment.root);
    },

    edit: async (comment, text) => {
      const updated = (await ppi.patch(`/api/v1/comments/${comment._id}`, { text })).data.data;
      updateComment(comment._id, updated);
    },

    remove: async comment => {
      const { mode, removedIds, commentCount } = (await ppi.delete(`/api/v1/comments/${comment._id}`)).data.data;
      setCount(commentCount);

      if (mode === "soft") {
        updateComment(comment._id, { deleted: true, text: "", author: null, likeCount: 0, likedByMe: false, isMine: false });
        return;
      }

      // Mirror the server: each removed comment (the deleted one, then the placeholders it left empty) takes one
      // reply off its parent and one off its thread.
      setComments(current => {
        const next = { ...current };
        for (const removedId of removedIds) {
          const removed = next[removedId];
          if (!removed) continue;
          if (removed.parent && next[removed.parent]) {
            next[removed.parent] = { ...next[removed.parent], replyCount: Math.max(0, next[removed.parent].replyCount - 1) };
          }
          if (removed.root && next[removed.root]) {
            next[removed.root] = { ...next[removed.root], threadReplyCount: Math.max(0, next[removed.root].threadReplyCount - 1) };
          }
          delete next[removedId];
        }
        return next;
      });
      setTopIds(current => current.filter(id => !removedIds.includes(id)));
    },

    // Optimistic, rolled back if the request fails, then set to what the server counted.
    like: async comment => {
      const before = { likedByMe: comment.likedByMe, likeCount: comment.likeCount };
      updateComment(comment._id, {
        likedByMe: !comment.likedByMe,
        likeCount: Math.max(0, comment.likeCount + (comment.likedByMe ? -1 : 1)),
      });

      try {
        const url = `/api/v1/comments/${comment._id}/like`;
        const { liked, likeCount } = (comment.likedByMe ? await ppi.delete(url) : await ppi.put(url)).data.data;
        updateComment(comment._id, { likedByMe: liked, likeCount });
      } catch {
        updateComment(comment._id, before);
      }
    },

    // The first click loads the thread; later clicks just hide and show it.
    toggleThread: root => {
      const thread = threadsRef.current[root._id];
      if (!thread?.loaded && !thread?.loading) loadReplies(root._id);
      else updateThread(root._id, { open: !thread.open });
    },

    loadReplies: root => loadReplies(root._id),
  };

  return (
    <section className="mt-8" aria-label="Comments">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{count === null || count === undefined ? "Comments" : countLabel(count)}</h2>
        <div className="flex gap-2" role="group" aria-label="Sort comments">
          {SORTS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSort(option.value)}
              aria-pressed={sort === option.value}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition ${sort === option.value ? "bg-white/20" : "bg-white/5 hover:bg-white/10"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {user ? (
          <div className="flex gap-3">
            <span
              className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm font-bold"
              aria-hidden="true"
            >
              {getInitial(user.fullName)}
            </span>
            <CommentComposer placeholder="Add a comment…" onSubmit={postComment} />
          </div>
        ) : (
          <LoginPrompt
            message="Log in to join the conversation."
            returnTo={returnTo}
            className="p-4 rounded-xl bg-white/5 border border-white/10"
          />
        )}
      </div>

      <div className="mt-6">
        {status === "loading" && <p className="text-sm text-white/50">Loading comments…</p>}
        {status === "error" && (
          <p className="text-sm text-red-400">
            Couldn&apos;t load comments.{" "}
            <button type="button" onClick={() => setReloadKey(current => current + 1)} className="underline hover:text-white">
              Try again
            </button>
          </p>
        )}
        {status === "ready" && topIds.length === 0 && (
          <p className="text-sm text-white/50">{user ? "No comments yet. Be the first." : "No comments yet."}</p>
        )}

        {topIds.length > 0 && (
          <ul className="space-y-6">
            {topIds
              .filter(id => comments[id])
              .map(id => (
                <li key={id}>
                  <CommentItem
                    comment={comments[id]}
                    childrenByParent={childrenByParent}
                    threads={threads}
                    actions={actions}
                    loggedIn={Boolean(user)}
                    returnTo={returnTo}
                  />
                </li>
              ))}
          </ul>
        )}

        {status === "ready" && hasMore && (
          <button
            type="button"
            onClick={loadMoreComments}
            disabled={loadingMore}
            className="mt-6 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Show more comments"}
          </button>
        )}
        {moreError && <p className="mt-2 text-sm text-red-400">{moreError}</p>}
      </div>
    </section>
  );
}

export default CommentSection;
