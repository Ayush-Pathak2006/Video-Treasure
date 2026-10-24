import mongoose from "mongoose";
import { ensureQueryStateIndexes } from "../utils/queryStateIndexes.js";
import { ensureVideoIndexes } from "../utils/videoIndexes.js";
import { ensureSearchRanks } from "../utils/searchRanks.js";
import { QuotaUsage } from "../models/quotaUsage.model.js";
import { SpendMeter } from "../models/spendMeter.model.js";
import { CrawlerState } from "../models/crawlerState.model.js";
import { Lease } from "../models/lease.model.js";
import { CommentLike } from "../models/commentLike.model.js";
import { WatchHistory } from "../models/watchHistory.model.js";

// `runMigrations`: the startup migrations (index fixes, rank backfill) run in one process only: the worker, or the
// API when it also runs the jobs (RUN_JOBS_IN_API). Extra API instances just connect.
const connectDB = async ({ runMigrations = true } = {}) => {
  try {
    // console.log("Attempting to connect with MONGODB_URI:", process.env.MONGODB_URI);

    const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}`);

    if (runMigrations) {
      await ensureQueryStateIndexes();
      await ensureVideoIndexes();
      await ensureSearchRanks();
    }

    // The quota ledger, the spend meters, the job slots, the leases, the comment likes and the watch history need their
    // unique indexes for atomic updates, so build them before serving.
    await Promise.all([
      QuotaUsage.init(),
      SpendMeter.init(),
      CrawlerState.init(),
      Lease.init(),
      CommentLike.init(),
      WatchHistory.init(),
    ]);
    console.log(`\n✅ MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`);
  } catch (error) {
    console.log("MONGODB connection FAILED ", error);
    process.exit(1);
  }
};

export default connectDB;