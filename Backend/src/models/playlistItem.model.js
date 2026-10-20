import mongoose, { Schema } from "mongoose";

const playlistItemSchema = new Schema(
  {
    playlist: {
      type: Schema.Types.ObjectId,
      ref: "Playlist",
      required: true,
    },
    // One of the video's rows. A platform video can have several Video rows (one per cache key).
    video: {
      type: Schema.Types.ObjectId,
      ref: "Video",
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["youtube", "dailymotion"],
      required: true,
    },
    platformVideoId: {
      type: String,
      required: true,
    },
    position: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

// One entry per platform video. A unique rule on `video` alone would let the same video in twice through two
// of its Video rows.
playlistItemSchema.index({ playlist: 1, platform: 1, platformVideoId: 1 }, { unique: true });
playlistItemSchema.index({ playlist: 1, position: 1 });

export const PlaylistItem = mongoose.model("PlaylistItem", playlistItemSchema);
