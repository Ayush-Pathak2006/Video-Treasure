import { runNicheCrawlerTick } from "./nicheCrawler.service.js";
import { runVideoRefreshTick } from "./videoRefresh.service.js";
import { runTrendCrawlerTick } from "./trendCrawler.service.js";
import { acquireLease, INSTANCE_ID } from "../utils/lease.js";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

// The first ticks wait a little after a start, so a crash loop or a deploy doesn't pile work on the boot.
const FIRST_TICK_DELAY_MS = MINUTE_MS;

// Only the process holding this lease runs the jobs: one worker of several, or the old instance (not the new one)
// while a deploy overlaps them. It renews every 20 s; if the holder dies, another takes over within a minute.
const LEADER_LEASE = "scheduler-leader";
const LEADER_LEASE_MS = MINUTE_MS;
const LEADER_RENEW_MS = 20 * SECOND_MS;

// In-process jobs. Each tick decides from MongoDB whether anything is due (CrawlerState, a video's fetchedAt), so
// restarts and deploys neither repeat work nor lose their place.
const JOBS = [
  { name: "nicheCrawler", everyMs: 10 * MINUTE_MS, run: runNicheCrawlerTick },
  { name: "videoRefresh", everyMs: 10 * MINUTE_MS, run: runVideoRefreshTick },
  { name: "trendCrawler", everyMs: 5 * MINUTE_MS, run: runTrendCrawlerTick },
];

let started = false;
let isLeader = false;

export const isSchedulerLeader = () => isLeader;

const renewLeadership = async () => {
  const wasLeader = isLeader;

  try {
    isLeader = await acquireLease(LEADER_LEASE, { ttlMs: LEADER_LEASE_MS });
  } catch (error) {
    isLeader = false;
    console.error(`❌ [scheduler] could not renew the leader lease: ${error.message}`);
  }

  if (isLeader !== wasLeader) {
    console.log(isLeader ? `👑 [scheduler] ${INSTANCE_ID} is the leader and runs the jobs.` : `💤 [scheduler] ${INSTANCE_ID} is on standby.`);
  }
};

export const startScheduler = async () => {
  if (started) return;
  started = true;

  await renewLeadership();
  if (!isLeader) console.log(`💤 [scheduler] ${INSTANCE_ID} is on standby: another process holds the leader lease.`);
  setInterval(renewLeadership, LEADER_RENEW_MS);

  for (const job of JOBS) {
    let running = false;

    // Only the leader runs a tick, and a tick that is still running when the next one is due isn't doubled up.
    const tick = async () => {
      if (running || !isLeader) return;
      running = true;

      try {
        await job.run();
      } catch (error) {
        console.error(`❌ [scheduler:${job.name}] tick failed: ${error.message}`);
      } finally {
        running = false;
      }
    };

    setTimeout(tick, FIRST_TICK_DELAY_MS);
    setInterval(tick, job.everyMs);
  }

  console.log(`🕐 Scheduler started: ${JOBS.map(job => `${job.name} every ${job.everyMs / MINUTE_MS} min`).join(", ")}.`);
};
