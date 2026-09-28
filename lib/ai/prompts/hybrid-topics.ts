/**
 * Khat Brain — Hybrid Topic prompt builder (consolidated).
 *
 * Extracted from lib/hybrid-topics/generate.ts in Phase 0. The string
 * construction is byte-equivalent to the previous inline code; the
 * call site now uses this builder + the exported VERSION constant so
 * ai_runs.prompt_version becomes meaningful.
 *
 * Do NOT edit the prompt body in Phase 0 — only in Phase 2, behind a
 * version bump and a measured eval comparison.
 */

import { HYBRID_INPUT_CAPS } from "@/lib/hybrid-topics/inputs"
import type { EditorialLens } from "@/lib/original-thinking/lenses"
import type { TopClusterSummary } from "@/lib/market-intelligence/queries"
import type { WorkedReport } from "@/lib/khat-brain/performance-learning"
import {
  ARCHETYPE_FIELD_SPEC,
  buildArchetypesBlock,
  buildOriginalityBlock,
  buildBannedShapesBlock,
  buildBoldnessDialBlock,
  buildResonanceEngineBlock,
} from "@/lib/khat-map/v2/creative-brief"
import {
  renderExplorationBlock,
  type ExplorationFrame,
} from "@/lib/khat-map/v2/exploration"
import { khatConstitutionBlock } from "@/lib/khat-map/core/constitution"
import { SENSITIVITY_FLAGS_SPEC } from "@/lib/khat-map/core/policy"
import { KHAT_TOPIC_SCORE_KEYS } from "@/lib/hybrid-topics/scoring"

// v3 = exploration frames: the harness assigns each slot a (territory ×
// archetype) sampled from the Knowledge Universe + corpus white-space, without
// replacement across a season's batches. Market clusters + the introspective
// lens registry become optional garnish instead of a mandatory funnel — the
// funnel (12 pain-lenses × the same frozen top clusters) was why every batch
// collapsed to the same success/family/AI-anxiety themes.
//
// v3.1 (2026-09-28): `invasion` is glossed as the 1990 Iraqi invasion of
// Kuwait ONLY. Unglossed, the model read it as any "invasion" (of money,
// tech, culture) — and to-preparation turns the type into content_focus.
// Wording change only; the audience policy (kuwaitDirective) is untouched.
//
// v4 (2026-09-28, «دستور خط»): the constitution (full) is the FIRST system
// block. The pan-Arab ban on Kuwaiti framing is replaced by the audience rule
// (titles any Arab understands; the story may be Kuwaiti-rooted). Market
// clusters are a weak prior (≤ 15% of the batch, labels only — no hooks, no
// view counts). The view-driven performance block is gone. The model self-
// scores the constitution's six dimensions (they only ORDER the list) and
// declares sensitivity_flags (any flag → rejected). Exploration slots now
// carry field × segment × concern. mass_audience is no longer offered.
export const HYBRID_TOPICS_PROMPT_VERSION = "hybrid-topics-v4-constitution"

/**
 * At most this share of a batch may draw from a market cluster (the rest
 * set market_inspiration "none"). Never below one topic when clusters exist.
 */
export const HYBRID_MARKET_MAX_SHARE = 0.15

export function hybridMarketCap(count: number): number {
  return Math.max(1, Math.floor(count * HYBRID_MARKET_MAX_SHARE))
}

export interface HybridPromptInput {
  language: "ar" | "en"
  count: number
  allowKuwaitBias: boolean
  originalTopics: Array<{
    id: string
    title: string
    lens: string
    conflict: string
    emotional_hook: string
  }>
  marketClusters: TopClusterSummary[]
  workedReport: WorkedReport
  tasteHints: Array<{ dimension: string; key: string; weight: number }>
  excludedTitles: string[]
  lenses: EditorialLens[]
  /**
   * Per-slot (territory × archetype) assignments sampled by the harness. When
   * present, these — not the model's own habits — decide where each topic lives.
   */
  explorationFrames?: ExplorationFrame[]
}

export interface BuiltHybridPrompt {
  system: string
  user: string
  version: string
}

export function buildHybridTopicsPrompt(
  input: HybridPromptInput,
): BuiltHybridPrompt {
  const langLabel = input.language === "ar" ? "Arabic" : "English"

  const lensSummaries =
    input.originalTopics.length === 0
      ? "(no fresh originals — degrade to lens names only via the registry)"
      : input.originalTopics
          .map(
            (o) =>
              `- id: ${o.id}\n  title: ${o.title}\n  lens: ${o.lens}\n  conflict: ${o.conflict.slice(0, 200)}\n  hook: ${o.emotional_hook.slice(0, 200)}`,
          )
          .join("\n")

  // Constitution: clusters are a WEAK PRIOR — labels only. No hook samples,
  // no view counts: those turned market data into the raw material of the
  // batch, which is exactly what "not views-optimised" rules out.
  const marketCap = hybridMarketCap(input.count)
  const clusterSummaries =
    input.marketClusters.length > 0
      ? input.marketClusters
          .slice(0, HYBRID_INPUT_CAPS.market_clusters)
          .map((c) => `- ${c.label} (${c.language})`)
          .join("\n")
      : "(none — every topic sets market_inspiration and primary_theme to \"none\")"

  const tasteHintBlock = (() => {
    if (input.tasteHints.length === 0) return "(no learned preferences yet)"
    const lines = input.tasteHints.map((h) => {
      const direction = h.weight >= 0 ? "favour" : "avoid"
      return `- ${direction} ${h.dimension}: ${h.key} (weight=${h.weight.toFixed(2)})`
    })
    return lines.join("\n")
  })()

  // The worked-report (views per domain) is no longer rendered: Khat is not
  // views-optimised. It still gates readiness in generate.ts.

  const exclusions =
    input.excludedTitles.length === 0
      ? "(none)"
      : input.excludedTitles
          .slice(0, HYBRID_INPUT_CAPS.exclusion_titles)
          .join("\n  - ")

  // The audience rule (constitution): pan-Arab TOPICS, a story that may be
  // Kuwaiti-rooted. It replaced a ban on any Kuwaiti reference, which
  // contradicted Kuwaiti guests by default.
  const kuwaitDirective = input.allowKuwaitBias
    ? "AUDIENCE: the operator asked for Kuwait-specific framing on this run — it IS welcome, in the title too."
    : "AUDIENCE: the widest Arab audience — every title is understood by any Arab. The story and the guest may be Kuwaiti-rooted (a Kuwaiti setting inside the story is welcome); only the premise must not depend on being Kuwaiti."

  const lensRegistry = input.lenses
    .map((l) => `${l.key}: ${l.name_en} — ${l.description}`)
    .join("\n")

  const system = [
    khatConstitutionBlock("full"),
    "",
    "You are the Hybrid Topic Generator for the Arabic-language Khat Podcast.",
    "Your job: propose diverse, original episodes, each resting on a moving human",
    "experience a real person lived, following the exploration map and the constitution",
    "above. Market clusters, when listed, are a WEAK prior only — a hint about what people",
    "live with, never raw material to transform.",
    "",
    // Shared creative doctrine — identical to the editorial batch engine.
    buildOriginalityBlock(),
    "",
    buildBannedShapesBlock(),
    "",
    buildArchetypesBlock(),
    "",
    buildBoldnessDialBlock(),
    "",
    buildResonanceEngineBlock(),
    "",
    ...(input.explorationFrames && input.explorationFrames.length > 0
      ? [renderExplorationBlock(input.explorationFrames), ""]
      : []),
    "ABSOLUTE RULES",
    "1. Output JSON only. Shape: { topics: [ {",
    "     title, archetype, novelty_note, why_it_matters, why_now, emotional_hook,",
    "     conflict_angle, market_inspiration, primary_theme, original_lens,",
    "     suggested_episode_type, suggested_topic_domain,",
    `     scores: { ${KHAT_TOPIC_SCORE_KEYS.join(", ")} }, sensitivity_flags`,
    "   } ] }.",
    `2. ALL reader-facing text — title, emotional_hook, conflict_angle, why_it_matters, why_now, novelty_note — MUST be written in ${langLabel}. Never write the hook or notes in English when the target is Arabic.`,
    "3. Every topic MUST set:",
    '   - original_lens: a registry KEY below IF one genuinely sharpens the topic, else "none". Do NOT force an introspective lens onto a topic that is not about inner life — a history, science, or hidden-world episode is allowed to just be itself.',
    `   - market_inspiration: "none" by default. At most ${marketCap} topic(s) in this batch may instead name the ONE market cluster that hinted at it.`,
    "   - primary_theme: copy VERBATIM the label of that market cluster (from the MARKET CLUSTERS list below), or \"none\".",
    "   - suggested_episode_type drawn from: intellectual, social, psychological, personal_story, national, historical, economic, controversial, inspirational, signature_khat, invasion. `invasion` means the 1990 Iraqi invasion of Kuwait ONLY — never a figurative \"invasion\" (of technology, money, culture, ideas); use another type for those.",
    "   - suggested_topic_domain drawn from: philosophy, psychology, relationships, religion, identity_masculinity, money_career, technology_ai, internet_culture, crime_mystery, hidden_history, power_manipulation, parenting, kuwait_gulf, historical, social_issues, modern_society, emotions_inner_life, none. (religion = faith as a personal experience ONLY.)",
    "4. NEVER copy a market title. Transform it. The relationship between market_inspiration and title must NOT be a paraphrase.",
    "5. Reject your own first draft if it sounds like self-help, listicle, hustle-culture, or any BANNED shape above. No \"how to,\" no \"5 secrets,\" no \"unlock your,\" no \"الخليج + macro trend\" panels.",
    "6. " + kuwaitDirective,
    "7. The conflict_angle MUST name a specific tension, not a vague theme.",
    "8. The emotional_hook MUST be a sentence that would make a thoughtful person stop scrolling — never \"in this episode we explore.\"",
    "9. scores: rate each 0-10 honestly — worth_telling (is this experience worth telling? the criterion), human_experience (rests on something a real person lived), practical_value (a takeaway grounded in that experience, not generic advice), segment_fit (a real concern of the slot's audience segment), library_value (would someone come back in five years and benefit?), guest_findability (a Kuwaiti man with a first-hand account plausibly exists and is reachable). They only ORDER the list.",
    '10. Distribute across multiple lenses (no single lens > 40% of the batch; "none" is always allowed and exempt).',
    "11. Aim to return the full requested count. Drop a topic ONLY if it would duplicate the EXCLUDED list or violate rules 1–13. Reaching for a slightly weaker but still honest angle is preferred over silently under-delivering.",
    `12. Every topic MUST set an \`archetype\` (${ARCHETYPE_FIELD_SPEC}) and a one-line \`novelty_note\` (why this angle is fresh, not the done-to-death version). The batch MUST span at least 4 different archetypes — stacking one shape (e.g. all big_idea panels) is a failed batch.`,
    `13. ${SENSITIVITY_FLAGS_SPEC}`,
    "",
    "EDITORIAL LENS REGISTRY (always available):",
    lensRegistry,
  ].join("\n")

  const framesDirective =
    input.explorationFrames && input.explorationFrames.length > 0
      ? ` Follow the exploration map: ONE topic per slot, honoring each slot's field, audience segment + concern, territory and archetype. A slot assignment NEVER excuses a missing schema field — every topic still needs a valid suggested_episode_type, suggested_topic_domain, scores, sensitivity_flags and a scroll-stopping emotional_hook.`
      : ""

  const user = [
    `Generate ${input.count} hybrid topics in ${langLabel}.${framesDirective} The button the operator pressed promises ${input.count} candidates — returning fewer than ${input.count} silently breaks that contract. Only fall short if the EXCLUDED list and rules 1–13 truly leave you no room.`,
    "",
    "FRESH ORIGINAL TOPICS (you may transform any of these — when you do, set original_lens to that topic's lens):",
    input.originalTopics.length === 0 ? "(none)" : lensSummaries,
    "",
    `MARKET CLUSTERS (a weak prior — at most ${marketCap} topic(s) may draw from one; never copy a label into a title):`,
    clusterSummaries,
    "",
    "EDITORIAL TASTE HINTS (soft — operator's learned preferences;",
    "use these as a gentle bias, never as a hard filter):",
    tasteHintBlock,
    "",
    "EXCLUDED TITLES (do not return these or paraphrases):",
    `  - ${exclusions}`,
    "",
    "Return JSON only. No prose, no apology, no preamble.",
  ].join("\n")

  return { system, user, version: HYBRID_TOPICS_PROMPT_VERSION }
}
