import mongoose, { Schema } from "mongoose";

const videoSchema = new Schema({
    platformVideoId: {
        type: String,
        required: true,
        unique: true,
    },
    title: {
        type: String,
        required: true,
    },
    thumbnail: {
        type: String, 
        required: true,
    },
    channelTitle: {
        type: String,
        required: true,
    },
}, { timestamps: true });

export const Video = mongoose.model("Video", videoSchema);