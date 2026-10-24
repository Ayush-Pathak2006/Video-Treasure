import { useEffect } from "react";
import ppi from "../api/axios";

// A watch counts after this much time with the page visible.
const WATCH_AFTER_MS = 10 * 1000;

/**
 * Adds the video to a logged-in user's watch history once its page has been visible for WATCH_AFTER_MS: time in a
 * hidden tab doesn't count. Leaving earlier records nothing, and another video starts the count again. `userId` is
 * null while the session check runs and for anonymous visitors, who have no history. Failures (a video we never
 * cached answers 404) are ignored: the history is a convenience. Under StrictMode the cleanup clears the first
 * mount's timer, so one request goes out.
 */
export const useWatchRecorder = ({ videoKey, userId }) => {
  useEffect(() => {
    if (!userId) return undefined;

    let remainingMs = WATCH_AFTER_MS;
    let startedAt = 0;
    let timer = null;

    const record = () => {
      timer = null;
      remainingMs = 0;
      ppi.post("/api/v1/history", { videoKey }).catch(() => {});
    };

    const resume = () => {
      if (timer || remainingMs <= 0) return;
      startedAt = Date.now();
      timer = setTimeout(record, remainingMs);
    };

    const pause = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      remainingMs -= Date.now() - startedAt;
    };

    const onVisibilityChange = () => (document.visibilityState === "visible" ? resume() : pause());

    if (document.visibilityState === "visible") resume();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTimeout(timer);
    };
  }, [videoKey, userId]);
};
