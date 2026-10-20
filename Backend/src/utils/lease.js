import crypto from "node:crypto";
import os from "node:os";
import { Lease } from "../models/lease.model.js";

// This process, as a lease holder. Several API containers (or an API and a worker) each have their own.
export const INSTANCE_ID = `${os.hostname()}:${process.pid}:${crypto.randomBytes(3).toString("hex")}`;

/**
 * Takes the lease `name` for `ttlMs` when it is free or expired, or renews it when this holder already has it
 * (`renewable`). Atomic: when someone else holds it, the filter doesn't match, the upsert runs into the unique
 * index on `name`, and the answer is false.
 */
export const acquireLease = async (name, { ttlMs, holder = INSTANCE_ID, renewable = true, status = "running" }) => {
  const now = new Date();
  const free = { expiresAt: { $lte: now } };

  try {
    const lease = await Lease.findOneAndUpdate(
      { name, ...(renewable ? { $or: [free, { holder }] } : free) },
      { $set: { holder, status, expiresAt: new Date(now.getTime() + ttlMs) } },
      { upsert: true, new: true }
    ).lean();

    return Boolean(lease);
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
};

// Changes a lease this holder has (its status, or how long it lasts).
export const updateLease = (name, fields, holder = INSTANCE_ID) => Lease.updateOne({ name, holder }, { $set: fields });

export const releaseLease = (name, holder = INSTANCE_ID) => Lease.deleteOne({ name, holder });

// The lease as it stands, or null when it is free (missing or expired).
export const readLiveLease = async name => {
  const lease = await Lease.findOne({ name }).lean();
  return lease && lease.expiresAt > new Date() ? lease : null;
};
