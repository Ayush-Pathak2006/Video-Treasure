import { Video } from "../models/video.model.js";
import { CrawlerState } from "../models/crawlerState.model.js";
import { NICHE_TOPICS } from "../config/niches.config.js";
import { PROVIDERS, SUPPORTED_PLATFORMS } from "../providers/provider.registry.js";
import { rankVideos } from "../utils/videoRanking.js";
import { assignSearchRanks } from "../utils/searchRanks.js";
import { rememberCachedSearch } from "../utils/similarSearch.js";
import { claimJobSlot } from "../utils/jobSlots.js";

const HOUR_MS = 60 * 60 * 1000;

const NICHE_JOB = "nicheCrawler";
// The niche crawler as a whole. Its lastRunAt is the last crawl of any niche.
const SCHEDULE_KEY = "_schedule";

// One niche at most every 2 hours, each niche once a day: the 12 niches spread over the day.
const MIN_GAP_BETWEEN_CRAWLS_MS = 2 * HOUR_MS;
const RECRAWL_NICHE_AFTER_MS = 24 * HOUR_MS;
// A niche's first crawl looks this far back for new videos.
const FIRST_CRAWL_LOOKBACK_MS = 30 * 24 * HOUR_MS;

const RESULTS_PER_PROVIDER = 50;
// The best picks of a crawl go in front of the niche's cached results; the rest go at the end.
const PICKS_IN_FRONT = 10;

// Optional region for niche searches ("IN"). Unset means YouTube's default, which isn't limited to a country.
const getNicheRegionCode = () => process.env.NICHE_REGION_CODE || undefined;

// The niche whose last crawl is oldest (never-crawled niches first, in config order), if it is due.
const findDueNiche = async now => {
  const states = await CrawlerState.find({ job: NICHE_JOB, key: { $in: NICHE_TOPICS.map(niche => niche.name) } }).lean();
  const stateByNiche = new Map(states.map(state => [state.key, state]));

  const [oldest] = NICHE_TOPICS.map(niche => ({ niche, state: stateByNiche.get(niche.name) ?? null })).sort(
    (a, b) => (a.state?.lastRunAt?.getTime() ?? 0) - (b.state?.lastRunAt?.getTime() ?? 0)
  );

  const lastRunAt = oldest.state?.lastRunAt;
  return lastRunAt && now - lastRunAt < RECRAWL_NICHE_AFTER_MS ? null : oldest;
};

/**
 * Crawls one niche: one keyword (rotating), only videos published since the niche's last crawl. YouTube charges
 * the search to the crawler's share of the quota (15 a day), and the crawler never touches QueryState.
 */
const crawlNiche = async ({ niche, state }, now) => {
  const keywordIndex = state?.keywordIndex ?? 0;
  const keyword = niche.keywords[keywordIndex % niche.keywords.length];
  const publishedAfter = state?.lastRunAt ?? new Date(now.getTime() - FIRST_CRAWL_LOOKBACK_MS);

  const results = await Promise.allSettled(
    SUPPORTED_PLATFORMS.map(platform =>
      PROVIDERS[platform].search(keyword, null, {
        maxResults: RESULTS_PER_PROVIDER,
        consumer: "nicheCrawler",
        publishedAfter,
        regionCode: getNicheRegionCode(),
      })
    )
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.log(`⚠️ [crawler:${niche.name}] ${PROVIDERS[SUPPORTED_PLATFORMS[index]].name} failed: ${result.reason?.message}`);
    }
  });

  // Nothing came back at all: leave the niche due, so a later tick tries again.
  if (results.every(result => result.status === "rejected")) {
    return false;
  }

  const ranked = rankVideos(results.flatMap(result => (result.status === "fulfilled" ? result.value.videos : [])));
  const inFront = await assignSearchRanks(ranked.slice(0, PICKS_IN_FRONT), niche.name, { atStart: true });
  const atEnd = await assignSearchRanks(ranked.slice(PICKS_IN_FRONT), niche.name);

  // Videos already cached under this niche are rejected by the unique index; the rest are still inserted.
  const inserted = await Video.insertMany([...inFront, ...atEnd], { ordered: false }).catch(error => error.insertedDocs ?? []);
  rememberCachedSearch(niche.name, inserted);

  await CrawlerState.updateOne(
    { job: NICHE_JOB, key: niche.name },
    { $set: { lastRunAt: now }, $inc: { keywordIndex: 1 } },
    { upsert: true }
  );

  console.log(
    `✅ [crawler:${niche.name}] keyword="${keyword}" since=${publishedAfter.toISOString()} fetched=${ranked.length} inserted=${inserted.length}`
  );
  return true;
};

/**
 * One scheduler tick: crawls at most one niche, the one crawled longest ago, if it is due (24 h) and the last
 * niche crawl was at least 2 h ago. Both times live in MongoDB, so a restart neither crawls everything again
 * nor loses its place. Returns the crawled niche's name, or null.
 */
export const runNicheCrawlerTick = async ({ now = new Date() } = {}) => {
  const due = await findDueNiche(now);

  if (!due) {
    return null;
  }

  const slot = await claimJobSlot({ job: NICHE_JOB, key: SCHEDULE_KEY, minGapMs: MIN_GAP_BETWEEN_CRAWLS_MS, now });

  if (!slot.claimed) {
    return null;
  }

  const crawled = await crawlNiche(due, now);
  return crawled ? due.niche.name : null;
};
