import { rateLimit } from "express-rate-limit";
import { MongoRateLimitStore } from "../utils/mongoRateLimitStore.js";

const FLOOD_WINDOW_MS = 60 * 1000;
const FLOOD_MAX_REQUESTS_PER_WINDOW = 120;

// RATE_LIMIT_STORE=mongo shares the counts between API instances (the Docker Compose demo). Unset, they live in
// this process's memory, which is enough for one instance (Render).
const createFloodLimiter = () =>
  rateLimit({
    windowMs: FLOOD_WINDOW_MS,
    limit: FLOOD_MAX_REQUESTS_PER_WINDOW,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...(process.env.RATE_LIMIT_STORE === "mongo" && { store: new MongoRateLimitStore() }),
    // A database hiccup must not take the whole API down with it.
    passOnStoreError: true,
    // It is created once, on the first request (see floodLimiter below), not once per request as this check fears.
    validate: { creationStack: false },
    handler: (req, res, next, options) => {
      res.status(options.statusCode).json({
        success: false,
        message: "Too many requests. Please wait a minute and try again.",
      });
    },
  });

let floodLimiterInstance = null;

// Per-IP flood limit for every /api/v1 route (IPv6 counts per /56 network). Created on the first request, so the
// store choice is read after the env is loaded.
export const floodLimiter = (req, res, next) => {
  floodLimiterInstance ??= createFloodLimiter();
  return floodLimiterInstance(req, res, next);
};
