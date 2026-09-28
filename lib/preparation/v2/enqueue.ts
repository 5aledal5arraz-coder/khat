/**
 * Enqueue a Preparation V2 generation (`prep.generate_v2`) — the ONLY way the
 * request path starts one. Returns in milliseconds; the five AI passes run in
 * the worker (lib/jobs/handlers/prep-generate-v2.ts).
 *
 * Deduped per preparation (`prep_v2:<id>`): a double-click, a second tab, or a
 * convert racing a regenerate attach to the run already in flight.
 * max_attempts 1 — the router already retries each AI call; retrying the whole
 * five-pass pipeline would only pay twice for the same failure.
 */

import { enqueueJobOnce, type EnqueueOnceResult } from "@/lib/jobs/queue"
import {
  PREP_GENERATE_V2_JOB,
  prepV2DedupeKey,
  type PrepV2JobPayload,
} from "@/lib/jobs/prep-jobs"

export async function enqueuePrepV2Generation(
  payload: PrepV2JobPayload,
): Promise<EnqueueOnceResult> {
  return enqueueJobOnce(PREP_GENERATE_V2_JOB, payload, {
    dedupeKey: prepV2DedupeKey(payload.preparationId),
    maxAttempts: 1,
    // An operator is waiting on this one; let it jump scheduled maintenance.
    priority: 10,
  })
}
