import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ppi from "../api/axios";
import { formatDayHeading, localDayKey } from "../utils/format";

const getVideoKey = video => `${video.platform}:${video.platformVideoId}`;

// The server's order: last watched first, the newer _id first on a tie.
const newestFirst = (a, b) => new Date(b.watchedAt) - new Date(a.watchedAt) || (a._id < b._id ? 1 : -1);

const pillClass = "rounded-full px-4 py-2 text-sm font-semibold border transition-colors disabled:opacity-60";

const HistoryCard = ({ item, onRemove }) => {
  const { video } = item;

  return (
    <div className="bg-white/5 p-4 rounded-xl border border-white/10 shadow-lg relative">
      <Link to={`/watch/${video.platform}/${video.platformVideoId}`} state={{ video }} className="block">
        <div className="relative mb-4 aspect-video rounded-lg overflow-hidden">
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
          <span className="absolute top-2 left-2 text-xs px-2 py-1 rounded-full bg-black/70 uppercase">{video.platform}</span>
        </div>
        <h3 className="text-lg font-bold text-white line-clamp-2">{video.title}</h3>
        <p className="text-sm text-white/60 truncate">{video.channelTitle}</p>
      </Link>
      <div className="absolute top-2 right-2 z-10">
        <button
          type="button"
          onClick={() => onRemove(item)}
          className="p-1.5 rounded-full bg-black/40 text-white/80 hover:text-red-400"
          aria-label={`Remove ${video.title} from your history`}
          title="Remove from history"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

/**
 * The videos a logged-in user watched in the Player, grouped by the viewer's local day, newest first. 30 at a time
 * with "Show more" (a button, as for comments). Entries can be removed one by one (optimistic), all at once (after an
 * inline confirm) or no longer added (pause).
 */
function History() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pausePending, setPausePending] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  // A rewatch in another tab can move an entry between pages, so entries already shown are dropped by _id.
  const addPage = useCallback((page, { replace }) => {
    setItems(current => {
      const kept = replace ? [] : current;
      const seen = new Set(kept.map(item => item._id));
      return [...kept, ...page.items.filter(item => !seen.has(item._id))];
    });
    setNextCursor(page.nextCursor);
    setHasMore(page.hasMore);
    setPaused(page.paused);
  }, []);

  useEffect(() => {
    let cancelled = false;

    ppi
      .get("/api/v1/history")
      .then(response => {
        if (cancelled) return;
        addPage(response.data.data, { replace: true });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [addPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    setError("");

    try {
      const response = await ppi.get("/api/v1/history", { params: { cursor: nextCursor } });
      addPage(response.data.data, { replace: false });
    } catch {
      setError("Couldn't load more of your history.");
    } finally {
      setLoadingMore(false);
    }
  };

  // The entry goes at once, and comes back in its place if the request fails.
  const removeItem = async item => {
    setItems(current => current.filter(entry => entry._id !== item._id));
    setError("");

    try {
      await ppi.delete(`/api/v1/history/${encodeURIComponent(getVideoKey(item.video))}`);
    } catch {
      setItems(current => [...current.filter(entry => entry._id !== item._id), item].sort(newestFirst));
      setError("Couldn't remove the video. Try again.");
    }
  };

  const clearAll = async () => {
    setClearing(true);
    setError("");

    try {
      await ppi.delete("/api/v1/history");
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      setConfirmingClear(false);
    } catch {
      setError("Couldn't clear your history. Try again.");
    } finally {
      setClearing(false);
    }
  };

  const togglePaused = async () => {
    setPausePending(true);
    setError("");

    try {
      const response = await ppi.put("/api/v1/history/paused", { paused: !paused });
      setPaused(response.data.data.paused);
    } catch {
      setError(paused ? "Couldn't resume your history. Try again." : "Couldn't pause your history. Try again.");
    } finally {
      setPausePending(false);
    }
  };

  // Entries come newest first, so each day's entries are next to each other.
  const groups = [];
  for (const item of items) {
    const key = localDayKey(item.watchedAt);
    if (groups.at(-1)?.key !== key) groups.push({ key, heading: formatDayHeading(item.watchedAt), items: [] });
    groups.at(-1).items.push(item);
  }

  return (
    <div className="min-h-screen font-sans p-4 sm:p-8">
      <main>
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-3xl font-bold">My Watch History</h1>

          {status === "ready" && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={togglePaused}
                disabled={pausePending}
                aria-pressed={paused}
                className={`${pillClass} ${paused ? "bg-white/20 border-white/30 hover:bg-white/30" : "bg-white/10 border-white/20 hover:bg-white/20"}`}
              >
                {paused ? "Resume history" : "Pause history"}
              </button>

              {confirmingClear ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-white/80">Clear all watch history?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmingClear(false)}
                    disabled={clearing}
                    className="rounded-full px-3 py-1 font-semibold text-white/80 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={clearing}
                    className="rounded-full bg-pink-600 px-3 py-1 font-semibold text-white hover:bg-pink-500 disabled:opacity-60"
                  >
                    {clearing ? "Clearing…" : "Clear all"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingClear(true)}
                  disabled={!items.length}
                  className={`${pillClass} bg-white/10 border-white/20 hover:bg-white/20`}
                >
                  Clear all watch history
                </button>
              )}
            </div>
          )}
        </div>

        {paused && (
          <p className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 text-white/80">
            History is paused. Videos you watch aren&apos;t added.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-6 text-red-400">
            {error}
          </p>
        )}

        {status === "loading" && <p className="text-white/60">Loading...</p>}
        {status === "error" && <p className="text-red-400">Couldn&apos;t load your history.</p>}
        {status === "ready" && items.length === 0 && <p className="text-white/60">Videos you watch will show up here.</p>}

        {groups.map(group => (
          <section key={group.key} className="mb-10" aria-label={group.heading}>
            <h2 className="mb-4 text-xl font-semibold text-white/90">{group.heading}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {group.items.map(item => (
                <HistoryCard key={item._id} item={item} onRemove={removeItem} />
              ))}
            </div>
          </section>
        ))}

        {status === "ready" && hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        )}
      </main>
    </div>
  );
}

export default History;
