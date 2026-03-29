import { Link } from "react-router-dom";
import React, { useState, useRef, useCallback, useEffect } from "react";
import Header from "../components/Header";
import { useAuth, useSearch } from "../context/AppContext";
import ppi from "../api/axios";

const PAGE_SIZE_PER_PLATFORM = 4;
const SUPPORTED_PLATFORMS = ["youtube", "dailymotion"];

const getVideoKey = video => `${video.platform}:${video.platformVideoId}`;

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
      <button
        type="submit"
        disabled={loading}
        className="absolute top-1/2 right-4 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    </div>
  </form>
);

const VideoCard = ({ video, fullWidth = false }) => {
  const { user, likedVideoIds, toggleLike } = useAuth();
  const videoKey = getVideoKey(video);
  const isLiked = likedVideoIds.has(videoKey);

  const handleLike = event => {
    event.preventDefault();
    event.stopPropagation();

    if (!user) {
      alert("Please log in to like videos.");
      return;
    }

    toggleLike(video);
  };

  return (
    <div
      className={`bg-white/5 p-4 rounded-xl border border-white/10 shadow-lg group transform hover:-translate-y-1 transition-all duration-300 cursor-pointer relative ${fullWidth ? "w-full" : "min-w-[320px] max-w-[320px]"}`}
    >
      <Link to={`/watch/${video.platform}/${video.platformVideoId}`} className="block">
        <div className="relative mb-4 aspect-video rounded-lg overflow-hidden">
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          <span className="absolute top-2 left-2 text-xs px-2 py-1 rounded-full bg-black/70 uppercase">{video.platform}</span>
        </div>
        <div className="mb-2">
          <h3 className="text-lg font-bold text-white line-clamp-2">{video.title}</h3>
          <p className="text-sm text-white/60 line-clamp-1">{video.channelTitle}</p>
        </div>
      </Link>

      {user && (
        <button onClick={handleLike} className="absolute top-2 right-2 text-red-500 transition-colors p-1 bg-black/20 rounded-full z-10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill={isLiked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.5l1.318-1.182a4.5 4.5 0 116.364 6.364L12 20.25l-7.682-7.682a4.5 4.5 0 010-6.364z"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

const PlatformHeading = ({ title, expandedPlatform, onToggle }) => {
  const isExpanded = expandedPlatform === title.toLowerCase();

  return (
    <button onClick={onToggle} className="flex items-center gap-2 text-3xl font-extrabold tracking-wide uppercase">
      <span>{title}</span>
      <span className={`transition-transform ${isExpanded ? "rotate-180" : "rotate-0"}`}>⌄</span>
    </button>
  );
};

const HorizontalSection = ({ title, videos, containerRef, onScrollLeft, onScrollRight, expandedPlatform, onToggleExpand }) => {
  if (!videos.length) return null;

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <PlatformHeading title={title} expandedPlatform={expandedPlatform} onToggle={onToggleExpand} />
        <div className="flex items-center gap-2">
          <button onClick={onScrollLeft} className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/20">
            ‹
          </button>
          <button onClick={onScrollRight} className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/20">
            ›
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex gap-4 overflow-x-auto pb-3 scroll-smooth hide-scrollbar">
        {videos.map((video, index) => (
          <VideoCard key={`${getVideoKey(video)}-${index}`} video={video} />
        ))}
      </div>
    </section>
  );
};

const ExpandedGridSection = ({ title, videos, expandedPlatform, onToggleExpand }) => (
  <section className="mt-10">
    <div className="mb-4">
      <PlatformHeading title={title} expandedPlatform={expandedPlatform} onToggle={onToggleExpand} />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {videos.map((video, index) => (
        <div key={`${getVideoKey(video)}-${index}`} className="min-w-0">
          <VideoCard video={video} fullWidth />
        </div>
      ))}
    </div>
  </section>
);

function Home() {
  const { loading: authLoading } = useAuth();
  const { query, setQuery, videos, setVideos } = useSearch();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedPlatform, setExpandedPlatform] = useState(null);

  const [videosByPlatform, setVideosByPlatform] = useState({ youtube: [], dailymotion: [] });
  const [pagination, setPagination] = useState({
    youtube: { cursor: null, hasMore: true, terminalReason: null },
    dailymotion: { cursor: null, hasMore: true, terminalReason: null },
  });

  const youtubeRailRef = useRef(null);
  const dailymotionRailRef = useRef(null);
  const observer = useRef(null);

  const mergeUniqueVideos = useCallback((existingVideos, incomingVideos) => {
    const seen = new Set(existingVideos.map(video => getVideoKey(video)));

    const uniqueIncoming = incomingVideos.filter(video => {
      const key = getVideoKey(video);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return [...existingVideos, ...uniqueIncoming];
  }, []);

  const flattenByPlatform = useCallback(byPlatform => [...byPlatform.youtube, ...byPlatform.dailymotion], []);

  const fetchPlatformVideos = useCallback(
    async ({ searchQuery, platform, cursorValue = null, isLoadMore = false }) => {
      if (!searchQuery || !platform) return;
      if (isLoadMore && !cursorValue) return;

      setLoading(true);
      setError(null);

      try {
        const response = await ppi.get("/api/v1/videos/search", {
          params: {
            q: searchQuery,
            cursor: cursorValue,
            platform,
            limit: PAGE_SIZE_PER_PLATFORM,
          },
        });

        const { videos: newVideos, nextCursor, hasMore, terminalReasonByPlatform } = response.data.data;

        setVideosByPlatform(previous => {
          const currentPlatformVideos = previous[platform] || [];
          const updatedPlatformVideos = isLoadMore ? mergeUniqueVideos(currentPlatformVideos, newVideos) : newVideos;
          const updatedState = { ...previous, [platform]: updatedPlatformVideos };
          setVideos(flattenByPlatform(updatedState));
          return updatedState;
        });

        setPagination(previous => ({
          ...previous,
          [platform]: {
            cursor: nextCursor,
            hasMore,
            terminalReason: terminalReasonByPlatform?.[platform] || null,
          },
        }));
      } catch (requestError) {
        console.error(requestError);
        setError("Could not fetch videos. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [mergeUniqueVideos, setVideos, flattenByPlatform]
  );

  const handleSearch = async event => {
    event.preventDefault();
    const newQuery = event.target.elements.query.value.trim();
    if (!newQuery) return;

    setHasSearched(true);
    setQuery(newQuery);
    setExpandedPlatform(null);
    setVideos([]);
    setVideosByPlatform({ youtube: [], dailymotion: [] });
    setPagination({
      youtube: { cursor: null, hasMore: true, terminalReason: null },
      dailymotion: { cursor: null, hasMore: true, terminalReason: null },
    });

    await Promise.all(
      SUPPORTED_PLATFORMS.map(platform =>
        fetchPlatformVideos({ searchQuery: newQuery, platform, cursorValue: null, isLoadMore: false })
      )
    );
  };

  const loadMoreExpandedVideos = useCallback(() => {
    if (!expandedPlatform || !query || loading) return;

    const platformState = pagination[expandedPlatform];
    if (!platformState?.hasMore || !platformState?.cursor) return;

    fetchPlatformVideos({
      searchQuery: query,
      platform: expandedPlatform,
      cursorValue: platformState.cursor,
      isLoadMore: true,
    });
  }, [expandedPlatform, query, loading, pagination, fetchPlatformVideos]);

  const loadMoreRef = useCallback(
    node => {
      if (observer.current) {
        observer.current.disconnect();
      }

      if (!node || !expandedPlatform || loading) return;

      const platformState = pagination[expandedPlatform];
      if (!platformState?.hasMore) return;

      observer.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          loadMoreExpandedVideos();
        }
      });

      observer.current.observe(node);
    },
    [expandedPlatform, loading, pagination, loadMoreExpandedVideos]
  );

  useEffect(
    () => () => {
      observer.current?.disconnect();
    },
    []
  );

  const scrollRailBy = (railRef, delta) => {
    if (!railRef.current) return;
    railRef.current.scrollBy({ left: delta, behavior: "smooth" });
  };

  const toggleExpand = platform => {
    setExpandedPlatform(current => (current === platform ? null : platform));
  };

  const hasAnyVideos = videos.length > 0;
  const activePlatformState = expandedPlatform ? pagination[expandedPlatform] : null;

  if (authLoading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="min-h-screen font-sans p-4 sm:p-8">
      <header className="text-center my-8 sm:my-16">
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-purple-400 to-pink-600 text-transparent bg-clip-text">Video Treasure</span>
        </h1>
      </header>

      <Header />

      <main>
        <SearchBar onSearch={handleSearch} loading={loading} />

        {error && <p className="text-center text-red-400 mt-8">{error}</p>}

        {!loading && !error && hasSearched && !hasAnyVideos && (
          <p className="text-center text-white/50 mt-8">No videos found. Try a different search.</p>
        )}

        {hasAnyVideos && expandedPlatform === null && (
          <>
            <HorizontalSection
              title="YouTube"
              videos={videosByPlatform.youtube}
              containerRef={youtubeRailRef}
              onScrollLeft={() => scrollRailBy(youtubeRailRef, -900)}
              onScrollRight={() => scrollRailBy(youtubeRailRef, 900)}
              expandedPlatform={expandedPlatform}
              onToggleExpand={() => toggleExpand("youtube")}
            />

            <HorizontalSection
              title="Dailymotion"
              videos={videosByPlatform.dailymotion}
              containerRef={dailymotionRailRef}
              onScrollLeft={() => scrollRailBy(dailymotionRailRef, -900)}
              onScrollRight={() => scrollRailBy(dailymotionRailRef, 900)}
              expandedPlatform={expandedPlatform}
              onToggleExpand={() => toggleExpand("dailymotion")}
            />
          </>
        )}

        {hasAnyVideos && expandedPlatform === "youtube" && (
          <ExpandedGridSection
            title="YouTube"
            videos={videosByPlatform.youtube}
            expandedPlatform={expandedPlatform}
            onToggleExpand={() => toggleExpand("youtube")}
          />
        )}

        {hasAnyVideos && expandedPlatform === "dailymotion" && (
          <ExpandedGridSection
            title="Dailymotion"
            videos={videosByPlatform.dailymotion}
            expandedPlatform={expandedPlatform}
            onToggleExpand={() => toggleExpand("dailymotion")}
          />
        )}

        {expandedPlatform && <div ref={loadMoreRef} className="h-4" />}

        {!loading && hasSearched && expandedPlatform && activePlatformState && !activePlatformState.hasMore && (
          <p className="text-center text-white/70 mt-8">
            {activePlatformState.terminalReason === "rate_limit_hit"
              ? "API rate limit hit for this platform."
              : "All videos are here."}
          </p>
        )}
      </main>
    </div>
  );
}

export default Home;