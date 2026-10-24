import { Video } from "../models/video.model.js";
import { Like } from "../models/like.model.js";
import { getYouTubeVideoDetails } from "../providers/youtube.provider.js";
import { removePlaylistItemsForVideos } from "./playlist.service.js";
import { removeCommentsForVideos } from "./comment.service.js";
import { removeHistoryForVideos } from "./watchHistory.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// YouTube's Developer Policies (III.E.4) allow keeping API data for 30 days, then it must be refreshed or
// deleted. Refreshing after 25 leaves a margin for a few days without quota.
const REFRESH_AFTER_MS = 25 * DAY_MS;
// videos.list takes up to 50 ids and costs 1 general unit whatever the count.
const IDS_PER_CALL = 50;
const CALLS_PER_TICK = 4;

// The stalest YouTube videos, one entry per platformVideoId (a video can have a row per cache key). Rows without
// fetchedAt count as stale.
const findStaleVideoIds = async now => {
  const groups = await Video.aggregate([
    { $match: { platform: "youtube", fetchedAt: { $not: { $gte: new Date(now.getTime() - REFRESH_AFTER_MS) } } } },
    { $group: { _id: "$platformVideoId", oldest: { $min: "$fetchedAt" } } },
    { $sort: { oldest: 1 } },
    { $limit: IDS_PER_CALL },
  ]);

  return groups.map(group => group._id);
};

/**
 * Deletes every row of these videos and everything that points to them (likes, playlist items, comments and their
 * likes, watch history). Used when a video is gone from YouTube or can no longer be embedded. The rows go last, so a
 * crash halfway can't leave anything pointing at deleted videos.
 */
export const removeVideos = async (platform, platformVideoIds) => {
  if (!platformVideoIds.length) return 0;

  const rows = await Video.find({ platform, platformVideoId: { $in: platformVideoIds } }).select("_id").lean();
  const rowIds = rows.map(row => row._id);

  await Like.deleteMany({ video: { $in: rowIds } });
  await removePlaylistItemsForVideos(rowIds);
  await removeCommentsForVideos(platform, platformVideoIds);
  await removeHistoryForVideos(platform, platformVideoIds);
  const { deletedCount } = await Video.deleteMany({ _id: { $in: rowIds } });
  return deletedCount;
};

// Only the fields videos.list returned: a missing snippet must not blank the stored title, channel id or tags.
const toRefreshedFields = (details, now) =>
  Object.fromEntries(
    Object.entries({
      title: details.title,
      description: details.description,
      thumbnail: details.thumbnail,
      channelTitle: details.channelTitle,
      channelId: details.channelId,
      views: details.views,
      likes: details.likes,
      durationSeconds: details.durationSeconds,
      tags: details.tags,
      fetchedAt: now,
    }).filter(([, value]) => value !== undefined)
  );

/**
 * One scheduler tick: refreshes up to CALLS_PER_TICK batches of stale YouTube videos, charged to the general
 * bucket as consumer "refresh". Every row of a video gets the new details; videos YouTube no longer returns
 * (deleted, private) or that are no longer embeddable are deleted with their likes.
 */
export const runVideoRefreshTick = async ({ now = new Date() } = {}) => {
  let refreshed = 0;
  let removed = 0;

  for (let call = 0; call < CALLS_PER_TICK; call += 1) {
    const videoIds = await findStaleVideoIds(now);
    if (!videoIds.length) break;

    let detailsById;

    try {
      detailsById = await getYouTubeVideoDetails(videoIds, { consumer: "refresh" });
    } catch (error) {
      // Daily limit or a failed call: try again on a later tick.
      console.log(`⚠️ [refresh] videos.list failed, trying again later: ${error.message}`);
      break;
    }

    const available = videoIds.filter(id => detailsById.get(id)?.embeddable);
    const gone = videoIds.filter(id => !detailsById.get(id)?.embeddable);

    if (available.length) {
      await Video.bulkWrite(
        available.map(id => ({
          updateMany: {
            filter: { platform: "youtube", platformVideoId: id },
            update: { $set: toRefreshedFields(detailsById.get(id), now) },
          },
        }))
      );
    }

    refreshed += available.length;
    removed += await removeVideos("youtube", gone);
  }

  if (refreshed || removed) {
    console.log(`🔄 [refresh] refreshed ${refreshed} YouTube videos, deleted ${removed} rows of videos that are gone.`);
  }

  return { refreshed, removed };
};
