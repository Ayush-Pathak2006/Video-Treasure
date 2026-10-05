import { Video } from "../models/video.model.js";
import { Like } from "../models/like.model.js";

const LEGACY_INDEX = "platform_1_platformVideoId_1_query_1_createdAt_-1";
const UNIQUE_INDEX = "platform_1_platformVideoId_1_query_1";

// Keeps the oldest row of each {platform, platformVideoId, query} group and moves the others' likes onto it.
const removeDuplicateVideos = async () => {
  const groups = await Video.aggregate([
    { $sort: { createdAt: 1, _id: 1 } },
    {
      $group: {
        // A missing query and a null query collide in the unique index, so they count as one group.
        _id: {
          platform: "$platform",
          platformVideoId: "$platformVideoId",
          query: { $ifNull: ["$query", null] },
        },
        ids: { $push: "$_id" },
      },
    },
    { $match: { "ids.1": { $exists: true } } },
  ]).allowDiskUse(true);

  let removedVideos = 0;
  let movedLikes = 0;
  let droppedLikes = 0;

  for (const { ids } of groups) {
    const [keeperId, ...duplicateIds] = ids;
    const likers = new Set((await Like.distinct("likedBy", { video: keeperId })).map(String));
    const likes = await Like.find({ video: { $in: duplicateIds } }).sort({ createdAt: 1 });

    const likesToMove = [];
    const likesToDrop = [];

    // A user who liked two copies of the same video keeps one like.
    for (const like of likes) {
      const liker = String(like.likedBy);

      if (likers.has(liker)) {
        likesToDrop.push(like._id);
      } else {
        likers.add(liker);
        likesToMove.push(like._id);
      }
    }

    // Likes are moved before the videos are deleted, so a crash halfway never leaves a like pointing at a deleted video.
    if (likesToMove.length) {
      await Like.updateMany({ _id: { $in: likesToMove } }, { $set: { video: keeperId } });
    }

    if (likesToDrop.length) {
      await Like.deleteMany({ _id: { $in: likesToDrop } });
    }

    const { deletedCount } = await Video.deleteMany({ _id: { $in: duplicateIds } });

    removedVideos += deletedCount;
    movedLikes += likesToMove.length;
    droppedLikes += likesToDrop.length;
  }

  return { removedVideos, movedLikes, droppedLikes };
};

export const ensureVideoIndexes = async () => {
  // Mongoose builds the schema indexes on connect, and the unique build fails quietly while duplicates exist.
  // Wait for that attempt to settle so it doesn't race the cleanup below.
  await Video.init().catch(() => {});

  const collection = Video.collection;
  const indexes = await collection.indexes();
  const hasUniqueIndex = indexes.some(index => index.name === UNIQUE_INDEX && index.unique);

  // Once the unique index exists, duplicates can't, so the cleanup only runs until the first successful boot.
  if (!hasUniqueIndex) {
    const { removedVideos, movedLikes, droppedLikes } = await removeDuplicateVideos();
    console.log(
      `🧹 Removed ${removedVideos} duplicate videos (likes moved to the kept copy: ${movedLikes}, double likes dropped: ${droppedLikes}).`
    );
  }

  if (indexes.some(index => index.name === LEGACY_INDEX)) {
    await collection.dropIndex(LEGACY_INDEX);
    console.log(`🛠️ Dropped legacy index videos.${LEGACY_INDEX}`);
  }

  await Video.syncIndexes();
  console.log("✅ Video indexes synced.");
};
