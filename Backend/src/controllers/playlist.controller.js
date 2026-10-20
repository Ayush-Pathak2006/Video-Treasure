import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Playlist } from "../models/playlist.model.js";
import { PlaylistItem } from "../models/playlistItem.model.js";
import { findOrCreateVideo } from "../services/video.service.js";
import { refreshPlaylistSummary } from "../services/playlist.service.js";

// Abuse limits.
const MAX_PLAYLISTS_PER_USER = 100;
const MAX_VIDEOS_PER_PLAYLIST = 1000;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

// "youtube:dQw4w9WgXcQ" -> { platform, platformVideoId }. The id itself may contain ":".
const parseVideoKey = videoKey => {
  const separator = String(videoKey).indexOf(":");

  if (separator <= 0 || separator === videoKey.length - 1) {
    throw new ApiError(400, "Invalid video key");
  }

  return { platform: videoKey.slice(0, separator), platformVideoId: videoKey.slice(separator + 1) };
};

// The user's own playlist. Someone else's answers 404 like a missing one, so playlist ids don't leak.
const findOwnPlaylist = async (playlistId, userId) => {
  const playlist = mongoose.isValidObjectId(playlistId) ? await Playlist.findOne({ _id: playlistId, owner: userId }) : null;

  if (!playlist) {
    throw new ApiError(404, "Playlist not found");
  }

  return playlist;
};

// Validated name/description/visibility from a request body. Only the fields present are returned.
const readPlaylistFields = (body, { requireName }) => {
  const fields = {};

  if (requireName || body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name || name.length > MAX_NAME_LENGTH) {
      throw new ApiError(400, `Playlist names need 1 to ${MAX_NAME_LENGTH} characters.`);
    }

    fields.name = name;
  }

  if (body.description !== undefined) {
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new ApiError(400, `Descriptions can have up to ${MAX_DESCRIPTION_LENGTH} characters.`);
    }

    fields.description = description;
  }

  if (body.visibility !== undefined && body.visibility !== "private") {
    throw new ApiError(400, "Playlists can only be private for now.");
  }

  return fields;
};

const createPlaylist = asyncHandler(async (req, res) => {
  const fields = readPlaylistFields(req.body, { requireName: true });

  if ((await Playlist.countDocuments({ owner: req.user._id })) >= MAX_PLAYLISTS_PER_USER) {
    throw new ApiError(400, `You can have up to ${MAX_PLAYLISTS_PER_USER} playlists.`);
  }

  const playlist = await Playlist.create({ ...fields, owner: req.user._id });

  return res.status(201).json(new ApiResponse(201, playlist, "Playlist created"));
});

const getMyPlaylists = asyncHandler(async (req, res) => {
  const playlists = await Playlist.find({ owner: req.user._id }).sort({ updatedAt: -1 }).lean();

  return res.status(200).json(new ApiResponse(200, playlists, "Playlists fetched"));
});

// Ids of my playlists that contain this video, for the checkboxes of the save dialog.
const getPlaylistsContainingVideo = asyncHandler(async (req, res) => {
  const { platform, platformVideoId } = parseVideoKey(req.params.videoKey);
  const myPlaylistIds = await Playlist.find({ owner: req.user._id }).distinct("_id");
  const playlistIds = await PlaylistItem.find({ playlist: { $in: myPlaylistIds }, platform, platformVideoId }).distinct("playlist");

  return res.status(200).json(new ApiResponse(200, { playlistIds }, "Playlists containing the video fetched"));
});

const getPlaylistById = asyncHandler(async (req, res) => {
  const playlist = await findOwnPlaylist(req.params.playlistId, req.user._id);
  const items = await PlaylistItem.find({ playlist: playlist._id }).sort({ position: 1, _id: 1 }).populate("video").lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      { playlist, videos: items.filter(item => item.video).map(item => ({ ...item.video, addedAt: item.createdAt })) },
      "Playlist fetched"
    )
  );
});

const updatePlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnPlaylist(req.params.playlistId, req.user._id);
  Object.assign(playlist, readPlaylistFields(req.body, { requireName: false }));
  await playlist.save();

  return res.status(200).json(new ApiResponse(200, playlist, "Playlist updated"));
});

const deletePlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnPlaylist(req.params.playlistId, req.user._id);

  // Items first, so a crash halfway leaves an empty playlist rather than orphaned items.
  await PlaylistItem.deleteMany({ playlist: playlist._id });
  await Playlist.deleteOne({ _id: playlist._id });

  return res.status(200).json(new ApiResponse(200, { deleted: true }, "Playlist deleted"));
});

// Takes the whole video object, like likes do. Adding a video that is already in the playlist does nothing.
const addVideoToPlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnPlaylist(req.params.playlistId, req.user._id);
  const video = await findOrCreateVideo(req.body);
  const identity = { playlist: playlist._id, platform: video.platform, platformVideoId: video.platformVideoId };

  if (await PlaylistItem.exists(identity)) {
    return res.status(200).json(new ApiResponse(200, { added: false }, "The video is already in the playlist"));
  }

  if ((await PlaylistItem.countDocuments({ playlist: playlist._id })) >= MAX_VIDEOS_PER_PLAYLIST) {
    throw new ApiError(400, `A playlist can hold up to ${MAX_VIDEOS_PER_PLAYLIST} videos.`);
  }

  const lastItem = await PlaylistItem.findOne({ playlist: playlist._id }).sort({ position: -1 }).select("position").lean();
  let added = true;

  try {
    await PlaylistItem.create({ ...identity, video: video._id, position: (lastItem?.position ?? 0) + 1 });
  } catch (error) {
    // The same video was added by a parallel request.
    if (error.code !== 11000) throw error;
    added = false;
  }

  await refreshPlaylistSummary(playlist._id);

  return res.status(200).json(new ApiResponse(200, { added }, added ? "Video added to the playlist" : "The video is already in the playlist"));
});

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnPlaylist(req.params.playlistId, req.user._id);
  const { platform, platformVideoId } = parseVideoKey(req.params.videoKey);
  const { deletedCount } = await PlaylistItem.deleteOne({ playlist: playlist._id, platform, platformVideoId });

  await refreshPlaylistSummary(playlist._id);

  return res.status(200).json(new ApiResponse(200, { removed: deletedCount === 1 }, "Video removed from the playlist"));
});

export {
  createPlaylist,
  getMyPlaylists,
  getPlaylistsContainingVideo,
  getPlaylistById,
  updatePlaylist,
  deletePlaylist,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
};
