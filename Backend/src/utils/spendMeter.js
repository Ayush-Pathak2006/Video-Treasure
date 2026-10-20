import { ipKeyGenerator } from "express-rate-limit";
import { SpendMeter } from "../models/spendMeter.model.js";
import { getNextResetTime, getQuotaDay } from "./quotaTracker.js";

const MINUTE_MS = 60 * 1000;

// Starting limits per visitor. Tune them after watching real traffic. Only real YouTube API calls take a
// token: cache hits, scrolling through cached videos and Dailymotion are free.
// capacity: tokens when full. refillMs: one token comes back after this long. dailyMax: tokens per day, or null.
export const SPEND_LIMITS = {
  anonymous: {
    newSearch: { capacity: 3, refillMs: 20 * MINUTE_MS, dailyMax: 10 },
    scrollRefill: { capacity: 2, refillMs: 30 * MINUTE_MS, dailyMax: null },
  },
  user: {
    newSearch: { capacity: 10, refillMs: 6 * MINUTE_MS, dailyMax: 25 },
    scrollRefill: { capacity: 6, refillMs: 10 * MINUTE_MS, dailyMax: null },
  },
};

const MAX_UPDATE_ATTEMPTS = 5;

/**
 * Who pays for a request's YouTube calls. Anonymous visitors are counted per IP; an IPv6 address counts as its
 * /56 network, because one connection can switch between many addresses inside it.
 */
export const buildSpender = ({ user, ip, cursor }) => ({
  identity: user ? `user:${user._id}` : `ip:${ipKeyGenerator(ip || "unknown")}`,
  viewer: user ? "user" : "anonymous",
  meter: cursor ? "scrollRefill" : "newSearch",
});

// Whole tokens earned since refilledAt, up to capacity. A full meter doesn't bank time: its next token starts
// counting when one is spent.
const refill = (current, limits, now) => {
  if (!current) {
    return { tokens: limits.capacity, refilledAt: now };
  }

  const earned = Math.max(0, Math.floor((now - current.refilledAt) / limits.refillMs));
  const tokens = Math.min(limits.capacity, current.tokens + earned);
  const refilledAt = tokens >= limits.capacity ? now : new Date(current.refilledAt.getTime() + earned * limits.refillMs);

  return { tokens, refilledAt };
};

/**
 * Takes one token right before a YouTube call. Returns { ok: true } or { ok: false, retryAt }.
 * The refill math doesn't fit one $inc, so the meter is read, recalculated and written back only if nobody
 * changed it in between, retrying if they did.
 */
export const takeSpendToken = async ({ identity, meter, viewer }) => {
  const limits = SPEND_LIMITS[viewer][meter];

  for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
    const now = new Date();
    const day = getQuotaDay(now);
    const current = await SpendMeter.findOne({ identity, meter }).lean();
    const { tokens, refilledAt } = refill(current, limits, now);
    const usedToday = current?.day === day ? current.usedToday : 0;

    if (limits.dailyMax !== null && usedToday >= limits.dailyMax) {
      return { ok: false, retryAt: getNextResetTime(now) };
    }

    if (tokens < 1) {
      return { ok: false, retryAt: new Date(refilledAt.getTime() + limits.refillMs) };
    }

    const next = { tokens: tokens - 1, refilledAt, day, usedToday: usedToday + 1 };

    if (!current) {
      try {
        await SpendMeter.create({ identity, meter, ...next });
        return { ok: true, retryAt: null };
      } catch (error) {
        // A parallel request created it first: read it again.
        if (error.code === 11000) continue;
        throw error;
      }
    }

    const { modifiedCount } = await SpendMeter.updateOne(
      { _id: current._id, tokens: current.tokens, refilledAt: current.refilledAt, day: current.day, usedToday: current.usedToday },
      { $set: next }
    );

    if (modifiedCount === 1) {
      return { ok: true, retryAt: null };
    }
  }

  // Still contended after several attempts: one visitor firing many parallel requests.
  return { ok: false, retryAt: new Date(Date.now() + MINUTE_MS) };
};

// Gives the token back when the daily quota was used up, so the call brought the visitor nothing.
export const refundSpendToken = async ({ identity, meter }) => {
  await SpendMeter.updateOne({ identity, meter, usedToday: { $gt: 0 } }, { $inc: { tokens: 1, usedToday: -1 } });
};
