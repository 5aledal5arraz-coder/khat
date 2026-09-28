/**
 * Preparation V2 generation — shared job contract.
 *
 * `runPrepV2Pipeline` is five AI passes (~6 min, ~$2). It used to run INSIDE
 * the Server Action that triggered it (convert one topic, bulk convert, and
 * «إعادة توليد الإعداد»), behind nginx's 120s cut: the operator got a severed
 * connection while the server kept paying, a bulk convert of N topics took
 * N × 6 min in one request, and a double-click could start two runs. It now
 * runs in the worker as `prep.generate_v2`, deduped per preparation.
 *
 * SIDE-EFFECT-FREE (no db, no handler registration) so Server Actions and
 * pages can import the constants without dragging the pipeline's module graph
 * into their bundles. The handler (lib/jobs/handlers/prep-generate-v2.ts)
 * registers against the same constant.
 */

import type { PrepFormat } from "@/lib/preparation/v2/format"

export const PREP_GENERATE_V2_JOB = "prep.generate_v2"

/** One in-flight generation per preparation, whoever triggered it. */
export function prepV2DedupeKey(preparationId: string): string {
  return `prep_v2:${preparationId}`
}

export type PrepV2JobTrigger = "convert" | "regenerate" | "bulk"

export interface PrepV2JobPayload extends Record<string, unknown> {
  preparationId: string
  eirId: string | null
  language: "ar" | "en"
  /** Omitted ⇒ "story" (the pipeline's default). */
  format?: PrepFormat
  /** Course only — the operator's explicit length (already coerced). */
  targetMinutes?: number | null
  /** Force-run even if PREP_V2_ENABLED=false (regeneration is deliberate). */
  force: boolean
  trigger: PrepV2JobTrigger
  requestedBy: string | null
}

export interface PrepV2JobResult extends Record<string, unknown> {
  ok: boolean
  reason?: string
  /** Operator-facing Arabic when the work did not happen (room live, invalid prep, …). */
  messageAr?: string
  /** Operator-facing Arabic when it happened with a caveat. */
  warningAr?: string
  /** False when retrying cannot help until something else changes. */
  retryable?: boolean
  preparationId: string
  sections: number
  questions: number
  ai_run_ids: Record<string, unknown> | null
}
