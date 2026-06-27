/**
 * Editorial enrichment prompt — applies the editorial intelligence to topics
 * that already exist (e.g. the Guided/hybrid generator's output) rather than
 * inventing new ones.
 *
 * One gpt-4o pass classifies each topic into the Knowledge Universe (category +
 * subcategory), refracts it through Thinking Lenses, writes the full headline
 * set, AND acts as the Editorial Court — scoring the 14 success dimensions and
 * answering the critique. This is how the live wizard's guided topics gain the
 * same world-class editorial layer as the editorial engine, without discarding
 * the market-signal reasoning that produced them.
 *
 * Pure string builders. No I/O.
 */

import {
  buildKnowledgeUniverseBlock,
  buildLensesBlock,
} from "./prompts-editorial"
import { buildHeadlinePrinciplesBlock } from "./headline-principles"
import { buildPodcastPrinciplesBlock } from "./podcast-principles"
import { SUCCESS_DIMENSION_LABELS_AR } from "./success-score"

export interface EnrichTopicInput {
  index: number
  title: string
  why_it_matters: string
  why_now: string
  hook: string
  conflict_angle: string
  market_inspiration: string
  episode_type: string
  topic_domain: string
}

const SUCCESS_FIELDS = `{
      "click_potential": 0-10, "retention_potential": 0-10, "discussion_potential": 0-10,
      "shareability": 0-10, "guest_potential": 0-10, "sponsor_appeal": 0-10,
      "timeless_value": 0-10, "regional_relevance": 0-10, "global_relevance": 0-10,
      "brand_alignment": 0-10, "originality": 0-10, "depth": 0-10,
      "risk_calibration": 0-10, "production_feasibility": 0-10
    }`

const TITLE_FIELDS = `{
      "premium": string, "curiosity": string, "controversial": string, "emotional": string,
      "global": string, "local": string, "youtube": string, "apple": string,
      "recommended": one of "premium"|"curiosity"|"controversial"|"emotional"|"global"|"local"|"youtube"|"apple",
      "recommended_reason": string
    }`

const ENRICH_SHAPE = `{
    "index": number (echo EXACTLY),
    "category": string (exact category id from the menu),
    "subcategory": string (exact subcategory id under that category),
    "lenses": string[] (2-5 lens ids that truly sharpen it),
    "titles": ${TITLE_FIELDS},
    "main_axes": string[] (2-4 Arabic angles),
    "suggested_questions": string[] (3-5 Arabic questions),
    "debate_axis": string (Arabic), "viral_angle": string (Arabic),
    "regional_note": string (Arabic — why it lands in KSA/Kuwait/Iraq/GCC),
    "global_note": string (Arabic — why it also lands internationally),
    "why_this_topic": string (Arabic),
    "success": ${SUCCESS_FIELDS},
    "why_succeed": string (Arabic), "why_fail": string (Arabic — never empty),
    "is_overdone": boolean, "reference_potential": boolean, "clip_potential": boolean
  }`

export function buildEnrichSystemPrompt(): string {
  const successMenu = Object.entries(SUCCESS_DIMENSION_LABELS_AR)
    .map(([k, ar]) => `  · ${k} (${ar})`)
    .join("\n")
  return [
    "# Khat Editorial Intelligence — enrich existing topics (authoritative)",
    "",
    "You are at once a GCC cultural editor, a newspaper headline editor, a YouTube strategist,",
    "and a skeptical executive producer. A set of episode topics already exists. Do NOT replace",
    "them — ENRICH each one with the full editorial layer, then judge it honestly.",
    "",
    buildKnowledgeUniverseBlock(),
    "",
    buildLensesBlock(),
    "",
    buildHeadlinePrinciplesBlock(),
    "",
    buildPodcastPrinciplesBlock(),
    "",
    "## For each topic you must",
    "1. Classify it: pick the best category id + a precise subcategory id under it.",
    "2. Refract it through 2-5 thinking lenses that genuinely sharpen it.",
    "3. Write the full title set (one per angle) and recommend the strongest with a reason.",
    "4. Add 2-4 main axes, 3-5 questions, the debate axis, the viral angle, and the regional",
    "   + global notes.",
    "5. Act as the Editorial Court: score all 14 success dimensions HONESTLY (full range; be",
    "   harsher than a generator — reserve 8-10 for the exceptional; brand_alignment is the gate):",
    successMenu,
    "   Then answer: why it would succeed, why it would fail (never empty), is it overdone,",
    "   could it become a reference episode, does it contain a shareable clip moment.",
    "",
    "## Rules",
    "- category + subcategory + lens ids must be EXACT snake_case ids from the menus.",
    "- Echo each topic's `index` exactly so results align.",
    "- Return EVERY input topic — one object each, no omissions.",
    '- Output a single JSON object of EXACTLY this form (an array under "topics"):',
    `  { "topics": [ ${ENRICH_SHAPE}, … one per input topic ] }`,
  ].join("\n")
}

export function buildEnrichUserPrompt(topics: EnrichTopicInput[]): string {
  const blocks = topics
    .map((t) =>
      [
        `# index ${t.index}`,
        `title: ${t.title}`,
        `why_it_matters: ${t.why_it_matters || "—"}`,
        `why_now: ${t.why_now || "—"}`,
        `hook: ${t.hook || "—"}`,
        `conflict_angle: ${t.conflict_angle || "—"}`,
        `market_inspiration: ${t.market_inspiration || "—"}`,
        `current_type/domain: ${t.episode_type} / ${t.topic_domain}`,
      ].join("\n"),
    )
    .join("\n\n")
  return [
    "Enrich and judge each of these existing topics. Return one object per topic, echoing the",
    "index. Keep the topic's intent; add the editorial layer + your honest verdict. JSON array only.",
    "",
    blocks,
  ].join("\n")
}
