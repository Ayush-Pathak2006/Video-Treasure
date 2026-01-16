import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import ppi from "../api/axios";

const AuthContext = createContext();
const SearchContext = createContext();

export const AppProvider = ({ children }) => {
  // --- Authentication State ---
  const [user, setUser] = useState(null);
  const [likedVideoIds, setLikedVideoIds] = useState(new Set());
  const [authLoading, setAuthLoading] = useState(true);

  // --- Search State ---
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);

  const fetchLikedIds = async () => {
    try {
      const response = await ppi.get("/api/v1/likes/ids", {
        withCredentials: true,
      });
      setLikedVideoIds(new Set(response.data.data.likedVideoIds));
    } catch (error) {
      console.error("Could not fetch liked video IDs", error);
    }
  };

  const login = async (email, password) => {
    const response = await ppi.post(
      "/api/v1/users/login",
      { email, password },
      { withCredentials: true }
    );
    if (response.data) {
      setUser(response.data.data.user);
      await fetchLikedIds();
    }
    return response;
  };

  const logout = async () => {
    await ppi.post("/api/v1/users/logout", {}, { withCredentials: true });
    setUser(null);
    setLikedVideoIds(new Set());
  };

  const toggleLike = async (video) => {
    if (!user) return;
    const newLikedIds = new Set(likedVideoIds);
    const isLiked = newLikedIds.has(video.platformVideoId);
    if (isLiked) {
      newLikedIds.delete(video.platformVideoId);
    } else {
      newLikedIds.add(video.platformVideoId);
    }
    setLikedVideoIds(newLikedIds);
    try {
      const videoData = {
        /* video details */
      };
      await ppi.post("/api/v1/likes/toggle", video, { withCredentials: true });
    } catch (error) {
      setLikedVideoIds(new Set(likedVideoIds));
    }
  };

  useEffect(() => {
    const checkUserSession = async () => {
      if (window.location.pathname === "/verify-email") {
        setAuthLoading(false);
        return;
      }
      try {
        const response = await ppi.post(
          "/api/v1/users/refresh-token",
          {},
          { withCredentials: true }
        );
        setUser(response.data.data.user);
        await fetchLikedIds();
      } catch (error) {
        if (error.response && error.response.status === 401) {
          setUser(null);
          setLikedVideoIds(new Set());
        } else {
          console.error(
            "An unexpected error occurred during session check:",
            error
          );
        }
      } finally {
        setAuthLoading(false);
      }
    };
    checkUserSession();
  }, []);

  const authValue = {
    user,
    loading: authLoading,
    login,
    logout,
    likedVideoIds,
    toggleLike,
    setLikedVideoIds,
  };
  const searchValue = {
    query,
    setQuery,
    videos,
    setVideos,
    nextPageToken,
    setNextPageToken,
  };

  return (
    <AuthContext.Provider value={authValue}>
      <SearchContext.Provider value={searchValue}>
        {!authLoading && children}
      </SearchContext.Provider>
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined)
    throw new Error("useAuth must be used within an AppProvider");
  return context;
};

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (context === undefined)
    throw new Error("useSearch must be used within an AppProvider");
  return context;
};
