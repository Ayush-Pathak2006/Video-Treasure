import React from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth, useSearch } from "../context/AppContext";

const buildEmbedUrl = (platform, id) => {
  if (platform === "dailymotion") {
    return `https://www.dailymotion.com/embed/video/${id}?autoplay=1`;
  }

  return `https://www.youtube.com/embed/${id}?autoplay=1`;
};

function Player() {
  const { platform = "youtube", id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, likedVideoIds, toggleLike } = useAuth();
  const { videos } = useSearch();
  const embedUrl = buildEmbedUrl(platform, id);
  const title =
    platform === "dailymotion" ? "Dailymotion video player" : "YouTube video player";

  const videoFromSearch = videos.find(video => video.platform === platform && video.platformVideoId === id);
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
  const videoForLike = videoFromSearch || fallbackVideo;
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

  const handleBack = () => {
    if (location.state?.from) {
      navigate(-1);
      return;
    }

    navigate("/");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* The embedded video player */}
        <div className="aspect-video rounded-xl overflow-hidden shadow-2xl shadow-purple-500/20 border border-white/10">
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
          <button
            type="button"
            onClick={handleBack}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-full transition-all duration-300"
          >
            ← Back to Search
          </button>
          <button
            onClick={handleLike}
            className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-6 rounded-full transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={!user}
            title={!user ? "Log in to like videos" : likeLabel}
          >
            {user ? `♥ ${likeLabel}` : "♥ Like (Login Required)"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Player;