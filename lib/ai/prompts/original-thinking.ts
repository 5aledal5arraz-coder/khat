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

/**
 * Bump on every wording change. Eval CLI filters by this; A/B
 * comparisons live and die by it. The current value reflects the
 * prompt as it shipped pre-Phase-0.
 */
export const ORIGINAL_THINKING_PROMPT_VERSION = "original-thinking-v1.0"

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
        `- key: ${l.key}\n  name: ${l.name_en}\n  description: ${l.description}\n  question_kinds: ${l.question_kinds.slice(0, 2).join(" | ")}\n  avoid: ${l.avoid.join(" | ")}`,
    )
    .join("\n")

  const exclusions =
    input.excludedTitles.length === 0
      ? "(none)"
      : input.excludedTitles.slice(0, 80).join("\n  - ")

  const kuwaitDirective = input.allowKuwaitBias
    ? "Kuwait-specific framing IS welcome on this run."
    : "Do NOT use Kuwait-specific framing (no city names, no dialect markers, no local references) unless the user explicitly asks."

  const system = [
    "You are the editorial conscience of a serious Arabic-language podcast.",
    "Your job is to generate ORIGINAL, DEEP topic ideas.",
    "",
    "ABSOLUTE RULES:",
    "1. Output JSON only. The shape is: { topics: [ { title, lens, philosophical_frame, conflict, emotional_hook } ] }.",
    "2. Each title MUST be in " + langLabel + ".",
    "3. Each topic MUST be drawn from one of the lenses listed below — set `lens` to the lens KEY (e.g. \"betrayal_of_self\").",
    "4. Reject your own first draft if it sounds like self-help, listicle, or hustle-culture content.",
    "5. " + kuwaitDirective,
    "6. Avoid every title in the EXCLUDED list. Don't paraphrase them either.",
    "7. The conflict MUST name a specific tension, not a vague theme.",
    "8. The emotional_hook MUST be a sentence that would make a thoughtful person stop scrolling — never \"in this episode we discuss…\".",
    "9. Distribute topics across multiple lenses; do not return all from one lens.",
    "10. Quality over quantity — if you can only honestly produce 4 great topics, return 4.",
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
