/**
 * Khat Brain — job runtime public surface.
 */

export {
  enqueueJob,
  enqueueJobOnce,
  findInFlightJobByDedupeKey,
  findAttachableJobByDedupeKey,
  listAttachableJobsByDedupePrefix,
  getJob,
  findInFlightJobByPayload,
  listJobs,
  claimNextJob,
  completeJob,
  failJob,
  reclaimStaleJobs,
  renewJobLease,
  reportJobProgress,
} from "./queue"

export { createProgressReporter, type ProgressReporter } from "./progress-reporter"

export {
  registerHandler,
  getHandler,
  listRegisteredTypes,
} from "./registry"

export type {
  JobHandler,
  JobContext,
  EnqueueOptions,
  JobRow,
  JobStatus,
} from "./types"
