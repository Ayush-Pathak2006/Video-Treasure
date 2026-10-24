import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AppContext";
import ppi, { requestAsViewer } from "../api/axios";
import { formatTimeAgo } from "../utils/format";

// Below lg the list shows this many, then "Show more". From lg up, in its own column, it shows all of them.
const COLLAPSED_COUNT = 8;
const SKELETON_COUNT = 6;

// No view counts: counts on video cards are deferred (CLAUDE.md, "Plan vs. what exists").
const RelatedVideoCard = ({ video }) => (
  <Link
    to={`/watch/${video.platform}/${video.platformVideoId}`}
    state={{ video }}
    className="group flex gap-3 rounded-lg p-1 -m-1 hover:bg-white/5 transition-colors"
  >
    <div className="w-40 shrink-0 aspect-video rounded-lg overflow-hidden bg-white/5">
      <img src={video.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
    </div>
    <div className="min-w-0 flex-1">
      <h3 className="text-sm font-semibold leading-snug text-white line-clamp-2">{video.title}</h3>
      <p className="mt-1 text-xs text-white/60 truncate">{video.channelTitle}</p>
      <p className="mt-1 flex items-center gap-2 text-xs text-white/50">
        <span>{formatTimeAgo(video.publishedAt)}</span>
        <span className="rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] uppercase text-white/80">{video.platform}</span>
      </p>
    </div>
  </Link>
);

const SkeletonCard = () => (
  <div className="flex gap-3 animate-pulse" aria-hidden="true">
    <div className="w-40 shrink-0 aspect-video rounded-lg bg-white/10" />
    <div className="flex-1 space-y-2 py-1">
      <div className="h-3 rounded bg-white/10" />
      <div className="h-3 w-2/3 rounded bg-white/10" />
      <div className="h-2.5 w-1/2 rounded bg-white/10" />
    </div>
  </div>
);

/**
 * "Up next" on the Player: videos from our own database (GET /videos/:platform/:platformVideoId/related). A viewer's
 * watched videos move down, so the list is loaded as the current viewer, once the session check is done and again
 * when the user changes; it doesn't wait for the details request. Skeletons while loading; on failure, or with
 * nothing to show, the section isn't rendered at all.
 */
function RelatedVideos({ platform, platformVideoId, className = "" }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?._id;
  const videoKey = `${platform}:${platformVideoId}`;
  // { key, status: "ready" | "failed", videos }. Another video's answer counts as loading.
  const [result, setResult] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (authLoading) return undefined;
    let cancelled = false;

    const requestRelated = () => ppi.get(`/api/v1/videos/${platform}/${encodeURIComponent(platformVideoId)}/related`);

    requestAsViewer(requestRelated, { loggedIn: Boolean(userId) })
      .then(response => {
        if (!cancelled) setResult({ key: videoKey, status: "ready", videos: response.data.data.videos });
      })
      .catch(() => {
        if (cancelled) return;
        // A failed refresh (another viewer) keeps the list already shown.
        setResult(previous => (previous?.key === videoKey && previous.status === "ready" ? previous : { key: videoKey, status: "failed", videos: [] }));
      });

    return () => {
      cancelled = true;
    };
  }, [platform, platformVideoId, videoKey, userId, authLoading]);

  const status = result?.key === videoKey ? result.status : "loading";
  if (status === "failed" || (status === "ready" && result.videos.length === 0)) return null;

  const videos = status === "ready" ? result.videos : [];

  return (
    <section aria-label="Up next" aria-busy={status === "loading"} className={className}>
      <h2 className="mb-3 text-lg font-bold">Up next</h2>
      <ul className="space-y-3">
        {status === "loading"
          ? Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <li key={index}>
                <SkeletonCard />
              </li>
            ))
          : videos.map((video, index) => (
              <li key={`${video.platform}:${video.platformVideoId}`} className={!expanded && index >= COLLAPSED_COUNT ? "hidden lg:block" : ""}>
                <RelatedVideoCard video={video} />
              </li>
            ))}
      </ul>
      {!expanded && videos.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="lg:hidden mt-4 w-full rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold hover:bg-white/20"
        >
          Show more
        </button>
      )}
    </section>
  );
}

export default RelatedVideos;
