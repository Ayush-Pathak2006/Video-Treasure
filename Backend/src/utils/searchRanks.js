import { Video } from "../models/video.model.js";
import { rankByRelevance } from "./videoRanking.js";
import { resolveSearchIntent } from "./nicheResolver.js";

// Rank of the first (direction 1) or last (direction -1) cached video of a search, or null when none is ranked yet.
const getEdgeRank = async (query, direction) => {
  const video = await Video.findOne({ query, searchRank: { $ne: null } })
    .sort({ searchRank: direction })
    .select("searchRank")
    .lean();

  return video?.searchRank ?? null;
};

/**
 * Gives `videos` (best first) the cache key `query` and the next ranks of that search. All platforms of a
 * search share one sequence, so a new API page always lands after every cached video and a user's cursor
 * can't skip it, even with platform=all. The crawler passes `atStart` to put its fresh picks in front.
 */
export const assignSearchRanks = async (videos, query, { atStart = false } = {}) => {
  const firstNewRank = atStart
    ? ((await getEdgeRank(query, 1)) ?? 1) - videos.length
    : ((await getEdgeRank(query, -1)) ?? 0) + 1;

  return videos.map((video, index) => ({ ...video, query, searchRank: firstNewRank + index }));
};

// Videos cached before searchRank existed are ranked once, at startup. Insert order (_id) is the order the
// provider returned them in, so it stands in for their relevance position.
export const ensureSearchRanks = async () => {
  const groups = await Video.aggregate([
    { $match: { searchRank: null, query: { $ne: null } } },
    { $group: { _id: { query: "$query", platform: "$platform" } } },
  ]);

  let rankedCount = 0;

  for (const { _id: { query, platform } } of groups) {
    const unranked = await Video.find({ query, platform, searchRank: null }).sort({ _id: 1 }).lean();
    const ordered = rankByRelevance(unranked, resolveSearchIntent(query).providerQuery);
    const withRanks = await assignSearchRanks(ordered, query);

    await Video.bulkWrite(
      withRanks.map(({ _id, searchRank }) => ({ updateOne: { filter: { _id }, update: { $set: { searchRank } } } }))
    );

    rankedCount += withRanks.length;
  }

  if (rankedCount) {
    console.log(`🔢 Ranked ${rankedCount} cached videos across ${groups.length} searches.`);
  }
};
