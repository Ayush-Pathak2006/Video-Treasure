// "en", not "en-IN": the Indian locale writes compact numbers in lakh and crore.
const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
// Only the parts are used: each locale orders and punctuates them differently ("Mon 19 Oct", "Mon, Oct 19").
const dayParts = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Largest first. Under a minute is "just now".
const TIME_UNITS = [
  ["year", 365 * DAY],
  ["month", 30 * DAY],
  ["week", 7 * DAY],
  ["day", DAY],
  ["hour", HOUR],
  ["minute", MINUTE],
];

// 6400000000 -> "6.4B", 1200 -> "1.2K", 12 -> "12".
export const formatCount = count => compactNumber.format(Number(count) || 0);

// The first letter (not half of an emoji) of a name, for letter avatars.
export const getInitial = name => (Array.from((name || "").trim())[0] || "?").toUpperCase();

// "9 years ago", "last month", "yesterday", "5 minutes ago", "just now". A date slightly in the future (clock skew)
// counts as now.
export const formatTimeAgo = date => {
  const elapsed = Math.max(0, Date.now() - new Date(date).getTime());

  for (const [unit, length] of TIME_UNITS) {
    if (elapsed >= length) {
      return relativeTime.format(-Math.floor(elapsed / length), unit);
    }
  }

  return "just now";
};

const startOfLocalDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// The viewer's local calendar day, for grouping: "2026-9-19".
export const localDayKey = date => {
  const day = new Date(date);
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
};

// "Today", "Yesterday", then "Mon, 19 Oct", with the year when it isn't this year: "Fri, 12 Dec 2025". Days are the
// viewer's local ones; rounding absorbs the 23- and 25-hour days of a DST change.
export const formatDayHeading = (date, now = new Date()) => {
  const day = new Date(date);
  const daysAgo = Math.round((startOfLocalDay(now) - startOfLocalDay(day)) / DAY);

  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";

  const parts = Object.fromEntries(dayParts.formatToParts(day).map(part => [part.type, part.value]));
  return `${parts.weekday}, ${parts.day} ${parts.month}${day.getFullYear() === now.getFullYear() ? "" : ` ${parts.year}`}`;
};
