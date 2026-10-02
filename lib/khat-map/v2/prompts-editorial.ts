/**
 * Editorial generation prompt — the world-class editorial intelligence engine.
 *
 * The model thinks at once as a global podcast strategist, a GCC cultural editor,
 * a newspaper headline editor, a YouTube strategist, and a skeptical executive
 * producer. It uses the Knowledge Universe as INSPIRATION (not a cage), refracts
 * each idea through Thinking Lenses, writes a full headline set, and scores every
 * idea on the 14 success dimensions.
 *
 * Phase A (creativity redesign) changes vs. the original:
 *   • The taxonomy is inspiration + a coverage tag, NOT a menu the idea must fit.
 *     Off-map ideas are welcomed (they're the fresh ground — and, later, the
 *     signal that the Living Knowledge Universe should grow a new subcategory).
 *   • Every topic declares an ARCHETYPE (its shape). A batch must span archetypes
 *     instead of stacking "big macro issue" panels.
 *   • A boldness dial (~70% fresh-angle-on-resonant + ~30% white-space/wildcards)
 *     + hard anti-cliché rules that ban the generic default shapes.
 *   • Diversity + originality are the JOB, not a constraint to grudgingly respect.
 *
 * The separate Editorial Court (prompts-court.ts) then interrogates the pool;
 * selection (batch-engine + select-by-potential) keeps semantic + archetype
 * spread rather than ranking everything toward a safe centre.
 *
 * Pure string builders. No I/O.
 */

import type { CandidateGenInput } from "./types"
import { renderEditorialControlBlocks, __formatTasteHints } from "./prompts"
import { SEASON_CATEGORIES } from "./categories"
import { categoryLabel } from "./diversity"
import { allowedSubcategoriesFor } from "./knowledge-universe"
import { THINKING_LENSES } from "./lenses"
import { buildHeadlinePrinciplesBlock } from "./headline-principles"
import { buildPodcastPrinciplesBlock } from "./podcast-principles"
import {
  ARCHETYPE_FIELD_SPEC,
  buildArchetypesBlock,
  buildOriginalityBlock,
  buildBannedShapesBlock,
  buildBoldnessDialBlock,
  buildResonanceEngineBlock,
} from "./creative-brief"
import { renderExplorationBlock } from "./exploration"
import { SUCCESS_DIMENSION_LABELS_AR, successFieldsSpec } from "./success-score"
import { khatConstitutionPrompt } from "@/lib/khat-map/core/constitution"
import { SENSITIVITY_FLAGS_SPEC } from "@/lib/khat-map/core/policy"
import type { SeasonCategoryId } from "./categories"

// ─── Output contract ─────────────────────────────────────────────────────────

const SUCCESS_FIELDS = successFieldsSpec()

const TITLE_FIELDS = `{
      "premium": string, "curiosity": string, "controversial": string, "emotional": string,
      "global": string, "local": string, "youtube": string, "apple": string,
      "recommended": one of "premium"|"curiosity"|"controversial"|"emotional"|"global"|"local"|"youtube"|"apple",
      "recommended_reason": string (Arabic — why this title wins)
    }`

const TOPIC_FIELDS = `{
    "working_title": string (Arabic — the clear editorial spine of the episode),
    "archetype": ${ARCHETYPE_FIELD_SPEC} — see the archetype menu,
    "novelty_note": string (Arabic — why THIS angle is fresh: what the done-to-death version would have been, and why yours isn't it),
    "category": string (best-fit snake_case id from the menu — a loose COVERAGE tag, not a cage),
    "subcategory": string (best-fit subcategory id from that category, OR "off_map" if this idea genuinely doesn't fit any existing one — off-map is welcome, it means you found fresh ground),
    "lenses": string[] (2-5 lens ids from the lens menu — the angles that truly sharpen THIS idea),
    "hook": string (Arabic — the opening tension that grabs attention),
    "why_matters": string (Arabic),
    "why_now": string (≤ 16 words, Arabic — top-of-card),
    "goal": string (Arabic),
    "description": string (Arabic — 2-4 sentences),
    "episode_type": one of "intellectual"|"social"|"psychological"|"personal_story"|"national"|"historical"|"economic"|"inspirational"|"signature_khat"|"invasion",
    "main_axes": string[] (2-4 Arabic angles the episode explores),
    "suggested_questions": string[] (3-5 Arabic questions),
    "debate_axis": string (Arabic — the core tension people argue about),
    "viral_angle": string (Arabic — the single shareable moment),
    "regional_note": string (Arabic — which audience segment (٢٠–٣٥ / ٣٥–٦٠) and life-stage concern it serves),
    "global_note": string (Arabic — its lasting reference value: why someone returns to it in five years),
    "sensitivity_flags": string[] (see the rule below),
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
    "# Knowledge Universe — INSPIRATION + a coverage map (NOT a cage)",
    "This is Khat's map of what it cares about. Use it two ways: (1) as a springboard —",
    "a subcategory should spark a specific, surprising idea, never a topic that just",
    "restates the label; (2) as a COVERAGE tag so the season stays balanced. You are NOT",
    "limited to it: if the best idea doesn't fit any subcategory, tag `subcategory:\"off_map\"`",
    "and pick the closest category — off-map ideas are exactly the fresh ground we want.",
    "",
  ]
  for (const cat of SEASON_CATEGORIES) {
    // The constitution's forbidden territories are never offered.
    const subs = allowedSubcategoriesFor(cat.id as SeasonCategoryId)
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

function buildBoardBlock(): string {
  return [
    "# Khat Editorial Board — brief (the constitution above governs it)",
    "",
    "Think at once as an editor of a lasting Arabic reference library, a cultural editor,",
    "a headline editor, and a skeptical executive producer.",
    "",
    "## The goal",
    "Every idea rests on a moving human experience someone really lived, leaves practical",
    "value grounded in that experience, speaks to one of the two audience segments, and is",
    "still worth returning to in five years. Titles any Arab understands; the story may be",
    "Kuwaiti-rooted. Not views, not trends.",
    "",
    // Shared creative doctrine — identical to the guided hybrid engine.
    buildOriginalityBlock(),
    "",
    buildBannedShapesBlock(),
    "",
    buildBoldnessDialBlock(),
    "",
    buildResonanceEngineBlock(),
    "",
    "## Quality bar (do not cross)",
    "- a Kuwaiti man with a first-hand account must plausibly exist (feeds guest_findability honestly)",
    "- sensitive ≠ exposing: on sensitive topics the guest decides what to say; never name a third party",
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
      : "Nothing is over-covered yet — range widely across categories, subcategories, AND archetypes."

  const successMenu = Object.entries(SUCCESS_DIMENSION_LABELS_AR)
    .map(([k, ar]) => `  · ${k} (${ar})`)
    .join("\n")

  return [
    // The constitution (full) is the FIRST block, carrying this season's
    // invasion policy — every other instruction sits under it.
    khatConstitutionPrompt(input.invasion_policy),
    "",
    buildBoardBlock(),
    "",
    buildArchetypesBlock(),
    "",
    ...(input.exploration_frames && input.exploration_frames.length > 0
      ? [
          renderExplorationBlock(input.exploration_frames),
          "When a slot's territory is a Knowledge-Universe subcategory, use that exact id as",
          'the topic\'s `subcategory` (and its parent as `category`); for a white-space territory',
          'use the closest category + `"off_map"`. The slot\'s archetype is the topic\'s `archetype`.',
          "",
        ]
      : []),
    buildKnowledgeUniverseBlock(),
    "",
    buildLensesBlock(),
    "",
    buildHeadlinePrinciplesBlock(),
    "",
    buildPodcastPrinciplesBlock(),
    "",
    "## Your task",
    `Propose ${input.target_count} Khat episode opportunities that are DIVERSE in field, audience`,
    `segment and shape, and genuinely original — each resting on a lived human experience worth`,
    `telling. TOPICS only (no guests). For EACH idea:`,
    "1. Choose an ARCHETYPE and make the batch span many (don't stack one shape).",
    "2. Build it on a real resonance engine (tension / stake / taboo / hidden world / reframe).",
    "3. Tag a category + subcategory for coverage — or `\"off_map\"` if it's fresh ground.",
    "4. Refract it through 2-5 thinking lenses that genuinely sharpen it.",
    "5. Write a full title set (one per angle) and recommend the strongest with a reason.",
    "6. Answer the self-critique (why this, why now, the debate, the hook, why it's fresh).",
    "7. Score every success dimension HONESTLY for a real Khat episode:",
    successMenu,
    "   Use the full range. worth_telling weighs most; brand_alignment is the gate. The score",
    "   only ORDERS the list — be a discerning producer, not a cheerleader.",
    `8. ${SENSITIVITY_FLAGS_SPEC}`,
    "",
    "## On diversity (this IS the goal, not a side constraint)",
    "Range across fields, doors, audience segments AND archetypes. A great board does NOT pitch ten variations of one",
    "theme. If two of your ideas could share a guest or a headline, one of them is redundant —",
    "replace it. Spread across categories, subcategories, and especially archetypes.",
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
    "1. Optimize for the constitution — the most worth-telling, most ORIGINAL lived experiences first.",
    "2. Every topic needs an `archetype`; the batch must span at least 4 different archetypes.",
    "3. category id must be an exact snake_case id from the menu; subcategory is an exact id OR \"off_map\".",
    "4. lenses must be 2-5 exact lens ids. Fill the full title set + every success dimension + sensitivity_flags.",
    "5. TOPICS ONLY — always emit `\"guest\": null`. Put any guest thought in `guest_idea`.",
    "6. Respect the constitution's avoid list, the BANNED shapes, quality bar, editorial controls, and negative memory strictly.",
    '7. Output JSON only — a single object {"topics": [ ... ]} whose "topics" is the array of',
    "   candidates. No prose outside the object. (JSON mode requires a top-level object.)",
    "",
    "## Output contract",
    `{ "topics": Array<${CANDIDATE_SHAPE}> }`,
  ].join("\n")
}

export function buildEditorialUserPrompt(input: CandidateGenInput): string {
  return [
    `Produce ${input.target_count} DIVERSE, original Khat episode opportunities — each resting`,
    `on a lived human experience worth telling, titled so any Arab understands it. Spread across`,
    `fields, doors and both audience segments, span at least 4 archetypes, avoid the banned`,
    `generic shapes and the constitution's avoid list, and make every idea run on a real`,
    `resonance engine. For each: archetype, a novelty note, category + subcategory (or`,
    `"off_map"), 2-5 lenses, a full title set with a recommended pick, the self-critique, every`,
    `success dimension scored honestly, and sensitivity_flags. Respond with a single JSON`,
    `object of the form {"topics": [ ... ]} — the array under "topics", nothing else.`,
  ].join("\n")
}
