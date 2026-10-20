import { Link } from "react-router-dom";
import React, { useState, useRef, useCallback, useEffect } from "react";
import Header from "../components/Header";
import QuotaLimitCard from "../components/QuotaLimitCard";
import { SaveToPlaylistButton } from "../components/SaveToPlaylistDialog";
import { useAuth, useSearch } from "../context/AppContext";
import ppi, { renewSession } from "../api/axios";
import { YOUTUBE_TERMS_URL } from "../config/site";

const INITIAL_PAGE_SIZE_PER_PLATFORM = 4;
const EXPANDED_PAGE_SIZE_PER_PLATFORM = 4;
const MINIMIZED_LOAD_MORE_PAGE_SIZE = 2;
const SUPPORTED_PLATFORMS = ["youtube", "dailymotion"];
const PLATFORM_NAMES = { youtube: "YouTube", dailymotion: "Dailymotion" };

// Terminal reasons that mean "the API isn't being called right now", not "there are no more videos".
// The limit card shows them, with retryAt.
const LIMIT_REASONS = new Set(["visitor_limit", "daily_limit", "rate_limit_hit", "api_access_denied"]);

// The search to run again after logging in from the limit card. sessionStorage survives Google login's
// full-page redirect.
const RESUME_SEARCH_KEY = "videoTreasure.resumeSearch";

const createPlatformPagination = () => ({
  cursor: null,
  hasMore: true,
  terminalReason: null,
  retryAt: null,
  cachedAhead: 0,
  resolvedQuery: null,
  viewer: null,
});

const createPagination = () => Object.fromEntries(SUPPORTED_PLATFORMS.map(platform => [platform, createPlatformPagination()]));

// The card replaces "more videos" only at the edge of the cache: cached videos are still served past a limit.
const isStoppedByLimit = platformState => !platformState.hasMore && LIMIT_REASONS.has(platformState.terminalReason);
// Minimum time between two load-more requests of one platform. A page already cached in our DB loads twice as
// fast; a page that needs a new API call keeps the full wait, to protect the API quota.
const INFINITE_SCROLL_RATE_LIMIT_MS = 1200;
const CACHED_PAGE_RATE_LIMIT_MS = INFINITE_SCROLL_RATE_LIMIT_MS / 2;
const RAIL_LOAD_MORE_DISTANCE_PX = 120;

const getVideoKey = video => `${video.platform}:${video.platformVideoId}`;

// The backend reports how many videos it already has cached after the last one shown (cachedAhead).
const getLoadMoreIntervalMs = (platformState, pageSize) =>
  platformState.cachedAhead >= pageSize ? CACHED_PAGE_RATE_LIMIT_MS : INFINITE_SCROLL_RATE_LIMIT_MS;

const isNearRailEnd = railElement =>
  railElement.scrollWidth - (railElement.scrollLeft + railElement.clientWidth) <= RAIL_LOAD_MORE_DISTANCE_PX;

const isOnScreen = node => {
  if (!node) return false;
  const { top, bottom } = node.getBoundingClientRect();
  return top < window.innerHeight && bottom > 0;
};

const SearchBar = ({ onSearch, loading, searchInput, onSearchInputChange }) => (
  <form onSubmit={onSearch} className="w-full max-w-2xl mx-auto">
    <div className="relative">
      <input
        type="search"
        name="query"
        value={searchInput}
        onChange={onSearchInputChange}
        disabled={loading}
        placeholder="Search for any video..."
        className="w-full appearance-none p-4 pr-12 text-lg text-white placeholder:text-white/60 bg-white/10 rounded-full border border-white/20 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-purple-500 backdrop-blur-sm transition-all duration-300 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={loading}
        className="absolute top-1/2 right-4 -translate-y-1/2 text-purple-200 hover:text-white transition-colors z-10"
        aria-label="Search"
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
      {/* The video travels in the router state too, so the Player has its details even after the search changes. */}
      <Link to={`/watch/${video.platform}/${video.platformVideoId}`} state={{ video }} className="block">
        <div className="relative mb-4 aspect-video rounded-lg overflow-hidden">
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          <span className="absolute top-2 left-2 text-xs px-2 py-1 rounded-full bg-black/70 uppercase">{video.platform}</span>
        </div>
        <div className="mb-2">
          <h3 className="text-lg font-bold text-white line-clamp-2">{video.title}</h3>
          <p className="text-sm text-white/60 line-clamp-1">{video.channelTitle}</p>
        </div>
      </Link>

      <div className="absolute top-2 right-2 flex gap-1 z-10">
        <SaveToPlaylistButton video={video} className="p-1 rounded-full bg-black/20 text-white/80 hover:text-white transition-colors" />
        {user && (
          <button onClick={handleLike} className="text-red-500 transition-colors p-1 bg-black/20 rounded-full">
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
    </div>
  );
};

const PlatformHeading = ({ title, expandedPlatform, onToggle }) => {
  const isExpanded = expandedPlatform === title.toLowerCase();

  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-3 text-3xl font-extrabold tracking-wide uppercase group"
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? "Minimize" : "Expand"} ${title} section`}
    >
      <span>{title}</span>
      <span
        className={`h-8 w-8 rounded-full border border-white/30 bg-white/10 flex items-center justify-center shadow-md group-hover:bg-white/20 transition-all duration-300 ${
          isExpanded ? "shadow-purple-500/30" : ""
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-5 w-5 text-purple-100 transition-transform duration-300 ${isExpanded ? "rotate-180" : "rotate-0"}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    </button>
  );
};

// `footer` is shown after the last card, inside the rail (the limit card). `heading` replaces the expand toggle
// (the trending rails can't be expanded).
const HorizontalSection = ({ title, videos, containerRef, onScrollLeft, onScrollRight, expandedPlatform, onToggleExpand, footer, heading }) => {
  if (!videos.length && !footer) return null;

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-4">
        {heading || <PlatformHeading title={title} expandedPlatform={expandedPlatform} onToggle={onToggleExpand} />}
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
        {footer}
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
  const { user, loading: authLoading } = useAuth();
  const { query, setQuery, setVideos } = useSearch();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedPlatform, setExpandedPlatform] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  // Set when the backend answered with a similar cached search instead of the typed text.
  const [searchNotice, setSearchNotice] = useState(null);

  const [videosByPlatform, setVideosByPlatform] = useState({ youtube: [], dailymotion: [] });
  const [pagination, setPagination] = useState(createPagination);

  const youtubeRailRef = useRef(null);
  const dailymotionRailRef = useRef(null);
  const railRefsByPlatform = { youtube: youtubeRailRef, dailymotion: dailymotionRailRef };
  // "Trending in India", shown before the first search. Served from the backend's snapshots, so it costs no quota.
  const [trendingByPlatform, setTrendingByPlatform] = useState(null);
  const trendingYoutubeRailRef = useRef(null);
  const trendingDailymotionRailRef = useRef(null);
  const trendingRailRefs = { youtube: trendingYoutubeRailRef, dailymotion: trendingDailymotionRailRef };
  const loadMoreNodeRef = useRef(null);
  const horizontalLoadInFlightRef = useRef({ youtube: false, dailymotion: false });
  const lastLoadMoreAtRef = useRef({
    youtube: 0,
    dailymotion: 0,
  });
  const delayedLoadTimersRef = useRef({ youtube: null, dailymotion: null });
  // Latest "load more if the user is at the end of this platform's list", for scroll listeners and timers.
  const loadMoreIfAtEndRef = useRef(() => {});

  const resetLoadMoreRateLimit = useCallback(() => {
    lastLoadMoreAtRef.current = {
      youtube: 0,
      dailymotion: 0,
    };
    Object.values(delayedLoadTimersRef.current).forEach(clearTimeout);
    delayedLoadTimersRef.current = { youtube: null, dailymotion: null };
  }, []);

  // One load per platform per interval. A load asked for during the wait isn't dropped: it runs when the wait
  // ends, so a user who stopped at the end of a list doesn't have to scroll again to get more videos.
  const canTriggerLoadMore = useCallback((platform, intervalMs) => {
    const waitMs = (lastLoadMoreAtRef.current[platform] || 0) + intervalMs - Date.now();

    if (waitMs > 0) {
      if (!delayedLoadTimersRef.current[platform]) {
        delayedLoadTimersRef.current[platform] = setTimeout(() => {
          delayedLoadTimersRef.current[platform] = null;
          loadMoreIfAtEndRef.current(platform);
        }, waitMs);
      }

      return false;
    }

    lastLoadMoreAtRef.current[platform] = Date.now();
    return true;
  }, []);

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
    async ({
      searchQuery,
      platform,
      cursorValue = null,
      isLoadMore = false,
      limit = INITIAL_PAGE_SIZE_PER_PLATFORM,
      exact = false,
    }) => {
      if (!searchQuery || !platform) return;
      if (isLoadMore && !cursorValue) return;

      setLoading(true);
      setError(null);

      try {
        const requestPage = () =>
          ppi.get("/api/v1/videos/search", {
            params: {
              q: searchQuery,
              cursor: cursorValue,
              platform,
              limit,
              ...(exact && { exact: true }),
            },
          });

        let response = await requestPage();

        // Search is public, so an expired access token doesn't fail with 401: it just counts as anonymous.
        // Renew the session once and ask again, so a logged-in user keeps the logged-in limits.
        if (user && response.data.data.viewer === "anonymous") {
          try {
            await renewSession();
            response = await requestPage();
          } catch {
            // The session is gone (AppContext now shows the user as logged out), so the anonymous answer stands.
          }
        }

        const {
          videos: newVideos,
          nextCursor,
          hasMore,
          terminalReasonByPlatform,
          retryAtByPlatform,
          cachedAhead,
          resolvedQuery,
          similarMatch,
          viewer,
        } = response.data.data;

        if (!isLoadMore && similarMatch) {
          setSearchNotice({ typed: searchQuery, resolved: resolvedQuery });
        }

        setVideosByPlatform(previous => {
          const currentPlatformVideos = previous[platform] || [];
          const updatedPlatformVideos = isLoadMore ? mergeUniqueVideos(currentPlatformVideos, newVideos) : newVideos;
          return { ...previous, [platform]: updatedPlatformVideos };
        });

        setPagination(previous => ({
          ...previous,
          [platform]: {
            cursor: nextCursor,
            hasMore,
            terminalReason: terminalReasonByPlatform?.[platform] || null,
            retryAt: retryAtByPlatform?.[platform] || null,
            cachedAhead: cachedAhead ?? 0,
            // Later pages ask for the cache key the backend chose, so a match can't change mid-scroll.
            resolvedQuery: resolvedQuery || searchQuery,
            viewer,
          },
        }));
      } catch (requestError) {
        console.error(requestError);
        // The backend's own message explains a rejected search ("2 to 100 characters…") or a flood limit.
        setError(requestError.response?.data?.message || "Could not fetch videos. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [mergeUniqueVideos, user]
  );

  // Player.jsx looks up the clicked video in the shared list. It used to be set from inside the state updater
  // above, which landed a render late (React warned about it) and left newly mounted rails without scroll listeners.
  useEffect(() => {
    setVideos(flattenByPlatform(videosByPlatform));
  }, [videosByPlatform, setVideos, flattenByPlatform]);

  // `exact` searches the text as typed, even if a similar search is already cached.
  const runSearch = useCallback(
    async (newQuery, { exact = false } = {}) => {
      setHasSearched(true);
      setQuery(newQuery);
      setSearchNotice(null);
      setExpandedPlatform(null);
      setVideosByPlatform({ youtube: [], dailymotion: [] });
      setPagination(createPagination());
      resetLoadMoreRateLimit();

      await Promise.all(
        SUPPORTED_PLATFORMS.map(platform =>
          fetchPlatformVideos({ searchQuery: newQuery, platform, cursorValue: null, isLoadMore: false, exact })
        )
      );
    },
    [fetchPlatformVideos, resetLoadMoreRateLimit, setQuery]
  );

  const handleSearch = useCallback(
    event => {
      event.preventDefault();
      const newQuery = searchInput.trim();
      if (!newQuery) return;

      runSearch(newQuery);
    },
    [runSearch, searchInput]
  );

  const loadMoreExpandedVideos = useCallback(() => {
    if (!expandedPlatform || !query || loading) return;

    const platformState = pagination[expandedPlatform];
    if (!platformState?.hasMore || !platformState?.cursor) return;
    if (!canTriggerLoadMore(expandedPlatform, getLoadMoreIntervalMs(platformState, EXPANDED_PAGE_SIZE_PER_PLATFORM))) return;

    fetchPlatformVideos({
      searchQuery: platformState.resolvedQuery || query,
      platform: expandedPlatform,
      cursorValue: platformState.cursor,
      isLoadMore: true,
      limit: EXPANDED_PAGE_SIZE_PER_PLATFORM,
    });
  }, [canTriggerLoadMore, expandedPlatform, query, loading, pagination, fetchPlatformVideos]);

  const loadMoreHorizontalVideos = useCallback(
    platform => {
      if (!query || expandedPlatform !== null || loading) return;

      const platformState = pagination[platform];
      if (!platformState?.hasMore || !platformState?.cursor) return;
      if (horizontalLoadInFlightRef.current[platform]) return;
      if (!canTriggerLoadMore(platform, getLoadMoreIntervalMs(platformState, MINIMIZED_LOAD_MORE_PAGE_SIZE))) return;

      horizontalLoadInFlightRef.current[platform] = true;

      fetchPlatformVideos({
        searchQuery: platformState.resolvedQuery || query,
        platform,
        cursorValue: platformState.cursor,
        isLoadMore: true,
        limit: MINIMIZED_LOAD_MORE_PAGE_SIZE,
      }).finally(() => {
        horizontalLoadInFlightRef.current[platform] = false;
      });
    },
    [canTriggerLoadMore, expandedPlatform, fetchPlatformVideos, loading, pagination, query]
  );

  // The limit card's button, once its retryAt has passed: asks the platform for the next page again, or for the
  // first page when the limit hit before any video arrived.
  const retryPlatform = useCallback(
    platform => {
      const platformState = pagination[platform];
      const searchQuery = platformState.resolvedQuery || query;
      if (!searchQuery || loading) return;

      const isLoadMore = Boolean(platformState.cursor);
      lastLoadMoreAtRef.current[platform] = Date.now();

      fetchPlatformVideos({
        searchQuery,
        platform,
        cursorValue: platformState.cursor,
        isLoadMore,
        limit: isLoadMore && expandedPlatform === null ? MINIMIZED_LOAD_MORE_PAGE_SIZE : EXPANDED_PAGE_SIZE_PER_PLATFORM,
      });
    },
    [expandedPlatform, fetchPlatformVideos, loading, pagination, query]
  );

  const rememberSearchForLogin = useCallback(() => {
    try {
      sessionStorage.setItem(RESUME_SEARCH_KEY, query);
    } catch {
      // Storage is blocked: the user just searches again after logging in.
    }
  }, [query]);

  // Back from logging in through the limit card: run that search again.
  useEffect(() => {
    if (authLoading || !user) return;

    let savedQuery = null;

    try {
      savedQuery = sessionStorage.getItem(RESUME_SEARCH_KEY);
      sessionStorage.removeItem(RESUME_SEARCH_KEY);
    } catch {
      return;
    }

    if (savedQuery) {
      setSearchInput(savedQuery);
      runSearch(savedQuery);
    }
  }, [authLoading, user, runSearch]);

  useEffect(() => {
    loadMoreIfAtEndRef.current = platform => {
      if (expandedPlatform === platform) {
        if (isOnScreen(loadMoreNodeRef.current)) loadMoreExpandedVideos();
        return;
      }

      const railElement = railRefsByPlatform[platform].current;
      if (expandedPlatform === null && railElement && isNearRailEnd(railElement)) {
        loadMoreHorizontalVideos(platform);
      }
    };
  });

  // The grid checks on every scroll, like the rails. An IntersectionObserver missed the user reaching the bottom
  // when a new row and the scroll landed between two frames: it only reports changes, so it never fired again.
  useEffect(() => {
    if (!expandedPlatform) return;

    const onScroll = () => loadMoreIfAtEndRef.current(expandedPlatform);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [expandedPlatform]);

  // Scrolling isn't the only way to reach the end: a list that doesn't fill the screen (a tall window, a rail on a
  // wide monitor) can't be scrolled at all. So check whenever videos arrive too; this also fills a grid when it
  // opens. `loading` is shared by both platforms' requests, so it alone doesn't change for every arrival.
  useEffect(() => {
    if (loading) return;

    const platforms = expandedPlatform ? [expandedPlatform] : SUPPORTED_PLATFORMS;
    platforms.forEach(platform => loadMoreIfAtEndRef.current(platform));
  }, [loading, expandedPlatform, videosByPlatform]);

  useEffect(() => {
    let cancelled = false;

    ppi
      .get("/api/v1/videos/trending")
      .then(response => {
        if (!cancelled) setTrendingByPlatform(response.data.data.byPlatform);
      })
      .catch(requestError => console.error("Could not load trending videos", requestError));

    return () => {
      cancelled = true;
    };
  }, []);

  // Leaving the page cancels pending delayed loads.
  useEffect(() => resetLoadMoreRateLimit, [resetLoadMoreRateLimit]);

  useEffect(() => {
    if (expandedPlatform !== null) return;

    const registerHorizontalInfiniteScroll = (railRef, platform) => {
      const railElement = railRef.current;
      if (!railElement) return () => {};

      const onScroll = () => {
        if (isNearRailEnd(railElement)) {
          loadMoreHorizontalVideos(platform);
        }
      };

      railElement.addEventListener("scroll", onScroll);
      return () => railElement.removeEventListener("scroll", onScroll);
    };

    const removeYoutubeListener = registerHorizontalInfiniteScroll(youtubeRailRef, "youtube");
    const removeDailymotionListener = registerHorizontalInfiniteScroll(dailymotionRailRef, "dailymotion");

    return () => {
      removeYoutubeListener();
      removeDailymotionListener();
    };
  }, [expandedPlatform, loadMoreHorizontalVideos, videosByPlatform.youtube.length, videosByPlatform.dailymotion.length]);

  const scrollRailBy = (railRef, delta) => {
    if (!railRef.current) return;
    railRef.current.scrollBy({ left: delta, behavior: "smooth" });
  };

  const toggleExpand = platform => {
    resetLoadMoreRateLimit();
    setExpandedPlatform(current => (current === platform ? null : platform));
  };

  const hasAnyVideos = videosByPlatform.youtube.length + videosByPlatform.dailymotion.length > 0;
  // A platform stopped by a limit still gets its section (with the card), even with no videos.
  const hasResultsToShow = hasAnyVideos || SUPPORTED_PLATFORMS.some(platform => isStoppedByLimit(pagination[platform]));
  const activePlatformState = expandedPlatform ? pagination[expandedPlatform] : null;

  const renderLimitCard = (platform, className) => {
    const platformState = pagination[platform];
    if (!isStoppedByLimit(platformState)) return null;

    const otherPlatform = SUPPORTED_PLATFORMS.find(current => current !== platform);

    return (
      <QuotaLimitCard
        platformName={PLATFORM_NAMES[platform]}
        reason={platformState.terminalReason}
        retryAt={platformState.retryAt}
        viewer={platformState.viewer || (user ? "user" : "anonymous")}
        otherPlatformNote={
          videosByPlatform[otherPlatform].length ? `${PLATFORM_NAMES[otherPlatform]} results are still here.` : null
        }
        onRetry={() => retryPlatform(platform)}
        onLogin={rememberSearchForLogin}
        disabled={loading}
        className={className}
      />
    );
  };

  if (authLoading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="min-h-screen font-sans p-4 pt-24 sm:p-8 sm:pt-28">
      <header className="text-center my-8 sm:my-16">
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-purple-400 to-pink-600 text-transparent bg-clip-text">Video Treasure</span>
        </h1>
      </header>

      <Header />

      <main>
        <SearchBar
          onSearch={handleSearch}
          loading={loading}
          searchInput={searchInput}
          onSearchInputChange={event => setSearchInput(event.target.value)}
        />

        {/* YouTube's Developer Policies (III.A.2) ask users to agree to the privacy policy before using the features. */}
        <p className="text-center text-xs text-white/40 mt-3">
          By using Video Treasure, you agree to our{" "}
          <Link to="/terms" className="underline hover:text-white">Terms of Service</Link>, the{" "}
          <a href={YOUTUBE_TERMS_URL} target="_blank" rel="noopener" className="underline hover:text-white">
            YouTube Terms of Service
          </a>{" "}
          and our{" "}
          <Link to="/privacy" className="underline hover:text-white">Privacy Policy</Link>.
        </p>

        {searchNotice && (
          <p className="text-center text-white/70 mt-6">
            Showing results for <span className="font-semibold text-white">"{searchNotice.resolved}"</span>.{" "}
            <button
              type="button"
              onClick={() => runSearch(searchNotice.typed, { exact: true })}
              disabled={loading}
              className="text-purple-300 underline hover:text-white disabled:opacity-50"
            >
              Search instead for "{searchNotice.typed}"
            </button>
          </p>
        )}

        {error && <p className="text-center text-red-400 mt-8">{error}</p>}

        {!hasSearched && trendingByPlatform && SUPPORTED_PLATFORMS.some(platform => trendingByPlatform[platform]?.length) && (
          <section className="mt-12" aria-label="Trending in India">
            <h2 className="text-2xl sm:text-3xl font-extrabold">
              <span className="bg-gradient-to-r from-purple-400 to-pink-600 text-transparent bg-clip-text">Trending in India</span>
            </h2>
            {SUPPORTED_PLATFORMS.map(platform => (
              <HorizontalSection
                key={platform}
                title={PLATFORM_NAMES[platform]}
                heading={<h3 className="text-xl font-bold tracking-wide uppercase text-white/90">{PLATFORM_NAMES[platform]}</h3>}
                videos={trendingByPlatform[platform] || []}
                containerRef={trendingRailRefs[platform]}
                onScrollLeft={() => scrollRailBy(trendingRailRefs[platform], -900)}
                onScrollRight={() => scrollRailBy(trendingRailRefs[platform], 900)}
              />
            ))}
          </section>
        )}

        {!loading && !error && hasSearched && !hasResultsToShow && (
          <p className="text-center text-white/50 mt-8">No videos found. Try a different search.</p>
        )}

        {hasResultsToShow && expandedPlatform === null && (
          <>
            <HorizontalSection
              title="YouTube"
              videos={videosByPlatform.youtube}
              containerRef={youtubeRailRef}
              onScrollLeft={() => scrollRailBy(youtubeRailRef, -900)}
              onScrollRight={() => scrollRailBy(youtubeRailRef, 900)}
              expandedPlatform={expandedPlatform}
              onToggleExpand={() => toggleExpand("youtube")}
              footer={renderLimitCard("youtube", "min-w-[320px] max-w-[320px]")}
            />

            <HorizontalSection
              title="Dailymotion"
              videos={videosByPlatform.dailymotion}
              containerRef={dailymotionRailRef}
              onScrollLeft={() => scrollRailBy(dailymotionRailRef, -900)}
              onScrollRight={() => scrollRailBy(dailymotionRailRef, 900)}
              expandedPlatform={expandedPlatform}
              onToggleExpand={() => toggleExpand("dailymotion")}
              footer={renderLimitCard("dailymotion", "min-w-[320px] max-w-[320px]")}
            />
          </>
        )}

        {hasResultsToShow && expandedPlatform === "youtube" && (
          <ExpandedGridSection
            title="YouTube"
            videos={videosByPlatform.youtube}
            expandedPlatform={expandedPlatform}
            onToggleExpand={() => toggleExpand("youtube")}
          />
        )}

        {hasResultsToShow && expandedPlatform === "dailymotion" && (
          <ExpandedGridSection
            title="Dailymotion"
            videos={videosByPlatform.dailymotion}
            expandedPlatform={expandedPlatform}
            onToggleExpand={() => toggleExpand("dailymotion")}
          />
        )}

        {expandedPlatform && <div ref={loadMoreNodeRef} className="h-4" />}

        {!loading &&
          hasSearched &&
          expandedPlatform &&
          activePlatformState &&
          !activePlatformState.hasMore &&
          (renderLimitCard(expandedPlatform, "mt-8 w-full max-w-md mx-auto") || (
            <p className="text-center text-white/70 mt-8">All videos are here.</p>
          ))}
      </main>
    </div>
  );
}

export default Home;