import { QuotaUsage } from "../models/quotaUsage.model.js";

// YouTube quota as YouTube counts it since June 2026, per Google Cloud project and Pacific-time day:
// - "search": search.list calls, 100 a day whatever maxResults is.
// - "general": units of every other method, 10,000 a day. videos.list costs 1.
// Both reset at midnight Pacific time. The usage lives in MongoDB (models/quotaUsage.model.js), so restarts
// don't reset it.
const QUOTA_TIME_ZONE = "America/Los_Angeles";
const DEFAULT_SEARCH_CALLS_PER_DAY = 100;
const DEFAULT_GENERAL_UNITS_PER_DAY = 10000;

export const QUOTA_BUCKETS = ["search", "general"];
export const QUOTA_CONSUMERS = ["user", "nicheCrawler", "trendCrawler", "refresh"];

// Share of the daily search calls each consumer may use: 70 / 15 / 15 of 100. Shares rather than counts, so
// the split still holds if the daily limit is raised. The general bucket only has its overall limit.
const SEARCH_SHARE_PERCENT_BY_CONSUMER = { user: 70, nicheCrawler: 15, trendCrawler: 15, refresh: 0 };

const resolvePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getBucketLimit = bucket =>
  bucket === "search"
    ? resolvePositiveNumber(process.env.YOUTUBE_SEARCH_CALLS_PER_DAY, DEFAULT_SEARCH_CALLS_PER_DAY)
    : resolvePositiveNumber(process.env.YOUTUBE_GENERAL_UNITS_PER_DAY, DEFAULT_GENERAL_UNITS_PER_DAY);

export const getConsumerCap = (bucket, consumer) => {
  const limit = getBucketLimit(bucket);
  return bucket === "search" ? Math.floor((limit * SEARCH_SHARE_PERCENT_BY_CONSUMER[consumer]) / 100) : limit;
};

const pacificFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: QUOTA_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const getPacificParts = date =>
  Object.fromEntries(
    pacificFormatter
      .formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  );

// Milliseconds to add to a UTC time to get Pacific wall-clock time (-7 h or -8 h, depending on DST).
const getPacificOffsetMs = date => {
  const parts = getPacificParts(date);
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000;
};

// The quota day a moment belongs to, as a Pacific-time date: "2026-10-13".
export const getQuotaDay = (date = new Date()) => {
  const { year, month, day } = getPacificParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

// When YouTube resets the quota next: the coming midnight, Pacific time.
export const getNextResetTime = (date = new Date()) => {
  const { year, month, day } = getPacificParts(date);
  const nextMidnightWallClock = Date.UTC(year, month - 1, day + 1);
  // The offset at midnight can differ from the current one on DST days, so check it at the first guess.
  const firstGuess = nextMidnightWallClock - getPacificOffsetMs(date);
  return new Date(nextMidnightWallClock - getPacificOffsetMs(new Date(firstGuess)));
};

const assertKnown = (bucket, consumer) => {
  if (!QUOTA_BUCKETS.includes(bucket)) throw new Error(`Unknown quota bucket: ${bucket}`);
  if (!QUOTA_CONSUMERS.includes(consumer)) throw new Error(`Unknown quota consumer: ${consumer}`);
};

const ensureDayDocument = async (day, bucket) => {
  try {
    await QuotaUsage.updateOne({ day, bucket }, { $setOnInsert: { day, bucket } }, { upsert: true });
  } catch (error) {
    // Another request created it at the same moment.
    if (error.code !== 11000) throw error;
  }
};

/**
 * Reserves `units` of `bucket` for `consumer` before a YouTube call. Returns { ok: true } or, when the bucket
 * or the consumer's share is used up, { ok: false, retryAt } with the next reset. The increment only happens if
 * both limits still allow it, in one atomic update, so parallel requests can't overshoot.
 */
export const reserveQuota = async ({ bucket, units = 1, consumer }) => {
  assertKnown(bucket, consumer);

  const day = getQuotaDay();
  const limit = getBucketLimit(bucket);
  const cap = getConsumerCap(bucket, consumer);
  const consumerPath = `byConsumer.${consumer}`;

  await ensureDayDocument(day, bucket);

  const usage = await QuotaUsage.findOneAndUpdate(
    {
      day,
      bucket,
      used: { $lte: limit - units },
      // $not also matches a document without this consumer's counter yet.
      [consumerPath]: { $not: { $gt: cap - units } },
    },
    { $inc: { used: units, [consumerPath]: units } },
    { new: true }
  ).lean();

  if (!usage) {
    console.log(`🛑 [quota] ${bucket} denied for ${consumer}: daily limit or its share is used up (day ${day} PT).`);
    return { ok: false, retryAt: getNextResetTime() };
  }

  console.log(
    `📊 [quota] ${bucket} +${units} ${consumer}: ${consumer} ${usage.byConsumer[consumer]}/${cap}, total ${usage.used}/${limit} (day ${day} PT)`
  );

  return { ok: true, retryAt: null };
};

// YouTube answered quotaExceeded, so the bucket is empty whatever the ledger says (another app, an older
// process, a miscount). Marking it used up stops every call until the reset.
export const markBucketSpent = async bucket => {
  const day = getQuotaDay();

  await QuotaUsage.updateOne(
    { day, bucket },
    { $max: { used: getBucketLimit(bucket) }, $set: { spentAt: new Date() } },
    { upsert: true }
  );

  console.log(`🛑 [quota] YouTube says the ${bucket} bucket is empty. No ${bucket} calls until ${getNextResetTime().toISOString()}.`);
};

// Today's usage of both buckets, for logs.
export const getQuotaSnapshot = async () => {
  const day = getQuotaDay();
  const docs = await QuotaUsage.find({ day }).lean();

  return {
    day,
    resetsAt: getNextResetTime(),
    ...Object.fromEntries(
      QUOTA_BUCKETS.map(bucket => {
        const doc = docs.find(entry => entry.bucket === bucket);
        return [
          bucket,
          {
            used: doc?.used ?? 0,
            limit: getBucketLimit(bucket),
            byConsumer: doc?.byConsumer ?? {},
            spentAt: doc?.spentAt ?? null,
          },
        ];
      })
    ),
  };
};
