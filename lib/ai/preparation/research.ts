/**
 * Episode Preparation — Research engine (public entry).
 *
 * Thin wrapper around the multi-step pipeline in `./research/pipeline.ts`.
 * The pipeline is responsible for:
 *
 *   1) Query generation
 *   2) Multi-source retrieval via Gemini grounded search + YouTube Data API
 *      (+ X as a pluggable future provider)
 *   3) Normalization + dedupe
 *   4) Structured synthesis with source citations
 *   5) Verifier pass (verified | weak | unverified)
 *   6) Dropping unverified claims entirely
 *
 * The output corpus is stored verbatim in `episode_preparations.research_data`
 * and consumed by every downstream section generator so the whole
 * preparation package is grounded in the same verified research.
 */

import type { PreparationInputs, PreparationResearch } from "@/types/preparation"
import { isGeminiConfigured } from "./research/gemini"
import { runResearchPipeline } from "./research/pipeline"

export async function runPreparationResearch(
  inputs: PreparationInputs,
): Promise<PreparationResearch> {
  // Blocking precondition — we refuse to run a silent fallback.
  if (!isGeminiConfigured()) {
    throw new Error(
      "Gemini API is not configured. Please provide GEMINI_API_KEY to enable full research capabilities.",
    )
  }

  const result = await runResearchPipeline(inputs)

  const hasAnySource = result.sources.length > 0
  const hasClaims = result.claims.length > 0

  const notes: string[] = []
  if (!hasAnySource) {
    notes.push(
      "لم يتم العثور على أي مصادر خارجية. جميع المصادر فارغة — أعد المحاولة أو راجع إعدادات البحث.",
    )
  } else if (!hasClaims) {
    notes.push(
      "تم جلب مصادر لكن المُدقق رفض جميع الادعاءات. راجع المصادر يدوياً قبل الاعتماد على الملخص.",
    )
  }
  const xDiag = result.retrieval.find((r) => r.provider === "x")
  if (xDiag && (xDiag.status === "unavailable" || xDiag.status === "skipped")) {
    notes.push(xDiag.message ?? "مصادر X/Twitter غير متاحة.")
  }
  if (result.weak_count > 0) {
    notes.push(
      `${result.weak_count} ادعاء مصنّف كضعيف — يجب التعامل معه بحذر وعدم تقديمه كحقيقة ثابتة.`,
    )
  }
  if (result.unverified_count > 0) {
    notes.push(
      `${result.unverified_count} ادعاء تم حذفه بالكامل لعدم وجود دعم كافٍ في المصادر.`,
    )
  }

  const research: PreparationResearch = {
    generated_at: new Date().toISOString(),
    query: [inputs.guest_name, inputs.title].filter(Boolean).join(" — ") || "بحث عام",
    queries_used: result.queries_used,
    sources: result.sources,
    retrieval: result.retrieval,
    claims: result.claims,
    quotes: result.quotes,
    past_interviews: result.past_interviews,
    verified_count: result.verified_count,
    weak_count: result.weak_count,
    unverified_count: result.unverified_count,
    notes: notes.length > 0 ? notes.join(" ") : undefined,
  }

  return research
}
