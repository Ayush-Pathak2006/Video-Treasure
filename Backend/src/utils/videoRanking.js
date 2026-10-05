const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
const RECENCY_HALF_LIFE_DAYS = 10;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const normalizeLog = (value, maxValue) => {
  const safeValue = Math.max(0, Number(value) || 0);
  const safeMax = Math.max(1, Number(maxValue) || 1);

  return Math.log1p(safeValue) / Math.log1p(safeMax);
};

const calculateRecencyScore = publishedAt => {
  if (!publishedAt) return 0;

  const publishedTime = new Date(publishedAt).getTime();

  if (Number.isNaN(publishedTime)) {
    return 0;
  }

  const ageDays = Math.max(0, (Date.now() - publishedTime) / MILLISECONDS_IN_DAY);
  const decayFactor = Math.log(2) / RECENCY_HALF_LIFE_DAYS;

  return Math.exp(-decayFactor * ageDays);
};

export const rankVideos = videos => {
  const maxViews = videos.reduce((max, video) => Math.max(max, Number(video.views) || 0), 1);

  return videos
    .map(video => {
      const views = Number(video.views) || 0;
      const likes = Number(video.likes) || 0;
      const viewScore = clamp(normalizeLog(views, maxViews));
      const likeRatioScore = clamp(views > 0 ? likes / views : 0);
      const recencyScore = clamp(calculateRecencyScore(video.publishedAt));

      const score = viewScore * 0.6 + likeRatioScore * 0.3 + recencyScore * 0.1;

      return {
        ...video,
        score: Number(score.toFixed(6)),
      };
    })
    .sort((a, b) => b.score - a.score);
};

// ---------- Search relevance ----------

// Title words that mark a copy of or a reaction to a work instead of the work itself. Each inner list is one
// group of variants, and a group is skipped when the search contains one of its words, so "shape of you cover"
// still gets covers. Words common in ordinary titles ("explained", "tutorial", "react") are left out on purpose:
// they would push down real results for searches like "react hooks tutorial".
const DERIVATIVE_TERMS = [
  ["cover", "covers", "covered"],
  ["reaction", "reacts", "reacting", "reacted"],
  ["karaoke"],
  ["parody"],
  ["remix"],
  ["mashup"],
  ["nightcore"],
  ["slowed"],
  ["reverb"],
  ["sped up"],
  ["8d"],
  ["bass boosted"],
  ["amv"],
  ["fmv"],
  ["fan made", "fanmade"],
  ["concept trailer", "trailer concept"],
  ["ending explained"],
  ["ringtone"],
];

// Weaker signals of side content: often fine, but rarely the thing a bare search for a song or a movie means.
const SIDE_CONTENT_TERMS = [
  ["lyrics", "lyric", "lyrical"],
  ["review", "reviews"],
  ["choreography"],
  ["instrumental"],
  ["lofi", "lo fi"],
  ["breakdown"],
  ["recap"],
  ["recreated", "recreation"],
];

const SHORT_VIDEO_MAX_SECONDS = 60;
const POSITION_DECAY = 10;
const VIEW_ORDERS_OF_MAGNITUDE = 4;

const RELEVANCE_WEIGHTS = {
  position: 0.35,
  titleMatch: 0.2,
  views: 0.15,
  official: 0.15,
  derivative: 0.4,
  short: 0.15,
};

// Lowercase, no Latin accents, punctuation as spaces. \p{M} is kept so Devanagari vowel signs stay inside their words.
export const normalizeText = value =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();

const compact = normalized => normalized.replace(/ /g, "");

// Padded with spaces so includes(" word ") only matches whole words.
const pad = normalized => ` ${normalized} `;

const matchesGroup = (paddedText, group) => group.some(term => paddedText.includes(` ${term} `));

const countsAgainst = (paddedTitle, paddedQuery, groups) =>
  groups.some(group => !matchesGroup(paddedQuery, group) && matchesGroup(paddedTitle, group));

// Signs that the uploader is the artist, studio or label: "Official" in the title, a VEVO or auto-generated
// "- Topic" channel, a title that starts with the channel's name ("Ed Sheeran - Shape of You" on "Ed Sheeran"),
// a channel named in the search, or a verified Dailymotion account. Only the start of the title counts:
// cover artists put their own name later ("Shape of You Carnatic | Amit Patel").
const scoreOfficial = ({ title, channel, query, verified }) => {
  const isVevo = compact(channel).endsWith("vevo");
  const isTopic = channel.endsWith(" topic");
  const channelCore = compact(channel.replace(/ topic$/, "")).replace(/(vevo|official)$/, "");
  const channelIsNamed =
    channelCore.length >= 4 && (compact(title).startsWith(channelCore) || compact(query).includes(channelCore));

  return Math.max(
    pad(title).includes(" official ") ? 0.7 : 0,
    isVevo ? 0.7 : 0,
    channelIsNamed ? 0.7 : 0,
    isTopic ? 0.5 : 0,
    pad(channel).includes(" official ") ? 0.4 : 0,
    verified ? 0.3 : 0
  );
};

// Share of the search's words found in the title or channel, plus a bonus when the title has the exact phrase.
const scoreTitleMatch = ({ title, channel, query }) => {
  const queryWords = [...new Set(query.split(" ").filter(Boolean))];

  if (!queryWords.length) return 0;

  const textWords = new Set(`${title} ${channel}`.split(" "));
  const coverage = queryWords.filter(word => textWords.has(word)).length / queryWords.length;
  const hasPhrase = pad(title).includes(pad(query));

  return coverage * 0.8 + (hasPhrase ? 0.2 : 0);
};

// 1 for the most viewed video of the batch, minus 0.25 per order of magnitude below it.
const scoreViews = (views, maxViews) => {
  const ratio = (Math.max(0, Number(views) || 0) + 1) / (maxViews + 1);
  return 1 + clamp(Math.log10(ratio), -VIEW_ORDERS_OF_MAGNITUDE, 0) / VIEW_ORDERS_OF_MAGNITUDE;
};

/**
 * Orders one batch of search results, best first. `videos` must be in the provider's own relevance order, which
 * stays the strongest signal; the rest lifts official uploads and pushes down covers, reactions, edits and Shorts.
 * Providers may attach `rankingHints: { durationSeconds, verified }`. It is not in the Video schema, so Mongoose
 * drops it on insert.
 */
export const rankByRelevance = (videos, rawQuery) => {
  const query = normalizeText(rawQuery);
  const paddedQuery = pad(query);
  const maxViews = videos.reduce((max, video) => Math.max(max, Number(video.views) || 0), 0);
  const queryWantsShorts = paddedQuery.includes(" shorts ");

  return videos
    .map((video, position) => {
      const title = normalizeText(video.title);
      const channel = normalizeText(video.channelTitle);
      const paddedTitle = pad(title);
      const { durationSeconds, verified } = video.rankingHints || {};

      const isDerivative = countsAgainst(paddedTitle, paddedQuery, DERIVATIVE_TERMS);
      const isSideContent = countsAgainst(paddedTitle, paddedQuery, SIDE_CONTENT_TERMS);
      const isShort =
        !queryWantsShorts &&
        ((durationSeconds > 0 && durationSeconds <= SHORT_VIDEO_MAX_SECONDS) || paddedTitle.includes(" shorts "));

      const score =
        RELEVANCE_WEIGHTS.position / (1 + position / POSITION_DECAY) +
        RELEVANCE_WEIGHTS.titleMatch * scoreTitleMatch({ title, channel, query }) +
        RELEVANCE_WEIGHTS.views * scoreViews(video.views, maxViews) +
        RELEVANCE_WEIGHTS.official * scoreOfficial({ title, channel, query, verified }) -
        RELEVANCE_WEIGHTS.derivative * (isDerivative ? 1 : isSideContent ? 0.5 : 0) -
        RELEVANCE_WEIGHTS.short * (isShort ? 1 : 0);

      return { video, score, position };
    })
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .map(({ video }) => video);
};