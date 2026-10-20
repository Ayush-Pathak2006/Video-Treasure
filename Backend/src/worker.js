import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { startScheduler } from "./services/scheduler.service.js";

dotenv.config({
    path: './.env'
});

// The background process: the startup migrations and the scheduled jobs (niche crawler, 30-day refresh, trend
// crawler), apart from the API instances (started with RUN_JOBS_IN_API=false). Several workers may run: only the
// one holding the scheduler's leader lease runs the jobs.
connectDB({ runMigrations: true })
.then(() => {
    console.log("✅ Worker connected.");
    return startScheduler();
})
.catch((err) => {
    console.log("Worker failed to start !!! ", err);
    process.exit(1);
});
