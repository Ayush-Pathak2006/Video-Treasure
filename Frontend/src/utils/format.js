// "en", not "en-IN": the Indian locale writes compact numbers in lakh and crore.
const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

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
