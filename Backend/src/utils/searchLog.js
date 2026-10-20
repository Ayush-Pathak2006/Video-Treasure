import crypto from "node:crypto";
import { ipKeyGenerator } from "express-rate-limit";
import { SearchEvent } from "../models/searchEvent.model.js";

const MINUTE_MS = 60 * 1000;
const SPIKE_WINDOW_MS = 30 * MINUTE_MS;
// The log keeps 7 days, which is the history a key's usual rate is measured over.
const BASELINE_PERIOD_MS = 7 * 24 * 60 * MINUTE_MS;
const MIN_SPIKE_VISITORS = 5;
const SPIKE_FACTOR = 3;

// A keyed hash: a plain SHA-256 of an IPv4 address can be reversed by trying all 4 billion addresses.
const getHashSecret = () => process.env.VISITOR_HASH_SECRET || process.env.ACCESS_TOKEN_SECRET || "video-treasure";

// The visitor's IP (an IPv6 address as its /56 network, like the spend meters) as a keyed hash.
export const hashVisitor = ip =>
  crypto.createHmac("sha256", getHashSecret()).update(ipKeyGenerator(ip || "unknown")).digest("hex").slice(0, 32);

// Records a first-page search. Callers don't wait for it: the log must never slow a search down.
export const recordSearchEvent = ({ key, ip, at = new Date() }) =>
  SearchEvent.create({ key, visitorHash: hashVisitor(ip), at }).catch(error =>
    console.error(`❌ [search-log] could not record a search: ${error.message}`)
  );

/**
 * Search keys with a spike: distinct visitors in the last 30 minutes ≥ max(5, 3 × the key's usual rate), where
 * the usual rate is the average number of distinct visitors per 30 minutes over the past week. Counting distinct
 * visitors means one IP repeating a search can't make a trend. Biggest spike first.
 */
export const findSpikingKeys = async (now = new Date()) => {
  const windowStart = new Date(now.getTime() - SPIKE_WINDOW_MS);

  const recent = await SearchEvent.aggregate([
    { $match: { at: { $gte: windowStart, $lte: now } } },
    { $group: { _id: { key: "$key", visitor: "$visitorHash" } } },
    { $group: { _id: "$_id.key", visitors: { $sum: 1 } } },
    { $match: { visitors: { $gte: MIN_SPIKE_VISITORS } } },
  ]);

  if (!recent.length) return [];

  // Distinct (visitor, 30-minute window) pairs before the current window, per key.
  const history = await SearchEvent.aggregate([
    {
      $match: {
        key: { $in: recent.map(entry => entry._id) },
        at: { $gte: new Date(now.getTime() - BASELINE_PERIOD_MS), $lt: windowStart },
      },
    },
    {
      $group: {
        _id: { key: "$key", visitor: "$visitorHash", window: { $floor: { $divide: [{ $toLong: "$at" }, SPIKE_WINDOW_MS] } } },
      },
    },
    { $group: { _id: "$_id.key", visitorWindows: { $sum: 1 } } },
  ]);

  const windowsInBaseline = (BASELINE_PERIOD_MS - SPIKE_WINDOW_MS) / SPIKE_WINDOW_MS;
  const usualByKey = new Map(history.map(entry => [entry._id, entry.visitorWindows / windowsInBaseline]));

  return recent
    .filter(entry => entry.visitors >= Math.max(MIN_SPIKE_VISITORS, SPIKE_FACTOR * (usualByKey.get(entry._id) ?? 0)))
    .sort((a, b) => b.visitors - a.visitors)
    .map(entry => ({ key: entry._id, visitors: entry.visitors }));
};
