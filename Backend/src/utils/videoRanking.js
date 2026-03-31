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