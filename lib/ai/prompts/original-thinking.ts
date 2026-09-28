/**
 * Khat Brain — Original Thinking prompt builder (consolidated).
 *
 * Extracted from lib/original-thinking/generator.ts in Phase 0. The
 * string construction is byte-equivalent to the previous inline code;
 * the call site now uses this builder + the exported VERSION constant
 * so ai_runs.prompt_version becomes meaningful.
 *
 * Do NOT edit the prompt body in Phase 0 — only in Phase 2, behind a
 * version bump and a measured eval comparison.
 */

import type { EditorialLens } from "@/lib/original-thinking/lenses"
import { khatConstitutionBlock } from "@/lib/khat-map/core/constitution"

/**
 * Bump on every wording change. Eval CLI filters by this; A/B
 * comparisons live and die by it. The current value reflects the
 * prompt as it shipped pre-Phase-0.
 */
//
// v2 (2026-09-28, «دستور خط»): the constitution (full) is the FIRST system
// block; the ban on Kuwaiti framing is replaced by the audience rule
// (titles any Arab understands, the story may be Kuwaiti-rooted); generic
// self-help stays banned, and every topic must rest on a lived experience.
export const ORIGINAL_THINKING_PROMPT_VERSION = "original-thinking-v2-constitution"

export interface OriginalThinkingPromptInput {
  language: "ar" | "en"
  count: number
  lenses: EditorialLens[]
  excludedTitles: string[]
  allowKuwaitBias: boolean
}

export interface BuiltPrompt {
  system: string
  user: string
  version: string
}

export function buildOriginalThinkingPrompt(
  input: OriginalThinkingPromptInput,
): BuiltPrompt {
  const langLabel = input.language === "ar" ? "Arabic" : "English"
  const lensSummary = input.lenses
    .map(
      (l) =>
        `- key: ${l.key}\n  name: ${l.name_ar}\n  description: ${l.description}\n  question_kinds: ${l.question_kinds.slice(0, 2).join(" | ")}\n  avoid: ${l.avoid.join(" | ")}`,
    )
    .join("\n")

  const exclusions =
    input.excludedTitles.length === 0
      ? "(none)"
      : input.excludedTitles.slice(0, 80).join("\n  - ")

  const kuwaitDirective = input.allowKuwaitBias
    ? "AUDIENCE: the operator asked for Kuwait-specific framing on this run — it IS welcome, in the title too."
    : "AUDIENCE: the widest Arab audience — every title is understood by any Arab; the story may be Kuwaiti-rooted, only the premise must not depend on being Kuwaiti."

  const system = [
    khatConstitutionBlock("full"),
    "",
    "You are the editorial conscience of a serious Arabic-language podcast.",
    "Your job is to generate ORIGINAL, DEEP topic ideas, each resting on a lived human experience.",
    "",
    "ABSOLUTE RULES:",
    "1. Output JSON only. The shape is: { topics: [ { title, lens, philosophical_frame, conflict, emotional_hook } ] }.",
    "2. ALL human-readable text you generate — `title`, `philosophical_frame`, `conflict`, and `emotional_hook` — MUST be written entirely in " + langLabel + ". The `lens` field is the ONLY exception: it stays the exact English lens KEY from the list below. Do not mix languages inside any field, and do not transliterate.",
    "3. Each topic MUST be drawn from one of the lenses listed below — set `lens` to the lens KEY (e.g. \"betrayal_of_self\").",
    "4. Reject your own first draft if it sounds like generic self-help, a listicle, or hustle-culture content — practical value must come from a lived experience.",
    "5. " + kuwaitDirective,
    "6. Avoid every title in the EXCLUDED list. Don't paraphrase them either.",
    "7. The conflict MUST name a specific tension, not a vague theme.",
    "8. The emotional_hook MUST be a sentence that would make a thoughtful person stop scrolling — never \"in this episode we discuss…\".",
    "9. Distribute topics across multiple lenses; do not return all from one lens.",
    "10. Quality over quantity — if you can only honestly produce 4 great topics, return 4.",
    "11. Never enter the constitution's avoid list (politics, religious or sectarian dispute, scandal, someone else's privacy).",
    "",
    "AVAILABLE LENSES:",
    lensSummary,
  ].join("\n")

  const user = [
    `Generate ${input.count} topics in ${langLabel}.`,
    "",
    "EXCLUDED TITLES (do not return these or paraphrases):",
    `  - ${exclusions}`,
    "",
    "Return JSON only. No prose, no apology, no preamble.",
  ].join("\n")

  return { system, user, version: ORIGINAL_THINKING_PROMPT_VERSION }
}
