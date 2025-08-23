import { Link } from 'react-router-dom';
import React, { useState } from 'react';
import axios from 'axios';
import { useEffect } from 'react';
import { useRef, useCallback } from 'react';

// --- Reusable UI Components ---

// A sleek, glass-like search bar component
const SearchBar = ({ onSearch, loading }) => (
  <form onSubmit={onSearch} className="w-full max-w-2xl mx-auto">
    <div className="relative">
      <input
        type="search"
        name="query"
        disabled={loading}
        placeholder="Search for any video..."
        className="w-full p-4 pr-12 text-lg text-white bg-white/10 rounded-full border border-white/20 focus:outline-none focus:ring-2 focus:ring-purple-500 backdrop-blur-sm transition-all duration-300 disabled:opacity-50"
      />
      <button type="submit" disabled={loading} className="absolute top-1/2 right-4 -translate-y-1/2 text-white/50 hover:text-white transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    </div>
  </form>
);

const VideoCard = ({ video }) => (
  <Link to={`/watch/${video.platformVideoId}`}> {/* Use Link to navigate */}
    <div className="bg-white/5 p-4 rounded-xl border border-white/10 shadow-lg group transform hover:-translate-y-2 transition-all duration-300 cursor-pointer">
      <div className="relative mb-4 aspect-video rounded-lg overflow-hidden">
        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="text-white bg-purple-600/70 py-2 px-4 rounded-full backdrop-blur-sm">
            Watch Now
          </div>
        </div>
      </div>
      <h3 className="text-lg font-bold text-white truncate">{video.title}</h3>
      <p className="text-sm text-white/60">{video.channelTitle}</p>
    </div>
  </Link>
);

// A simple loading spinner component
const Loader = () => (
  <div className="flex justify-center items-center py-12">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
  </div>
);

function Home() {
    // ... all of your existing state and handleSearch logic from the old App.jsx goes here
    const [query, setQuery] = useState('');
  const [videos, setVideos] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);


    useEffect(() => {
    // This will run every time the 'videos' state is updated
    console.log("Videos state has been updated:", videos);
  }, [videos]);

  const fetchVideos = async (searchQuery, token = '') => {
    if (!searchQuery) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`http://localhost:8000/api/v1/videos/search?q=${searchQuery}&pageToken=${token}`);
      const { videos: newVideos, nextPageToken: newNextPageToken } = response.data.data;
      
      // If it's a new search (no token), replace videos. Otherwise, append them.
      setVideos(prevVideos => token ? [...prevVideos, ...newVideos] : newVideos);
      setNextPageToken(newNextPageToken);
    } catch (err) {
      setError('Oops! Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // --- Search Handler ---
  const handleSearch = (event) => {
    event.preventDefault();
    const newQuery = event.target.elements.query.value;
    setQuery(newQuery);
    setVideos([]); // Clear previous results
    fetchVideos(newQuery);
  };
  
  // --- Infinite Scroll Logic ---
  const observer = useRef();
  const lastVideoElementRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && nextPageToken) {
        // User has scrolled to the last video, and there's a next page
        fetchVideos(query, nextPageToken);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, nextPageToken, query]);


    
  return (
    <div className="min-h-screen font-sans p-4 sm:p-8">
        <header className="text-center my-8 sm:my-16">
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight">
                <span className="bg-gradient-to-r from-purple-400 to-pink-600 text-transparent bg-clip-text">
                    Video Treasure
                </span>
            </h1>
            <p className="text-white/60 mt-4 text-lg">Your one-stop portal to the world's video content.</p>
        </header>

        <main>
            <SearchBar onSearch={handleSearch} loading={loading} />
            {/* ... rest of your JSX from the old App.jsx */}
        {loading && <Loader />}
        
        {error && <p className="text-center text-red-400 mt-8">{error}</p>}
        
        {!loading && !error && hasSearched && videos.length === 0 && (
          <p className="text-center text-white/50 mt-8">No videos found. Try a different search!</p>
        )}

        {videos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-12">
            {videos.map((video, index) => {
              // If this is the last video, attach the ref to it
              if (videos.length === index + 1) {
                return (
                  <div ref={lastVideoElementRef} key={video.platformVideoId}>
                    <VideoCard video={video} />
                  </div>
                );
              } else {
                return <VideoCard key={video.platformVideoId} video={video} />;
              }
            })}
          </div>
        )}
        
        {/* Show loader at the bottom when fetching more videos */}
        {loading && videos.length > 0 && <Loader />}
        </main>
    </div>
  );
}

export default Home;