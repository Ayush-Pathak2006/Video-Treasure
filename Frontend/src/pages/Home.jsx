import { Link } from 'react-router-dom';
import React, { useState, useRef, useCallback } from 'react';
import Header from '../components/Header';
import { useAuth } from '../context/AppContext';
import { useSearch } from '../context/AppContext';
import ppi from '../api/axios';



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

const VideoCard = ({ video }) => {
  const { user, likedVideoIds, toggleLike } = useAuth();

  const isLiked = likedVideoIds.has(video.platformVideoId);

  const handleLike = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleLike(video);

    if (!user) {
      alert("Please log in to like videos.");
      return;
    }

    const newLikedIds = new Set(likedVideoIds);
    if (isLiked) {
      newLikedIds.delete(video.platformVideoId);
    } else {
      newLikedIds.add(video.platformVideoId);
    }

    // setLikedVideoIds(newLikedIds);

    try {
      const videoData = {
        platformVideoId: video.platformVideoId,
        title: video.title,
        thumbnail: video.thumbnail,
        channelTitle: video.channelTitle,
      };

      const response = await ppi.post('/api/v1/likes/toggle', videoData, { withCredentials: true });

      // setIsLiked(prev => !prev);
    } catch (error) {
      console.error("Failed to toggle like:", error);

    }
  };

  return (
    <div className="bg-white/5 p-4 rounded-xl border border-white/10 shadow-lg group transform hover:-translate-y-2 transition-all duration-300 cursor-pointer relative">
      <Link to={`/watch/${video.platformVideoId}`} className="block">
        <div className="relative mb-4 aspect-video rounded-lg overflow-hidden">
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="text-white bg-purple-600/70 py-2 px-4 rounded-full backdrop-blur-sm">
              Watch Now
            </div>
          </div>
        </div>
        <div className="mb-2">
          <h3 className="text-lg font-bold text-white">{video.title}</h3>
          <p className="text-sm text-white/60">{video.channelTitle}</p>
        </div>
      </Link>
      {/* Like button positioned absolutely */}
      {user && (
        <button onClick={handleLike} className="absolute top-2 right-2 text-red-500 transition-colors p-1 bg-black/20 rounded-full z-10 flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill={isLiked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.5l1.318-1.182a4.5 4.5 0 116.364 6.364L12 20.25l-7.682-7.682a4.5 4.5 0 010-6.364z" />
          </svg>
        </button>
      )}
    </div>
  );
};

const Loader = () => (
  <div className="flex justify-center items-center py-12">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
  </div>
);

function Home() {

  const { loading: authLoading } = useAuth();
  const { query, setQuery, videos, setVideos, nextPageToken, setNextPageToken } = useSearch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);



  const fetchVideos = async (searchQuery, cursorValue = null) => {
    if (!searchQuery || loading || !hasMore) return;

    setLoading(true);

    try {
      const res = await ppi.get("/api/v1/videos/search", {
        params: {
          q: searchQuery,
          cursor: cursorValue,
        },
      });

      const { videos: newVideos, nextCursor } = res.data.data;

      setVideos(prev =>
        cursorValue ? [...prev, ...newVideos] : newVideos
      );

      setCursor(nextCursor);
      setHasMore(newVideos.length > 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };




  const handleSearch = (event) => {
  event.preventDefault();

  const newQuery = event.target.elements.query.value.trim();
  if (!newQuery) return;

  setHasSearched(true);   // ✅ ADD THIS
  setQuery(newQuery);
  setVideos([]);
  setCursor(null);
  setHasMore(true);

  fetchVideos(newQuery, null);
};




 const observer = useRef();

const lastVideoElementRef = useCallback(
  (node) => {
    if (loading) return;
    if (!hasMore) return;

    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        fetchVideos(query, cursor);
      }
    });

    if (node) observer.current.observe(node);
  },
  [loading, hasMore, cursor, query]
);


  if (authLoading) {
    return <Loader />;
  }

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
      <Header />

      <main>

        <SearchBar onSearch={handleSearch} loading={loading} />

        {loading && <Loader />}

        {error && <p className="text-center text-red-400 mt-8">{error}</p>}

        {!loading && !error && hasSearched && videos.length === 0 && (
          <p className="text-center text-white/50 mt-8">No videos found. Try a different search!</p>
        )}

        {videos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-12">
            {videos.map((video, index) => {
              if (videos.length === index + 1) {
                return (
                  <div ref={lastVideoElementRef} key={video.platformVideoId}>
                    <VideoCard video={video} />
                  </div>
                );
              }
              return <VideoCard key={video.platformVideoId} video={video} />;
            })}

          </div>
        )}


        {loading && videos.length > 0 && <Loader />}
      </main>
    </div>
  );
}

export default Home;