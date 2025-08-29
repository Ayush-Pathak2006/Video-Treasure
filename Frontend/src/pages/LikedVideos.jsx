import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Header from '../components/Header';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AppContext';
import ppi from '../api/axios';

const LikedVideoCard = ({ video, onUnlike }) => {
  const { toggleLike } = useAuth();

  const handleUnlikeClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleLike(video); // Call the same global function
    onUnlike(video.platformVideoId); // Update the local page state
  };

  return (
    <div className="bg-white/5 p-4 rounded-xl ... relative">
      <Link to={`/watch/${video.platformVideoId}`} className="block">
        <div className="relative mb-4 aspect-video rounded-lg overflow-hidden">
          <img src={video.thumbnail} alt={video.title} />
        </div>
        <h3 className="text-lg font-bold text-white truncate">{video.title}</h3>
        <p className="text-sm text-white/60">{video.channelTitle}</p>
      </Link>
      <button onClick={handleUnlikeClick} className="absolute top-2 right-2 text-red-500 ... z-10">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.5l1.318-1.182a4.5 4.5 0 116.364 6.364L12 20.25l-7.682-7.682a4.5 4.5 0 010-6.364z" />
        </svg>
      </button>
    </div>
  );
};

function LikedVideos() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLikedVideos = async () => {
      try {
        const response = await ppi.get('/api/v1/likes/videos', { withCredentials: true });
        setVideos(response.data.data);
      } catch (error) {
        console.error("Failed to fetch liked videos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLikedVideos();
  }, []);

  // Function to remove a video from the page's state instantly
  const handleUnlike = (platformVideoId) => {
    setVideos(currentVideos => currentVideos.filter(v => v.platformVideoId !== platformVideoId));
  };

  return (
    <div className="min-h-screen font-sans p-4 sm:p-8 pt-24">
      <Header />
      <main>
        <h1 className="text-3xl ... mb-8">My Liked Videos</h1>
        {loading ? (
          <p className="text-white/60">Loading...</p>
        ) : videos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {videos.map(video => (
              <LikedVideoCard key={video._id} video={video} onUnlike={handleUnlike} />
            ))}
          </div>
        ) : (
          <p className="text-white/60">You haven't liked any videos yet.</p>
        )}
      </main>
    </div>
  );
}

export default LikedVideos;