import React, { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { useAuth, useSearch } from "../context/AppContext";
import ppi, { requestAsViewer } from "../api/axios";
import { SaveToPlaylistButton } from "../components/SaveToPlaylistDialog";
import LoginPrompt from "../components/LoginPrompt";
import VideoDescription from "../components/VideoDescription";
import { formatCount } from "../utils/format";

const pillClass = "inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold border transition";
const neutralPillClass = `${pillClass} bg-white/10 hover:bg-white/20 border-white/20`;
const likedPillClass = `${pillClass} bg-pink-600 hover:bg-pink-700 border-pink-500`;

const buildEmbedUrl = (platform, id) => {
  if (platform === "dailymotion") {
    return `https://www.dailymotion.com/embed/video/${id}?autoplay=1`;
  }

  return `https://www.youtube.com/embed/${id}?autoplay=1`;
};

// The first letter (not half of an emoji) for the channel's avatar.
const getInitial = name => (Array.from((name || "").trim())[0] || "?").toUpperCase();

function Player() {
  const { platform = "youtube", id } = useParams();
  const { user, loading: authLoading, likedVideoIds, toggleLike } = useAuth();
  const { videos } = useSearch();
  const location = useLocation();
  // { video, appStats } from the details endpoint, null until it arrives (and for a video we don't have).
  const [details, setDetails] = useState(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const embedUrl = buildEmbedUrl(platform, id);
  const title =
    platform === "dailymotion" ? "Dailymotion video player" : "YouTube video player";
  const userId = user?._id;

  // Our like count depends on who asks (likedByMe), so the details are loaded once the session check is done, and
  // again when the user logs in or out. A 404 (a video we never cached) or a failed request keeps what the router
  // state gave: placeholders at worst, no description box, no error page. Details of the previous video are never
  // shown for this one (see detailsVideo below).
  useEffect(() => {
    if (authLoading) return undefined;
    let cancelled = false;

    const requestDetails = () => ppi.get(`/api/v1/videos/${platform}/${encodeURIComponent(id)}`);

    requestAsViewer(requestDetails, { loggedIn: Boolean(userId) })
      .then(response => {
        if (!cancelled) setDetails(response.data.data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [platform, id, userId, authLoading]);

  // The card that linked here passes the video in the router state (playlists, likes, search). The current search's
  // list is the fallback, then placeholders, e.g. for a link opened in a new tab. Shown at once; the details replace
  // it when they arrive.
  const isThisVideo = video => video?.platform === platform && video?.platformVideoId === id;
  const videoFromState = isThisVideo(location.state?.video) ? location.state.video : null;
  const knownVideo = videoFromState || videos.find(isThisVideo);
  const fallbackVideo = {
    platform,
    platformVideoId: id,
    title: `Video (${platform})`,
    thumbnail:
      platform === "dailymotion"
        ? `https://www.dailymotion.com/thumbnail/video/${id}`
        : `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    channelTitle: "Unknown channel",
  };
  const detailsVideo = details && isThisVideo(details.video) ? details.video : null;
  const video = detailsVideo || knownVideo || fallbackVideo;
  // Likes and saves post the whole object, and the JSON body limit is 16 kB. The row exists when the details do, so
  // the backend doesn't need the description to find it.
  const videoForActions = detailsVideo ? { ...detailsVideo, description: undefined } : video;

  const videoKey = `${platform}:${id}`;
  const isLiked = likedVideoIds.has(videoKey);
  // Derived from AppContext's optimistic like (and its rollback) instead of a second copy of the state.
  const appStats = detailsVideo ? details.appStats : null;
  const likeCount = appStats ? appStats.likes - (appStats.likedByMe ? 1 : 0) + (isLiked ? 1 : 0) : 0;

  const handleLike = () => {
    if (!user) {
      setShowLoginPrompt(true);
      return;
    }
    toggleLike(videoForActions);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Link to="/" className="inline-block mb-3 text-sm text-white/70 hover:text-white transition-colors">
        ← Back to search
      </Link>

      {/* The embedded video player. YouTube requires a viewport of at least 200 x 200 px, which a 16:9 player
          on a narrow phone wouldn't reach. The explicit width keeps the minimum height from widening the player
          past the screen, and 202 px leaves 200 inside the 1 px border. */}
      <div className="w-full aspect-video min-h-[202px] rounded-xl overflow-hidden shadow-2xl shadow-purple-500/20 border border-white/10">
        <iframe
          width="100%"
          height="100%"
          src={embedUrl}
          title={title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      </div>

      <h1 className="mt-4 text-xl sm:text-2xl font-bold break-words">{video.title}</h1>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold"
            aria-hidden="true"
          >
            {getInitial(video.channelTitle)}
          </span>
          <span className="font-semibold truncate">{video.channelTitle}</span>
          <span className="shrink-0 text-xs px-2 py-1 rounded-full bg-black/70 uppercase">{platform}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLike}
            className={isLiked ? likedPillClass : neutralPillClass}
            aria-pressed={isLiked}
            aria-label={likeCount > 0 ? `Like, ${likeCount} ${likeCount === 1 ? "like" : "likes"} on Video Treasure` : "Like"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill={isLiked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.5l1.318-1.182a4.5 4.5 0 116.364 6.364L12 20.25l-7.682-7.682a4.5 4.5 0 010-6.364z"
              />
            </svg>
            <span>{likeCount > 0 ? formatCount(likeCount) : "Like"}</span>
          </button>
          <SaveToPlaylistButton video={videoForActions} label className={neutralPillClass} />
        </div>
      </div>

      {showLoginPrompt && !user && (
        <LoginPrompt message="Log in to like videos." className="mt-3 p-4 rounded-xl bg-white/5 border border-white/10" />
      )}

      {detailsVideo && <VideoDescription key={videoKey} video={detailsVideo} />}
    </div>
  );
}

export default Player;
