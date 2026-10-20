import { Playlist } from "../models/playlist.model.js";
import { PlaylistItem } from "../models/playlistItem.model.js";

/**
 * Recomputes a playlist's itemCount and coverThumbnail (the first video's thumbnail) from its items. Called after
 * every change to the items, so the summary on "My playlists" never drifts.
 */
export const refreshPlaylistSummary = async playlistId => {
  const [itemCount, firstItem] = await Promise.all([
    PlaylistItem.countDocuments({ playlist: playlistId }),
    PlaylistItem.findOne({ playlist: playlistId }).sort({ position: 1, _id: 1 }).populate("video", "thumbnail").lean(),
  ]);

  await Playlist.updateOne(
    { _id: playlistId },
    { $set: { itemCount, coverThumbnail: firstItem?.video?.thumbnail ?? null } }
  );
};

// Removes the playlist entries that point to these Video rows (the videos are being deleted) and fixes the
// summaries of the playlists they were in.
export const removePlaylistItemsForVideos = async videoRowIds => {
  const items = await PlaylistItem.find({ video: { $in: videoRowIds } }).select("playlist").lean();
  if (!items.length) return 0;

  await PlaylistItem.deleteMany({ video: { $in: videoRowIds } });

  const playlistIds = [...new Set(items.map(item => String(item.playlist)))];
  await Promise.all(playlistIds.map(refreshPlaylistSummary));

  return items.length;
};
