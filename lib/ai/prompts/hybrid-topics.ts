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

export const HYBRID_TOPICS_PROMPT_VERSION = "hybrid-topics-v1.0"

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

  // Phase 6: clusters are the ONLY legitimate market-signal path. When
  // they're absent we explicitly tell the model — no raw-signal smuggle.
  const clusterSummaries =
    input.marketClusters.length > 0
      ? input.marketClusters
          .slice(0, HYBRID_INPUT_CAPS.market_clusters)
          .map(
            (c) =>
              `- label: ${c.label} (${c.language})\n  signals: ${c.signal_count}\n  emotions: ${c.dominant_emotions.join(" | ") || "—"}\n  median_views: ${c.median_view_signal ?? "—"}\n  hook samples: ${(c.narrative_hooks ?? []).slice(0, 3).join(" | ")}`,
          )
          .join("\n")
      : "(foundational path — market clusters unavailable; rely on the originals + worked-report + lens registry below; market_inspiration may describe the kind of signal that would justify each topic)"

  const tasteHintBlock = (() => {
    if (input.tasteHints.length === 0) return "(no learned preferences yet)"
    const lines = input.tasteHints.map((h) => {
      const direction = h.weight >= 0 ? "favour" : "avoid"
      return `- ${direction} ${h.dimension}: ${h.key} (weight=${h.weight.toFixed(2)})`
    })
    return lines.join("\n")
  })()

  const strongDomains = input.workedReport.strong_topic_domains
    .slice(0, HYBRID_INPUT_CAPS.worked_strong_domains)
    .map((d) => `${d.key} (mean=${d.mean_score.toFixed(2)}, n=${d.sample_size})`)
  const weakDomains = input.workedReport.weak_topic_domains
    .slice(0, HYBRID_INPUT_CAPS.worked_weak_domains)
    .map((d) => `${d.key} (mean=${d.mean_score.toFixed(2)}, n=${d.sample_size})`)

  const exclusions =
    input.excludedTitles.length === 0
      ? "(none)"
      : input.excludedTitles
          .slice(0, HYBRID_INPUT_CAPS.exclusion_titles)
          .join("\n  - ")

  const kuwaitDirective = input.allowKuwaitBias
    ? "Kuwait-specific framing IS welcome on this run."
    : "Do NOT use Kuwait-specific framing (no city names, no dialect markers, no local references). The default audience is pan-Arab."

  const lensRegistry = input.lenses
    .map((l) => `${l.key}: ${l.name_en} — ${l.description}`)
    .join("\n")

  const system = [
    "You are the Hybrid Topic Generator for the Arabic-language Khat Podcast.",
    "Your job: take REAL market signals (what audiences engage with) and",
    "ELEVATE them through editorial lenses to produce topics that are",
    "neither generic copies of trending content nor disconnected lens-only",
    "philosophy.",
    "",
    "ABSOLUTE RULES",
    "1. Output JSON only. Shape: { topics: [ {",
    "     title, why_it_matters, why_now, emotional_hook,",
    "     conflict_angle, market_inspiration, original_lens,",
    "     suggested_episode_type, suggested_topic_domain,",
    "     estimated_strength_score",
    "   } ] }.",
    `2. Each title MUST be in ${langLabel}.`,
    "3. Every topic MUST set:",
    "   - original_lens to one of the registry KEYS below.",
    "   - market_inspiration: a sentence naming WHICH cluster/hook/emotion fed this topic.",
    "   - suggested_episode_type drawn from: intellectual, social, psychological, personal_story, national, historical, economic, controversial, inspirational, mass_audience, signature_khat, invasion.",
    "   - suggested_topic_domain drawn from: philosophy, psychology, relationships, religion, identity_masculinity, money_career, technology_ai, internet_culture, crime_mystery, hidden_history, power_manipulation, parenting, kuwait_gulf, historical, social_issues, modern_society, emotions_inner_life, none.",
    "4. NEVER copy a market title. Transform it. The relationship between market_inspiration and title must NOT be a paraphrase.",
    "5. Reject your own first draft if it sounds like self-help, listicle, or hustle-culture. No \"how to,\" no \"5 secrets,\" no \"unlock your.\"",
    "6. " + kuwaitDirective,
    "7. The conflict_angle MUST name a specific tension, not a vague theme.",
    "8. The emotional_hook MUST be a sentence that would make a thoughtful person stop scrolling — never \"in this episode we explore.\"",
    "9. estimated_strength_score is your honest 0..1 estimate of editorial strength.",
    "10. Distribute across multiple lenses (no single lens > 40% of the batch).",
    "11. Aim to return the full requested count. Drop a topic ONLY if it would duplicate the EXCLUDED list or violate rules 1–10. Reaching for a slightly weaker but still honest angle is preferred over silently under-delivering.",
    "",
    "EDITORIAL LENS REGISTRY (always available):",
    lensRegistry,
  ].join("\n")

  const user = [
    `Generate ${input.count} hybrid topics in ${langLabel}. The button the operator pressed promises ${input.count} candidates — returning fewer than ${input.count} silently breaks that contract. Only fall short if the EXCLUDED list and rules 1–10 truly leave you no room.`,
    "",
    "FRESH ORIGINAL TOPICS (you may transform any of these — when you do, set original_lens to that topic's lens):",
    input.originalTopics.length === 0 ? "(none)" : lensSummaries,
    "",
    "MARKET CLUSTERS (DO NOT copy titles; pick one as inspiration; cite it in market_inspiration):",
    clusterSummaries,
    "",
    "PERFORMANCE LEARNING (Phase 8 worked-report):",
    `  Strong domains: ${strongDomains.length === 0 ? "(no data)" : strongDomains.join(" | ")}`,
    `  Weak domains:   ${weakDomains.length === 0 ? "(no data)" : weakDomains.join(" | ")}`,
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
