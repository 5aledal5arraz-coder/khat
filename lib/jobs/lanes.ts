/**
 * Worker lanes — which claim loop may pick up which job type.
 *
 * WHY
 * ---
 * The worker used to run ONE claim loop, so a 30-minute Studio transcription
 * held the only slot and an operator's «تحويل لإعداد» sat `pending` behind it
 * for half an hour. Now the worker runs two loops, one slot each:
 *
 *   heavy        — long, batch-shaped work nobody is staring at: Studio
 *                  transcription / time-map / review (whisper over a 2h file),
 *                  model benchmarks, and the market-intelligence batches
 *                  (extract / score / cluster run 10–15 min over a backlog).
 *   interactive  — everything an operator clicked and is waiting on (prep,
 *                  season, candidate, conversation, original-thinking,
 *                  discovery) plus the light system ticks, which finish in
 *                  seconds and must not queue behind a transcription.
 *
 * Deliberately a closed HEAVY list with interactive as the default: a new job
 * type lands in the lane that keeps operators unblocked unless someone decides
 * it is heavy. Kept side-effect-free (no db import) so tests and the status
 * route can use it without pulling the queue in.
 */

export type WorkerLane = "heavy" | "interactive"

export const WORKER_LANES: readonly WorkerLane[] = ["heavy", "interactive"]

/** Any job type starting with one of these is heavy. */
export const HEAVY_TYPE_PREFIXES: readonly string[] = ["studio."]

/** Exact heavy job types outside the prefixes. */
export const HEAVY_TYPES: readonly string[] = [
  "model.benchmark",
  "market.collect",
  "market.extract",
  "market.score_signals",
  "market.cluster_signals",
]

export function laneForJobType(type: string): WorkerLane {
  if (HEAVY_TYPE_PREFIXES.some((p) => type.startsWith(p))) return "heavy"
  if (HEAVY_TYPES.includes(type)) return "heavy"
  return "interactive"
}
