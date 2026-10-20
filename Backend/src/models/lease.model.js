import mongoose from "mongoose";

// A lock with an expiry, shared by every server process through MongoDB (see utils/lease.js): the scheduler's
// leader lease, and one lease per provider refill in flight.
const leaseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    // The process that holds it (INSTANCE_ID).
    holder: {
      type: String,
      required: true,
    },
    // "running" while the work happens, "done" when a refill finished and others may reuse it.
    status: {
      type: String,
      default: "running",
    },
    // A holder that crashes frees the lease when this passes.
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

leaseSchema.index({ name: 1 }, { unique: true });
// Housekeeping only: expired leases are already free, whether or not this has deleted them yet.
leaseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 });

export const Lease = mongoose.model("Lease", leaseSchema);
