import { Video } from "../models/video.model.js";
import { TrendingSnapshot } from "../models/trendingSnapshot.model.js";
import { TrendTopic } from "../models/trendTopic.model.js";
import { CrawlerState } from "../models/crawlerState.model.js";
import { getYouTubeChart } from "../providers/youtube.provider.js";
import { listTrendingDailymotion } from "../providers/dailymotion.provider.js";
import { fetchGoogleTrendingTopics } from "../providers/googleTrends.provider.js";
import { TREND_REGION, YOUTUBE_CHART_CATEGORIES, getTrendingKey } from "../config/trends.config.js";
import { claimJobSlot } from "../utils/jobSlots.js";
import { findSpikingKeys } from "../utils/searchLog.js";
import { findSimilarCachedSearch } from "../utils/similarSearch.js";
import { normalizeSearchText, resolveCachedSearchIntent, resolveSearchIntent } from "../utils/nicheResolver.js";
import { getConsumerCap, getQuotaSnapshot } from "../utils/quotaTracker.js";
import { fetchVideosByQuery, growCachedSearch } from "./videoFetch.service.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const JOB = "trendCrawler";
const GOOGLE_TRENDS_EVERY_MS = 45 * MINUTE_MS;
// At most 1 trend search an hour. The ledger caps them at 15 a day.
const TOPIC_FETCH_EVERY_MS = HOUR_MS;
const TOPIC_REFETCH_AFTER_MS = 24 * HOUR_MS;
// Feed topics count while the feed has listed them recently.
const FEED_TOPIC_FRESH_MS = 2 * HOUR_MS;
const RESULTS_PER_PROVIDER = 50;
const TOPIC_FETCH_PAGE_SIZE = 24;

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Stores trending videos under the trending key (upserted, so their details stay fresh) and records their order
 * as the snapshot for this platform and category. Rows are never deleted when they drop out of a snapshot:
 * likes and playlists may point to them. An empty list keeps the previous snapshot.
 */
const saveSnapshot = async ({ platform, category, videos, now }) => {
  if (!videos.length) return 0;

  const key = getTrendingKey(TREND_REGION);

  await Video.bulkWrite(
    videos.map(video => ({
      updateOne: {
        filter: { platform, platformVideoId: video.platformVideoId, query: key },
        update: {
          // Mongoose drops the fields a provider left undefined.
          $set: {
            title: video.title,
            description: video.description,
            thumbnail: video.thumbnail,
            channelTitle: video.channelTitle,
            channelId: video.channelId,
            views: video.views,
            likes: video.likes,
            durationSeconds: video.durationSeconds,
            tags: video.tags,
            fetchedAt: now,
          },
          $setOnInsert: { publishedAt: video.publishedAt },
        },
        upsert: true,
      },
    }))
  );

  const rows = await Video.find({ platform, query: key, platformVideoId: { $in: videos.map(video => video.platformVideoId) } })
    .select("_id platformVideoId")
    .lean();
  const rowIdByVideoId = new Map(rows.map(row => [row.platformVideoId, row._id]));
  const orderedRowIds = [
    ...new Set(videos.map(video => rowIdByVideoId.get(video.platformVideoId)).filter(Boolean).map(String)),
  ];

  await TrendingSnapshot.updateOne(
    { region: TREND_REGION, platform, category },
    { $set: { videos: orderedRowIds, fetchedAt: now } },
    { upsert: true }
  );

  return orderedRowIds.length;
};

// YouTube's chart, one category per tick in rotation: 1 general unit, never a search call.
const pollYouTubeChart = async now => {
  const previous = await CrawlerState.findOneAndUpdate(
    { job: "trendChart", key: TREND_REGION },
    { $inc: { keywordIndex: 1 } },
    { upsert: true, new: false }
  ).lean();
  const category = YOUTUBE_CHART_CATEGORIES[(previous?.keywordIndex ?? 0) % YOUTUBE_CHART_CATEGORIES.length];

  const videos = await getYouTubeChart({ regionCode: TREND_REGION, videoCategoryId: category.id, consumer: "trendCrawler" });
  const saved = await saveSnapshot({ platform: "youtube", category: category.name, videos, now });

  if (!saved) console.log(`⚠️ [trends] YouTube chart "${category.name}" for ${TREND_REGION} came back empty.`);
  return { category: category.name, saved };
};

// Dailymotion's trending list for the region. Free.
const pollDailymotionTrending = async now => {
  const videos = await listTrendingDailymotion({ country: TREND_REGION, limit: RESULTS_PER_PROVIDER });
  return { saved: await saveSnapshot({ platform: "dailymotion", category: "all", videos, now }) };
};

// Google Trends' feed, every 45 minutes. Each listed topic gets seenAt = now.
const pollGoogleTrends = async now => {
  const slot = await claimJobSlot({ job: JOB, key: "googleTrends", minGapMs: GOOGLE_TRENDS_EVERY_MS, now });
  if (!slot.claimed) return { polled: false };

  const topics = await fetchGoogleTrendingTopics(TREND_REGION);

  if (topics.length) {
    await TrendTopic.bulkWrite(
      topics.map(({ topic, traffic }) => ({
        updateOne: {
          filter: { region: TREND_REGION, source: "googleTrends", topic },
          update: { $set: { traffic, seenAt: now } },
          upsert: true,
        },
      }))
    );
  }

  return { polled: true, topics: topics.length };
};

const fetchedRecently = (key, now) =>
  CrawlerState.exists({ job: "trendTopic", key, lastRunAt: { $gt: new Date(now.getTime() - TOPIC_REFETCH_AFTER_MS) } });

const isCached = key => Video.exists({ query: key, searchRank: { $ne: null } });

const isSearchable = text =>
  text.length >= MIN_QUERY_LENGTH && text.length <= MAX_QUERY_LENGTH && HAS_LETTER_OR_DIGIT.test(text);

/**
 * The next topic worth one search call, or null:
 * - first, searches spiking in our own log (cached ones get their next page, uncached ones their first);
 * - then Google Trends topics that aren't cached and have no similar cached search, biggest first.
 * Nothing fetched in the last 24 hours qualifies again.
 */
const findTopicToFetch = async now => {
  for (const { key } of await findSpikingKeys(now)) {
    if (await fetchedRecently(key, now)) continue;
    return { key, cached: Boolean(await isCached(key)), source: "searchSpike" };
  }

  const feedTopics = await TrendTopic.find({
    region: TREND_REGION,
    source: "googleTrends",
    seenAt: { $gte: new Date(now.getTime() - FEED_TOPIC_FRESH_MS) },
  })
    .sort({ traffic: -1 })
    .lean();

  for (const { topic } of feedTopics) {
    const text = normalizeSearchText(topic);
    if (!isSearchable(text)) continue;

    const { dbQuery, niche } = resolveSearchIntent(text);
    if (await fetchedRecently(dbQuery, now)) continue;
    if (await isCached(dbQuery)) continue;
    if (!niche && (await findSimilarCachedSearch(dbQuery))) continue;

    return { key: dbQuery, cached: false, source: "googleTrends" };
  }

  return null;
};

const trendShareIsUsedUp = async () => {
  const snapshot = await getQuotaSnapshot();
  return (snapshot.search.byConsumer?.trendCrawler ?? 0) >= getConsumerCap("search", "trendCrawler");
};

/**
 * At most one trend search an hour, from the trend crawler's share. It goes through the same refill path as a
 * user search (consumer "trendCrawler", regionCode IN), so QueryState keeps the next page token and the first
 * real user starts on page 2. A spiking search that is already cached gets its next YouTube page instead.
 */
const maybeFetchTopic = async now => {
  if (await trendShareIsUsedUp()) return null;

  const candidate = await findTopicToFetch(now);
  if (!candidate) return null;

  const slot = await claimJobSlot({ job: JOB, key: "_topicFetch", minGapMs: TOPIC_FETCH_EVERY_MS, now });
  if (!slot.claimed) return null;

  await CrawlerState.updateOne({ job: "trendTopic", key: candidate.key }, { $set: { lastRunAt: now } }, { upsert: true });

  const intent = resolveCachedSearchIntent(candidate.key);

  if (candidate.cached) {
    const { limit } = await growCachedSearch({
      dbQuery: intent.dbQuery,
      providerQuery: intent.providerQuery,
      platform: "youtube",
      consumer: "trendCrawler",
    });
    console.log(`📈 [trends] "${candidate.key}" is spiking: fetched its next YouTube page${limit ? ` (stopped: ${limit.reason})` : ""}.`);
    return { ...candidate, limit: limit?.reason ?? null };
  }

  const { terminalReasonByPlatform } = await fetchVideosByQuery({
    query: intent.dbQuery,
    providerQuery: intent.providerQuery,
    platform: "all",
    limit: TOPIC_FETCH_PAGE_SIZE,
    consumer: "trendCrawler",
    regionCode: TREND_REGION,
  });
  console.log(`📈 [trends] fetched "${candidate.key}" (${candidate.source}). YouTube: ${terminalReasonByPlatform.youtube ?? "ok"}.`);
  return { ...candidate, limit: terminalReasonByPlatform.youtube };
};

/**
 * One scheduler tick (every 5 minutes). Polling (the YouTube chart, Dailymotion's trending list, the Google
 * Trends feed) never spends a search call; only maybeFetchTopic can, at most once an hour. Each step fails on its
 * own without stopping the others.
 */
export const runTrendCrawlerTick = async ({ now = new Date() } = {}) => {
  const steps = {
    youtubeChart: pollYouTubeChart,
    dailymotionTrending: pollDailymotionTrending,
    googleTrends: pollGoogleTrends,
    topicFetch: maybeFetchTopic,
  };
  const outcome = {};

  for (const [name, step] of Object.entries(steps)) {
    try {
      outcome[name] = await step(now);
    } catch (error) {
      console.log(`⚠️ [trends] ${name} failed: ${error.message}`);
      outcome[name] = { error: error.message };
    }
  }

  return outcome;
};
