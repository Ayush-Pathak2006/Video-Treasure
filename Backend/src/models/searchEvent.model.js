import mongoose from "mongoose";

const SEARCH_EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;

// One first-page search, for spotting topics that suddenly get many searchers (utils/searchLog.js). The visitor
// is stored as a keyed hash of their IP, never the IP itself. Deleted after 7 days.
const searchEventSchema = new mongoose.Schema({
  // The search's cache key.
  key: {
    type: String,
    required: true,
  },
  visitorHash: {
    type: String,
    required: true,
  },
  at: {
    type: Date,
    required: true,
  },
});

searchEventSchema.index({ key: 1, at: 1 });
searchEventSchema.index({ at: 1 }, { expireAfterSeconds: SEARCH_EVENT_TTL_SECONDS });

export const SearchEvent = mongoose.model("SearchEvent", searchEventSchema);
