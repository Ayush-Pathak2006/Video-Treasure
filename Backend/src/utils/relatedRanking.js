import { buildVideoKey } from "./videoKey.js";
import { normalizeText } from "./videoRanking.js";

/**
 * Every weight of "Up next" in one place, tuned on seeded data. A shared exact search counts most near its top (about
 * 0.9 at its first position, 0.57 at the 10th, 0.45 at the 30th), so the same channel (0.45) and a similar title (up
 * to 0.35) interleave with the middle of the search: a song's search is mostly covers, and the artist's other songs
 * belong in the list too. A shared niche key is broad (0.4 of an exact search). Co-watching adds 0.15 at 3 other
 * users up to 0.5 at 10, and a channel the viewer keeps watching 0.15. A trending fallback video that matched nothing
 * else always ends up below the rest.
 */
export const RELATED_WEIGHTS = {
  // Sharing an exact search, plus up to this much more for a high position in it.
  sharedSearch: 0.35,
  searchPosition: 0.65,
  // A niche key ("Music") is broad: it counts this share of an exact search.
  nicheKey: 0.4,
  sameChannel: 0.45,
  // Times the text score relative to the best in this set.
  text: 0.35,
  // "People who watched this also watched": times the share of COWATCH_FULL_AT other users who watched both (only
  // videos past the privacy threshold get here, see relatedVideos.service.js).
  coWatch: 0.5,
  // A channel the logged-in viewer watched at least twice lately.
  favouriteChannel: 0.15,
  // Times log10(views + 1) / 10, so 1M views give 0.06.
  popularity: 0.1,
  samePlatform: 0.05,
  trendingOnly: -0.5,
  // Shorts and videos the viewer already watched move down, but stay: a small topic still fills the list.
  short: -0.3,
  watched: -0.6,
};

// Several shared searches add up, to a point.
const MAX_SEARCH_SIGNAL = 2;
// The position bonus halves after this many positions.
const POSITION_DECAY = 5;
// Co-watchers past this many add no more.
const COWATCH_FULL_AT = 10;
const SHORT_VIDEO_MAX_SECONDS = 60;
const MAX_PER_CHANNEL = 3;

// As in rankByRelevance: 60 s or less, or "#shorts" in the title.
const isShort = video =>
  (video.durationSeconds > 0 && video.durationSeconds <= SHORT_VIDEO_MAX_SECONDS) || ` ${normalizeText(video.title)} `.includes(" shorts ");

// For the per-channel cap. Rows without a channel id (cached before Oct 2026) fall back to the channel's name.
const channelOf = video =>
  video.channelId ? `${video.platform}:${video.channelId}` : `${video.platform}:name:${normalizeText(video.channelTitle)}`;

const searchSignal = keys =>
  Math.min(
    MAX_SEARCH_SIGNAL,
    [...keys.values()].reduce(
      (sum, { position, niche }) =>
        sum + (niche ? RELATED_WEIGHTS.nicheKey : 1) * (RELATED_WEIGHTS.sharedSearch + RELATED_WEIGHTS.searchPosition / (1 + position / POSITION_DECAY)),
      0
    )
  );

/**
 * Orders the candidates of "Up next", best first. Pure: every input comes from the caller.
 * - `current`: { platform, platformVideoId, channelId, title, durationSeconds } of the video being watched.
 * - `hits`: one per candidate row and source: { video, source: "search", key, niche, position } (position 0 is the
 *   key's best), { video, source: "channel" }, { video, source: "text", textScore }, { video, source: "cowatch",
 *   watchers } or { video, source: "trending" }.
 * - `watchedKeys`: the viewer's watched video keys among the candidates.
 * - `favouriteChannels`: "<platform>:<channelId>" of the channels the viewer watched at least twice lately.
 * Rows of one video are merged (the freshest is shown), the current video is left out, and at most MAX_PER_CHANNEL
 * videos of one channel make the list.
 */
export const rankRelatedVideos = ({ current, hits, watchedKeys = new Set(), favouriteChannels = new Set(), limit = 20 }) => {
  const currentKey = buildVideoKey(current);
  const byVideo = new Map();

  for (const hit of hits) {
    const key = buildVideoKey(hit.video);
    if (key === currentKey) continue;

    if (!byVideo.has(key)) {
      byVideo.set(key, { key, video: hit.video, keys: new Map(), sameChannel: false, textScore: 0, coWatchers: 0, matched: false });
    }

    const entry = byVideo.get(key);
    if ((hit.video.fetchedAt ?? 0) > (entry.video.fetchedAt ?? 0)) entry.video = hit.video;
    if (current.channelId && hit.video.platform === current.platform && hit.video.channelId === current.channelId) {
      entry.sameChannel = true;
    }

    if (hit.source === "search") {
      const previous = entry.keys.get(hit.key);
      if (!previous || hit.position < previous.position) entry.keys.set(hit.key, { position: hit.position, niche: hit.niche });
    }
    if (hit.source === "text") entry.textScore = Math.max(entry.textScore, hit.textScore);
    if (hit.source === "cowatch") entry.coWatchers = Math.max(entry.coWatchers, hit.watchers);
    if (hit.source !== "trending") entry.matched = true;
  }

  const entries = [...byVideo.values()];
  const maxTextScore = entries.reduce((max, entry) => Math.max(max, entry.textScore), 0);
  // Someone watching a Short gets Shorts like the rest.
  const penalizeShorts = !isShort(current);

  const scored = entries.map(entry => {
    const { video } = entry;
    const score =
      searchSignal(entry.keys) +
      (entry.sameChannel ? RELATED_WEIGHTS.sameChannel : 0) +
      (maxTextScore > 0 ? (RELATED_WEIGHTS.text * entry.textScore) / maxTextScore : 0) +
      RELATED_WEIGHTS.coWatch * Math.min(1, entry.coWatchers / COWATCH_FULL_AT) +
      (video.channelId && favouriteChannels.has(`${video.platform}:${video.channelId}`) ? RELATED_WEIGHTS.favouriteChannel : 0) +
      RELATED_WEIGHTS.popularity * Math.min(1, Math.log10(1 + (Number(video.views) || 0)) / 10) +
      (video.platform === current.platform ? RELATED_WEIGHTS.samePlatform : 0) +
      (entry.matched ? 0 : RELATED_WEIGHTS.trendingOnly) +
      (penalizeShorts && isShort(video) ? RELATED_WEIGHTS.short : 0) +
      (watchedKeys.has(entry.key) ? RELATED_WEIGHTS.watched : 0);

    return { video, score };
  });

  scored.sort((a, b) => b.score - a.score || (Number(b.video.views) || 0) - (Number(a.video.views) || 0) || (buildVideoKey(a.video) < buildVideoKey(b.video) ? -1 : 1));

  const perChannel = new Map();
  const picked = [];

  for (const { video } of scored) {
    const channel = channelOf(video);
    const count = perChannel.get(channel) ?? 0;
    if (count >= MAX_PER_CHANNEL) continue;

    perChannel.set(channel, count + 1);
    picked.push(video);
    if (picked.length === limit) break;
  }

  return picked;
};
