/**
 * Original-thinking topic generation — shared job contract.
 *
 * The handler (`original.generate_topics`, lib/jobs/handlers/original-thinking.ts)
 * existed long before the button used it: «إنشاء ١٠ مواضيع جديدة» ran the same
 * generator inline in its Server Action. The button now enqueues this job.
 *
 * SIDE-EFFECT-FREE — importable from Server Actions without the generator.
 */

export const ORIGINAL_GENERATE_TOPICS_JOB = "original.generate_topics"

/** One in-flight generation per language from the button. */
export function originalTopicsDedupeKey(language: "ar" | "en"): string {
  return `original_topics:${language}`
}

export interface OriginalTopicsJobResult extends Record<string, unknown> {
  /** False when the generator produced nothing usable — the status card shows `messageAr`. */
  ok: boolean
  asked: number
  accepted: number
  rejected: number
  ai_run_id: string | null
  expired_swept: number
  messageAr: string
  /** First few rejections with their reason codes (labelled in Arabic by the UI). */
  rejection_reasons: Array<{ title: string; reasons: string[] }>
}
