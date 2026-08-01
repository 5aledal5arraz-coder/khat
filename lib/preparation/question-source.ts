/**
 * "Does this preparation have questions?" — one definition, both sides.
 *
 * A preparation's questions can come from either generator:
 *   • `question_system`      — prep V1. No writer since prep_v2 shipped.
 *   • `prep_v2.question_bank` — where every question generated today lives.
 *
 * Splitting that answer between the UI and the generator is what produced the
 * bug this module exists to prevent: the cards panel gated its button on
 * `question_system` alone, which is NULL on every row in the database
 * (verified 2026-07-31), so it disabled generation on a preparation holding 28
 * questions and told the operator to go generate questions that were already
 * on screen.
 *
 * Deliberately dependency-free — no db, no drizzle, no AI router — so the
 * client cards panel can import it without pulling the server stack into the
 * browser bundle (the same mistake `push-button.tsx` documents for
 * `push-preview.ts`).
 */

import type { PrepV2Payload } from "./v2/types"
import type { PreparationQuestionSystem } from "@/types/preparation"

/** The two question-carrying fields, as much of them as any caller has. */
export interface QuestionSourceCarrier {
  question_system?: PreparationQuestionSystem | null
  prep_v2?: PrepV2Payload | null
}

/** True when cards can be generated from this preparation. */
export function hasCardQuestionSource(prep: QuestionSourceCarrier): boolean {
  if (prep.question_system?.sections?.length) return true
  return Boolean(prep.prep_v2?.question_bank?.length)
}

/** How many questions the preparation actually holds, across both sources. */
export function countPreparationQuestions(prep: QuestionSourceCarrier): number {
  const v1 = (prep.question_system?.sections ?? []).reduce(
    (n, s) => n + (s.questions?.length ?? 0),
    0,
  )
  if (v1 > 0) return v1
  return prep.prep_v2?.question_bank?.length ?? 0
}
