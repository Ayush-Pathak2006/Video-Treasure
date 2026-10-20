import { TrendingSnapshot } from "../models/trendingSnapshot.model.js";
import { TREND_REGION, TRENDING_RAIL_SIZE, YOUTUBE_CHART_CATEGORIES } from "../config/trends.config.js";

const CATEGORY_ORDER = YOUTUBE_CHART_CATEGORIES.map(category => category.name);

/**
 * The trending rail for one platform, from the stored snapshots only: no API call, ever. YouTube's categories
 * are interleaved (the overall chart first) so the rail mixes music, gaming and film, without repeats.
 */
export const getTrendingVideos = async platform => {
  const snapshots = await TrendingSnapshot.find({ region: TREND_REGION, platform }).populate("videos").lean();

  snapshots.sort((a, b) => {
    const rank = name => (CATEGORY_ORDER.includes(name) ? CATEGORY_ORDER.indexOf(name) : CATEGORY_ORDER.length);
    return rank(a.category) - rank(b.category);
  });

  const lists = snapshots.map(snapshot => snapshot.videos.filter(Boolean));
  const seen = new Set();
  const videos = [];

  for (let position = 0; videos.length < TRENDING_RAIL_SIZE && lists.some(list => position < list.length); position += 1) {
    for (const list of lists) {
      const video = list[position];
      if (!video || seen.has(video.platformVideoId) || videos.length >= TRENDING_RAIL_SIZE) continue;
      seen.add(video.platformVideoId);
      videos.push(video);
    }
  }

  const updatedAt = snapshots.reduce((latest, snapshot) => (!latest || snapshot.fetchedAt > latest ? snapshot.fetchedAt : latest), null);
  return { videos, updatedAt };
};
