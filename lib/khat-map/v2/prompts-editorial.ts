/**
 * Editorial generation prompt — the world-class editorial intelligence engine.
 *
 * This is the upgrade's heart. The model is asked to think simultaneously as a
 * global podcast strategist, a GCC cultural editor, a newspaper headline editor,
 * a YouTube strategist, and a skeptical executive producer. It draws from the
 * Knowledge Universe (category + a sharp subcategory) and refracts each idea
 * through several Thinking Lenses; writes a full headline set under the headline
 * principles; and scores every idea honestly on the 14 success dimensions while
 * answering the editorial-court questions about itself.
 *
 * The separate, second-pass Editorial Court (prompts-court.ts) then interrogates
 * and re-calibrates the pool. Together they replace "assign a category + score 9
 * RAF factors" with a real editorial process.
 *
 * Pure string builders. No I/O.
 */

import type { CandidateGenInput } from "./types"
import { renderEditorialControlBlocks, __formatTasteHints } from "./prompts"
import { SEASON_CATEGORIES } from "./categories"
import { categoryLabel } from "./diversity"
import { KNOWLEDGE_UNIVERSE } from "./knowledge-universe"
import { THINKING_LENSES } from "./lenses"
import { buildHeadlinePrinciplesBlock } from "./headline-principles"
import { buildPodcastPrinciplesBlock } from "./podcast-principles"
import { SUCCESS_DIMENSION_LABELS_AR } from "./success-score"
import type { SeasonCategoryId } from "./categories"
import type { KhatMapInvasionPolicy } from "@/types/khat-map"

// ─── Output contract ─────────────────────────────────────────────────────────

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
      "recommended_reason": string (Arabic — why this title wins)
    }`

const TOPIC_FIELDS = `{
    "working_title": string (Arabic — the clear editorial spine of the episode),
    "category": string (exact snake_case id from the category menu),
    "subcategory": string (exact snake_case id from that category's subcategory list),
    "lenses": string[] (2-5 lens ids from the lens menu — the angles that truly sharpen THIS idea),
    "hook": string (Arabic — the opening tension that grabs attention),
    "why_matters": string (Arabic),
    "why_now": string (≤ 16 words, Arabic — top-of-card),
    "goal": string (Arabic),
    "description": string (Arabic — 2-4 sentences),
    "episode_type": one of "intellectual"|"social"|"psychological"|"personal_story"|"national"|"historical"|"economic"|"controversial"|"inspirational"|"mass_audience"|"signature_khat"|"invasion",
    "main_axes": string[] (2-4 Arabic angles the episode explores),
    "suggested_questions": string[] (3-5 Arabic questions),
    "debate_axis": string (Arabic — the core tension people argue about),
    "viral_angle": string (Arabic — the single shareable moment),
    "regional_note": string (Arabic — why it lands in KSA/Kuwait/Iraq/GCC),
    "global_note": string (Arabic — why it also lands internationally),
    "risk_level": "safe"|"medium"|"bold"|"highly_sensitive",
    "effort_level": "easy"|"medium"|"hard"|"requires_special",
    "sponsor_appeal": "low"|"medium"|"high",
    "titles": ${TITLE_FIELDS},
    "why_this_topic": string (Arabic — why THIS topic deserves an episode),
    "guest_idea": string (Arabic — a sketch of a guest who could carry it; not a real booking),
    "success": ${SUCCESS_FIELDS}
  }`

const CANDIDATE_SHAPE = `{
  "topic": ${TOPIC_FIELDS},
  "guest": null,
  "editorial_score": number (0-10 — your overall confidence this is a great Khat episode)
}`

// ─── Knowledge + lens menus ──────────────────────────────────────────────────

export function buildKnowledgeUniverseBlock(): string {
  const lines: string[] = [
    "# Knowledge Universe — choose a category AND a sharp subcategory",
    "Pick the best-fit `category` id, then the best-fit `subcategory` id UNDER it. The",
    "subcategory is where the real idea lives — it forces you past the obvious episode.",
    "",
  ]
  for (const cat of SEASON_CATEGORIES) {
    const subs = KNOWLEDGE_UNIVERSE[cat.id as SeasonCategoryId] ?? []
    lines.push(`● ${cat.id} — ${cat.label_ar}`)
    for (const s of subs) {
      lines.push(`   · ${s.id} — ${s.label_ar}: ${s.scope_ar}`)
    }
  }
  return lines.join("\n")
}

export function buildLensesBlock(): string {
  const menu = THINKING_LENSES.map((l) => `  · ${l.id} (${l.label_ar}): ${l.hint_ar}`).join("\n")
  return [
    "# Thinking Lenses — refract each idea through several",
    "A flat topic is weak. The strongest episodes take ONE subject and view it through",
    "2-5 lenses at once (e.g. a money topic through history + power + psychology). Tag the",
    "lenses that genuinely sharpen the idea, and let the combination drive the hook, the",
    "debate axis, and the questions — not a label slapped on afterward.",
    menu,
  ].join("\n")
}

function buildBoardBlock(invasionPolicy: KhatMapInvasionPolicy): string {
  const invasionLine =
    invasionPolicy === "required"
      ? "- keep a Kuwait national-memory / Iraqi-invasion anchor this season (fresh angle)"
      : invasionPolicy === "excluded"
        ? "- NO invasion episode this season — keep a different Kuwait / national-memory anchor"
        : "- keep a Kuwait / national-memory anchor when a fresh angle exists (grounding, not filler)"

  return [
    "# Khat Editorial Board — world-class brief (authoritative)",
    "",
    "Think at once as FIVE people: a global podcast strategist, a GCC cultural editor, a",
    "newspaper headline editor, a YouTube strategist, and a skeptical executive producer.",
    "خط is deep, original, emotionally honest, and timeless — never shallow trend-chasing.",
    "",
    "## The double goal",
    "Every idea must do BOTH: pull the GCC audience (السعودية، الكويت، العراق، الخليج) by what",
    "they genuinely want to watch and debate, AND carry international appeal — a question the",
    "whole world cares about. The best Khat episodes are locally rooted and globally resonant.",
    "",
    "## Depth is universal",
    "A science, business, health, finance, technology, history, or culture topic can be exactly",
    "as deep, timeless, and magnetic as a psychology or philosophy one. Do NOT default to",
    "introspective/philosophical framing — explore each idea on its own terms.",
    "",
    "## Quality bar (do not cross)",
    "- no shallow trend-chasing worthless in a year; no clickbait / tabloid framing",
    "- no low-value controversy for its own sake; no empty self-help / finance / wellness clichés",
    "- a strong, credible guest must be plausible (this feeds guest_potential honestly)",
    "",
    "## Identity anchors (across the season)",
    invasionLine,
    "- at least one deeply human, emotionally powerful story; at least one bold, debatable episode",
  ].join("\n")
}

// ─── System prompt ───────────────────────────────────────────────────────────

export function buildEditorialSystemPrompt(input: CandidateGenInput): string {
  const alreadyChosen = input.accepted_titles.length
    ? input.accepted_titles.slice(0, 30).map((t) => `  · ${t}`).join("\n")
    : "  (none yet)"
  const rejected = input.rejected_titles.length
    ? input.rejected_titles.slice(0, 20).map((t) => `  · ${t}`).join("\n")
    : "  (no rejections yet)"
  const taste = __formatTasteHints(input.taste_profile)
  const controlBlocks = renderEditorialControlBlocks(input.editorial_controls)

  const over = input.over_represented_categories ?? []
  const overLine =
    over.length > 0
      ? `Already well-covered this season (find FRESH ground elsewhere): ${over
          .map((id) => categoryLabel(id))
          .join("، ")}.`
      : "Nothing is over-covered yet — range widely across categories AND subcategories."

  const successMenu = Object.entries(SUCCESS_DIMENSION_LABELS_AR)
    .map(([k, ar]) => `  · ${k} (${ar})`)
    .join("\n")

  return [
    buildBoardBlock(input.invasion_policy),
    "",
    buildKnowledgeUniverseBlock(),
    "",
    buildLensesBlock(),
    "",
    buildHeadlinePrinciplesBlock(),
    "",
    buildPodcastPrinciplesBlock(),
    "",
    "## Your task",
    `Propose ${input.target_count} of the STRONGEST possible Khat episode opportunities — each`,
    `locally magnetic for the GCC AND globally resonant. These are TOPICS only (no guests).`,
    "For EACH idea you must:",
    "1. Choose a category + a precise subcategory from the Knowledge Universe.",
    "2. Refract it through 2-5 thinking lenses that genuinely sharpen it.",
    "3. Write a full title set (one per angle) and recommend the strongest with a reason.",
    "4. Answer the self-critique (why this topic, why now, the debate, the hook, why it succeeds).",
    "5. Score all 14 success dimensions HONESTLY for a real Khat episode:",
    successMenu,
    "   Use the full range — a niche idea can score low on click even if you like it. Be a",
    "   discerning producer, not a cheerleader. brand_alignment is the quality gate.",
    "",
    "## On diversity (a constraint, not the goal)",
    "Episode potential comes first. Do NOT fill quotas. But range naturally — a great board",
    "doesn't pitch ten psychology ideas. Spread across categories AND subcategories.",
    overLine,
    "",
    "## Already chosen for this season (do NOT duplicate or paraphrase)",
    alreadyChosen,
    "",
    "## Negative memory (do NOT repeat or paraphrase)",
    rejected,
    "",
    "## Admin taste (a gentle tiebreaker only — never overrides episode potential)",
    taste,
    ...controlBlocks.flatMap((b) => ["", b]),
    "",
    "## Ironclad rules",
    "1. Optimize for the best GCC+global podcast season — strongest opportunities first.",
    "2. category + subcategory ids must be EXACT snake_case ids from the menus (no Arabic, no brackets).",
    "3. lenses must be 2-5 exact lens ids. Fill the full title set + all 14 success factors.",
    "4. TOPICS ONLY — always emit `\"guest\": null`. Put any guest thought in `guest_idea`.",
    "5. Respect the quality bar, identity anchors, editorial controls, and negative memory strictly.",
    "6. Output JSON only — a top-level array of candidates. No prose outside the array.",
    "",
    "## Output contract",
    `Array<${CANDIDATE_SHAPE}>`,
  ].join("\n")
}

export function buildEditorialUserPrompt(input: CandidateGenInput): string {
  return [
    `Produce ${input.target_count} of the strongest Khat episode opportunities — each locally`,
    `magnetic for the GCC (KSA, Kuwait, Iraq, wider Gulf) AND globally resonant. For each:`,
    `category + precise subcategory, 2-5 lenses, a full title set with a recommended pick, the`,
    `self-critique, and all 14 success dimensions scored honestly. Respond with a JSON array only.`,
  ].join("\n")
}
