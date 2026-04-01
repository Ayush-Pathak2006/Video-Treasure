const DEFAULT_DAILY_QUOTA_UNITS = 10000;
const DEFAULT_CRAWLER_MIN_REMAINING_PERCENT = 60;

const resolvePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getCurrentDayKey = () => new Date().toISOString().slice(0, 10);

const quotaState = {
  dayKey: getCurrentDayKey(),
  usedUnits: 0,
};

const refreshDayIfNeeded = () => {
  const nowDayKey = getCurrentDayKey();

  if (quotaState.dayKey !== nowDayKey) {
    quotaState.dayKey = nowDayKey;
    quotaState.usedUnits = 0;
  }
};

export const getDailyQuotaLimit = () =>
  resolvePositiveNumber(process.env.YOUTUBE_DAILY_QUOTA_UNITS, DEFAULT_DAILY_QUOTA_UNITS);

export const getCrawlerMinRemainingPercent = () =>
  resolvePositiveNumber(
    process.env.CRAWLER_MIN_QUOTA_REMAINING_PERCENT,
    DEFAULT_CRAWLER_MIN_REMAINING_PERCENT
  );

export const getQuotaSnapshot = () => {
  refreshDayIfNeeded();

  const dailyLimit = getDailyQuotaLimit();
  const remainingUnits = Math.max(dailyLimit - quotaState.usedUnits, 0);
  const remainingPercent = (remainingUnits / dailyLimit) * 100;

  return {
    dayKey: quotaState.dayKey,
    dailyLimit,
    usedUnits: quotaState.usedUnits,
    remainingUnits,
    remainingPercent,
  };
};

export const canConsumeQuotaUnits = units => {
  const normalizedUnits = Math.max(Number(units) || 0, 0);
  const snapshot = getQuotaSnapshot();

  return snapshot.remainingUnits >= normalizedUnits;
};

export const consumeQuotaUnits = ({ units, reason = "unspecified" }) => {
  const normalizedUnits = Math.max(Number(units) || 0, 0);

  if (!normalizedUnits) {
    return getQuotaSnapshot();
  }

  refreshDayIfNeeded();
  quotaState.usedUnits += normalizedUnits;

  const snapshot = getQuotaSnapshot();
  console.log(
    `📊 [quota] reason=${reason} consumed=${normalizedUnits} used=${snapshot.usedUnits}/${snapshot.dailyLimit} remaining=${snapshot.remainingUnits} (${snapshot.remainingPercent.toFixed(2)}%)`
  );

  return snapshot;
};

export const isCrawlerQuotaGuardActive = () => {
  const snapshot = getQuotaSnapshot();
  const minimumRemainingPercent = getCrawlerMinRemainingPercent();

  return snapshot.remainingPercent < minimumRemainingPercent;
};