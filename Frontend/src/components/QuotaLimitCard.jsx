import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const MINUTE_MS = 60 * 1000;

// "45 s", "14 min", "2 h 5 min", with non-breaking spaces so a number never wraps away from its unit.
const formatWait = ms => {
  if (ms < MINUTE_MS) return `${Math.max(1, Math.ceil(ms / 1000))}\u00a0s`;

  const minutes = Math.ceil(ms / MINUTE_MS);
  if (minutes < 60) return `${minutes}\u00a0min`;

  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}\u00a0h ${minutes % 60}\u00a0min` : `${hours}\u00a0h`;
};

// "at 12:30 PM" in the viewer's own time zone and format, or "tomorrow at 12:30 PM".
const formatBackAt = (date, now) => {
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toDateString() === new Date(now).toDateString() ? `at ${time}` : `tomorrow at ${time}`;
};

// Re-renders every second until `untilMs`, for the live countdown.
const useNow = untilMs => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!untilMs || now >= untilMs) return undefined;

    const timer = setTimeout(() => setNow(Date.now()), Math.min(1000, untilMs - now));
    return () => clearTimeout(timer);
  }, [now, untilMs]);

  return now;
};

const primaryButtonClass =
  "inline-flex items-center justify-center px-5 py-2 rounded-full font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 shadow-lg shadow-purple-900/30 transition-colors disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex items-center justify-center px-5 py-2 rounded-full font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-colors";

/**
 * Shown where a platform's results end because the backend stopped calling its API: the visitor's own limit
 * (visitor_limit), the app's daily quota (daily_limit), or a temporary API problem. `retryAt` is when asking
 * again can work; the card then turns into a button that does.
 */
function QuotaLimitCard({ platformName, reason, retryAt, viewer, otherPlatformNote, onRetry, onLogin, disabled, className = "" }) {
  const retryAtMs = retryAt ? new Date(retryAt).getTime() : null;
  const now = useNow(retryAtMs);
  const isReady = !retryAtMs || now >= retryAtMs;
  const waitText = retryAtMs ? formatWait(retryAtMs - now) : "";

  const retryButton = (label = "Load more") => (
    <button type="button" onClick={onRetry} disabled={disabled} className={primaryButtonClass}>
      {label}
    </button>
  );

  let title;
  let body = null;
  let actions;

  if (reason === "visitor_limit" && viewer !== "user") {
    title = `You've used your free ${platformName} searches.`;
    body = `Log in for more ${platformName} searches.`;
    actions = (
      <>
        <div className="flex flex-wrap gap-3">
          <Link to="/login" onClick={onLogin} className={primaryButtonClass}>
            Log in
          </Link>
          <Link to="/register" onClick={onLogin} className={secondaryButtonClass}>
            Sign up
          </Link>
        </div>
        {isReady ? (
          <button type="button" onClick={onRetry} disabled={disabled} className="text-sm text-purple-300 underline hover:text-white disabled:opacity-50">
            or try again now
          </button>
        ) : (
          <p className="text-sm text-white/60">or wait {waitText}</p>
        )}
      </>
    );
  } else if (reason === "visitor_limit") {
    title = isReady ? `${platformName} searches are available again.` : `Next ${platformName} search in ${waitText}`;
    body = isReady ? null : "Your searches refill over time, so you can keep exploring in a few minutes.";
    actions = isReady ? retryButton() : null;
  } else {
    title = isReady
      ? `${platformName} results are back.`
      : `${platformName} results are back ${formatBackAt(new Date(retryAtMs), now)}`;
    body = isReady
      ? null
      : reason === "daily_limit"
        ? `Video Treasure has used today's ${platformName} allowance.`
        : `${platformName} isn't answering right now.`;
    actions = isReady ? retryButton() : null;
  }

  return (
    <div
      role="status"
      className={`shrink-0 flex flex-col justify-center gap-4 p-6 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md shadow-lg ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-purple-500/40 to-pink-600/40 border border-white/20 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <div>
          <p className="text-lg font-bold text-white">{title}</p>
          {body && <p className="text-sm text-white/70 mt-1">{body}</p>}
        </div>
      </div>

      {actions}

      {otherPlatformNote && <p className="text-sm text-white/50">{otherPlatformNote}</p>}
    </div>
  );
}

export default QuotaLimitCard;
