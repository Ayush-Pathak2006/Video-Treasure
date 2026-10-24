import { Video } from "../models/video.model.js";
import { WatchHistory } from "../models/watchHistory.model.js";
import { NICHE_TOPICS } from "../config/niches.config.js";
import { TRENDING_KEY_PREFIX } from "../config/trends.config.js";
import { SUPPORTED_PLATFORMS } from "../providers/provider.registry.js";
import { getTrendingVideos } from "./trending.service.js";
import { getWatchedKeys } from "./watchHistory.service.js";
import { DERIVATIVE_TERMS, SIDE_CONTENT_TERMS, normalizeText } from "../utils/videoRanking.js";
import { rankRelatedVideos } from "../utils/relatedRanking.js";
import { buildVideoKey } from "../utils/videoKey.js";

export const RELATED_LIMIT = 20;
const MAX_SHARED_KEYS = 5;
const PER_KEY = 30;
const PER_CHANNEL = 30;
const PER_TEXT = 60;
const MAX_TITLE_WORDS = 8;
const MAX_TAGS = 3;
const MAX_TEXT_TERMS = 16;
// Fewer distinct candidates than this, and the trending videos fill in.
const MIN_CANDIDATES = 20;

const DAY_MS = 24 * 60 * 60 * 1000;
// "People who watched this also watched": the video's most recent watchers, and what else they watched lately.
const COWATCH_WATCHERS = 200;
const COWATCH_WINDOW_MS = 90 * DAY_MS;
const PER_COWATCH = 60;
// A co-watched video counts only when this many other users watched both, the viewer not included. With fewer, one
// person's history could show up in everyone's list: if only one user watched X, the list under X would reveal what
// else they watched.
const MIN_COWATCHERS = 3;
// The personal boost: channels the viewer watched at least this often among their latest entries.
const FAVOURITE_RECENT_ENTRIES = 100;
const FAVOURITE_MIN_WATCHES = 2;

// The cards show neither. The current video's own rows need the rest.
const CARD_PROJECTION = { description: 0, tags: 0 };
const OWN_ROW_FIELDS = "platform platformVideoId query searchRank channelId channelTitle title tags durationSeconds fetchedAt";

const NICHE_KEYS = new Set(NICHE_TOPICS.map(niche => niche.name));

// Words that say what kind of upload a video is, not what it's about. $text ORs its terms, so each of these would pull
// in every official video, every lyrics edit or every cover.
const FILLER_WORDS = new Set([
  "official", "video", "videos", "song", "songs", "music", "audio", "full", "hd", "hq", "4k", "8k", "1080p", "720p",
  "new", "latest", "ft", "feat", "featuring", "version", "mv", "visualizer", "remastered", "teaser", "clip",
  ...[...DERIVATIVE_TERMS, ...SIDE_CONTENT_TERMS].flat().filter(term => !term.includes(" ")),
]);

const contentWords = text =>
  normalizeText(text)
    .split(" ")
    .filter(word => word && !FILLER_WORDS.has(word) && (word.length > 1 || /\d/.test(word)));

// The title's most distinctive words (the longest, at most MAX_TITLE_WORDS), then the words of up to MAX_TAGS tags.
const buildTextTerms = (title, tags) => {
  const titleWords = [...new Set(contentWords(title))].sort((a, b) => b.length - a.length).slice(0, MAX_TITLE_WORDS);
  const tagWords = tags.slice(0, MAX_TAGS).flatMap(contentWords);
  return [...new Set([...titleWords, ...tagWords])].slice(0, MAX_TEXT_TERMS);
};

// The searches this video is cached under, best first: exact searches before niches (a niche like "Music" is broad),
// then the ones where the video itself ranks best. Trending keys don't count (every trending video shares one), and
// neither do unranked rows.
const pickSharedKeys = rows =>
  rows
    .filter(row => row.query && row.searchRank != null && !row.query.startsWith(TRENDING_KEY_PREFIX))
    .map(row => ({ key: row.query, niche: NICHE_KEYS.has(row.query), ownRank: row.searchRank }))
    .sort((a, b) => Number(a.niche) - Number(b.niche) || a.ownRank - b.ownRank)
    .slice(0, MAX_SHARED_KEYS);

const distinctCandidateKeys = (hits, currentKey) =>
  [...new Set(hits.map(hit => buildVideoKey(hit.video)))].filter(key => key !== currentKey);

/**
 * Videos that at least MIN_COWATCHERS other users watched in the last 90 days, among the video's 200 most recent
 * watchers (the viewer left out), with how many. Two queries whatever the number of watchers: the watchers, then one
 * aggregation over their entries (each user has at most 2,000), with each video's row. Entries are unique per user and
 * video, so counting them counts distinct users.
 */
const findCoWatched = async ({ platform, platformVideoId, viewerId }) => {
  const watchers = await WatchHistory.find({ platform, platformVideoId, ...(viewerId && { user: { $ne: viewerId } }) })
    .sort({ lastWatchedAt: -1 })
    .limit(COWATCH_WATCHERS)
    .select("user")
    .lean();

  if (watchers.length < MIN_COWATCHERS) return [];

  return WatchHistory.aggregate([
    {
      $match: {
        user: { $in: watchers.map(watcher => watcher.user) },
        lastWatchedAt: { $gte: new Date(Date.now() - COWATCH_WINDOW_MS) },
        $nor: [{ platform, platformVideoId }],
      },
    },
    { $group: { _id: { platform: "$platform", platformVideoId: "$platformVideoId" }, watchers: { $sum: 1 }, video: { $first: "$video" } } },
    { $match: { watchers: { $gte: MIN_COWATCHERS } } },
    { $sort: { watchers: -1, _id: 1 } },
    { $limit: PER_COWATCH },
    { $lookup: { from: "videos", localField: "video", foreignField: "_id", pipeline: [{ $project: CARD_PROJECTION }], as: "rows" } },
  ]);
};

// "<platform>:<channelId>" of the channels the viewer watched at least twice among their latest 100 entries. One
// aggregation, with the channel id from each entry's Video row.
const findFavouriteChannels = async viewerId => {
  const channels = await WatchHistory.aggregate([
    { $match: { user: viewerId } },
    { $sort: { lastWatchedAt: -1, _id: -1 } },
    { $limit: FAVOURITE_RECENT_ENTRIES },
    { $lookup: { from: "videos", localField: "video", foreignField: "_id", pipeline: [{ $project: { channelId: 1 } }], as: "row" } },
    { $unwind: "$row" },
    { $match: { "row.channelId": { $type: "string" } } },
    { $group: { _id: { platform: "$platform", channelId: "$row.channelId" }, watches: { $sum: 1 } } },
    { $match: { watches: { $gte: FAVOURITE_MIN_WATCHES } } },
  ]);

  return new Set(channels.map(({ _id }) => `${_id.platform}:${_id.channelId}`));
};

/**
 * "Up next" for a video, from our database only: no provider call, no quota, no visitor token. Candidates come from
 * the searches the video is cached under, its channel, similar titles and what its other watchers watched, and the
 * trending videos when that's not enough; utils/relatedRanking.js orders them. A fixed number of indexed queries,
 * whatever the cache size or the number of watchers: the video's rows; then in parallel up to 5 searches, the channel,
 * the text, the co-watch pair and (logged in) the viewer's favourite channels; the trending snapshots only when short;
 * and the viewer's history among the candidates when logged in. Never 404: a video we never cached gets the trending
 * videos.
 */
export const getRelatedVideos = async ({ platform, platformVideoId, viewerId = null }) => {
  const startedAt = Date.now();
  const rows = await Video.find({ platform, platformVideoId }).select(OWN_ROW_FIELDS).lean();
  const freshest = rows.reduce((best, row) => (!best || (row.fetchedAt ?? 0) > (best.fetchedAt ?? 0) ? row : best), null);
  const current = {
    platform,
    platformVideoId,
    channelId: rows.find(row => row.channelId)?.channelId ?? null,
    title: freshest?.title ?? "",
    durationSeconds: freshest?.durationSeconds ?? null,
  };

  const keys = pickSharedKeys(rows);
  const terms = freshest ? buildTextTerms(freshest.title, rows.find(row => row.tags?.length)?.tags ?? []) : [];

  const [keyPages, channelRows, textRows, coWatched, favouriteChannels] = await Promise.all([
    Promise.all(
      keys.map(({ key }) =>
        Video.find({ query: key, searchRank: { $ne: null } }).sort({ searchRank: 1, _id: 1 }).limit(PER_KEY).select(CARD_PROJECTION).lean()
      )
    ),
    // Without a channel id (rows cached before Oct 2026) there's no channel source: names aren't unique, and old
    // Dailymotion rows hold a category there.
    current.channelId
      ? Video.find({ platform, channelId: current.channelId }).sort({ views: -1 }).limit(PER_CHANNEL).select(CARD_PROJECTION).lean()
      : [],
    terms.length
      ? Video.find({ $text: { $search: terms.join(" ") } })
          .select({ ...CARD_PROJECTION, textScore: { $meta: "textScore" } })
          .sort({ textScore: { $meta: "textScore" } })
          .limit(PER_TEXT)
          .lean()
      : [],
    findCoWatched({ platform, platformVideoId, viewerId }),
    viewerId ? findFavouriteChannels(viewerId) : new Set(),
  ]);

  const hits = [
    ...keyPages.flatMap((page, index) =>
      page.map((video, position) => ({ video, source: "search", key: keys[index].key, niche: keys[index].niche, position }))
    ),
    ...channelRows.map(video => ({ video, source: "channel" })),
    ...textRows.map(({ textScore, ...video }) => ({ video, source: "text", textScore })),
    // An entry whose row is gone has no rows here.
    ...coWatched.flatMap(({ rows, watchers }) => rows.map(video => ({ video, source: "cowatch", watchers }))),
  ];

  const currentKey = buildVideoKey(current);

  // A small topic, or a video we never cached, gets the trending videos too. They rank below everything else.
  if (distinctCandidateKeys(hits, currentKey).length < MIN_CANDIDATES) {
    const trending = await Promise.all(SUPPORTED_PLATFORMS.map(getTrendingVideos));
    hits.push(...trending.flatMap(result => result.videos).map(video => ({ video, source: "trending" })));
  }

  const candidateKeys = distinctCandidateKeys(hits, currentKey);
  const watchedKeys = viewerId ? await getWatchedKeys(viewerId, candidateKeys) : new Set();
  const videos = rankRelatedVideos({ current, hits, watchedKeys, favouriteChannels, limit: RELATED_LIMIT }).map(
    ({ description, tags, ...video }) => video
  );

  console.log(
    `🎞️ [related:${currentKey}] ${videos.length} of ${candidateKeys.length} candidates (${keys.length} searches, channel ${current.channelId ? "yes" : "no"}, ${terms.length} terms, ${coWatched.length} co-watched) in ${Date.now() - startedAt} ms`
  );

  return { videos };
};
