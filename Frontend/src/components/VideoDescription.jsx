import React, { useLayoutEffect, useRef, useState } from "react";
import { formatCount, formatTimeAgo } from "../utils/format";

const PLATFORM_NAMES = { youtube: "YouTube", dailymotion: "Dailymotion" };

// A link ends before trailing punctuation: "see https://example.com." links "https://example.com". A raw <, > or "
// can't be part of a URL (they'd be percent-encoded), so a link stops there too.
const URL_PATTERN = /(https?:\/\/[^\s<>"]*[^\s<>".,;:!?')\]}])/;

// Descriptions are written by strangers, so they are rendered as React text with only their links turned into
// anchors. Never as HTML. split() with a capturing group puts the URLs at the odd indexes.
const renderWithLinks = text =>
  text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-purple-300 hover:underline break-all"
      >
        {part}
      </a>
    ) : (
      part
    )
  );

const plural = (count, word) => `${formatCount(count)} ${word}${count === 1 ? "" : "s"}`;

// "6.4B views · 32M likes on YouTube · 9 years ago". These are the platform's numbers, never ours. A creator can
// hide the like count, which arrives as 0, so 0 likes are left out.
const buildStatsLine = ({ platform, views, likes, publishedAt }) => {
  const counts = [plural(views, "view"), likes > 0 && plural(likes, "like")].filter(Boolean).join(" · ");
  const parts = [`${counts} on ${PLATFORM_NAMES[platform] || platform}`, publishedAt && formatTimeAgo(publishedAt)];
  return parts.filter(Boolean).join(" · ");
};

/**
 * The box under the Player's title: the platform's stats, then the description clamped to 3 lines. "...more" shows
 * only when the text really overflows. Remount it (key) for another video.
 */
function VideoDescription({ video }) {
  const textRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const description = (video.description || "").trim();

  // While clamped, the text overflows when its full height is taller than the 3 lines shown. Measured again when
  // the box changes width (rotation, resizing).
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return undefined;

    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description, expanded]);

  return (
    <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10 text-sm">
      <p className="font-bold">{buildStatsLine(video)}</p>

      {description && (
        <>
          <p ref={textRef} className={`mt-2 text-white/90 whitespace-pre-line break-words ${expanded ? "" : "line-clamp-3"}`}>
            {renderWithLinks(description)}
          </p>
          {(overflows || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded(current => !current)}
              className="mt-1 font-semibold text-white/70 hover:text-white"
              aria-expanded={expanded}
            >
              {expanded ? "Show less" : "...more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default VideoDescription;
