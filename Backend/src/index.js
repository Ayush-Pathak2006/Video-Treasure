import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from './app.js';
import { startScheduler } from "./services/scheduler.service.js";


dotenv.config({
    path: './.env'
});


// One process does everything unless RUN_JOBS_IN_API=false: then src/worker.js runs the jobs and the startup
// migrations, and this process (one of several API instances) only serves the API.
const runJobsInApi = () => process.env.RUN_JOBS_IN_API !== "false";

connectDB({ runMigrations: runJobsInApi() })
.then(() => {
    app.listen(process.env.PORT || 8000, () => {
        console.log(`✅ Server is running at port : ${process.env.PORT}`);
        if (runJobsInApi()) startScheduler();
    });
})
.catch((err) => {
    console.log("MONGO db connection failed !!! ", err);
});