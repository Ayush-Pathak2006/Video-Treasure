import React from 'react';
import { useParams, Link } from 'react-router-dom';

function Player() {
  const { id } = useParams(); // Gets the video ID from the URL (e.g., /watch/videoId)
  const youtubeUrl = `https://www.youtube.com/embed/${id}?autoplay=1`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* The embedded video player */}
        <div className="aspect-video rounded-xl overflow-hidden shadow-2xl shadow-purple-500/20 border border-white/10">
          <iframe
            width="100%"
            height="100%"
            src={youtubeUrl}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>
        
        {/* Back to Home Button */}
        <div className="mt-8 text-center">
            <Link 
                to="/"
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-full transition-all duration-300"
            >
                ← Back to Search
            </Link>
        </div>
      </div>
    </div>
  );
}

export default Player;