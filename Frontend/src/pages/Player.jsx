import React from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { useAuth, useSearch } from "../context/AppContext";
import { SaveToPlaylistButton } from "../components/SaveToPlaylistDialog";

const buildEmbedUrl = (platform, id) => {
  if (platform === "dailymotion") {
    return `https://www.dailymotion.com/embed/video/${id}?autoplay=1`;
  }

  return `https://www.youtube.com/embed/${id}?autoplay=1`;
};

function Player() {
  const { platform = "youtube", id } = useParams();
  const { user, likedVideoIds, toggleLike } = useAuth();
  const { videos } = useSearch();
  const location = useLocation();
  const embedUrl = buildEmbedUrl(platform, id);
  const title =
    platform === "dailymotion" ? "Dailymotion video player" : "YouTube video player";

  // The card that linked here passes the video in the router state (playlists, likes, search). The current search's
  // list is the fallback, then placeholders, e.g. for a link opened in a new tab.
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
  const videoForLike = knownVideo || fallbackVideo;
  const videoKey = `${platform}:${id}`;
  const isLiked = likedVideoIds.has(videoKey);
  const likeLabel = isLiked ? "Unlike" : "Like";

  const handleLike = () => {
    if (!user) {
      alert("Please log in to like videos.");
      return;
    }
    toggleLike(videoForLike);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
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
        
        {/* Back to Home Button */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-full transition-all duration-300"
          >
            ← Back to Search
          </Link>
          <button
            onClick={handleLike}
            className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-6 rounded-full transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={!user}
            title={!user ? "Log in to like videos" : likeLabel}
          >
            {user ? `♥ ${likeLabel}` : "♥ Like (Login Required)"}
          </button>
          <SaveToPlaylistButton
            video={videoForLike}
            label
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold py-2 px-6 rounded-full transition-all duration-300"
          />
        </div>
      </div>
    </div>
  );
}

export default Player;
