import mongoose, { Schema } from "mongoose";

const playlistSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    // Only "private" is accepted for now. The field exists from the start so public playlists need no migration.
    visibility: {
      type: String,
      enum: ["private", "public"],
      default: "private",
    },
    // Kept in step with the items by services/playlist.service.js#refreshPlaylistSummary.
    itemCount: {
      type: Number,
      default: 0,
    },
    coverThumbnail: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// "My playlists", most recently changed first.
playlistSchema.index({ owner: 1, updatedAt: -1 });

export const Playlist = mongoose.model("Playlist", playlistSchema);
