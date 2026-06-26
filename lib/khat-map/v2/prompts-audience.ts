/**
 * Audience-first generation prompt — the editorial board for the GCC.
 *
 * Objective: NOT "fill category quotas" but "find the strongest podcast-episode
 * opportunities for Saudi Arabia, Kuwait, Iraq, and the wider GCC." The model is
 * told to think like a seasoned editorial board, ranking ideas by Regional
 * Audience Fit (curiosity + discussion → regional/cultural relevance → guest
 * attraction → timelessness → viral, all on Khat's quality bar). It produces a
 * naturally diverse pool of high-potential ideas, each self-scored on the nine
 * RAF factors and labeled with a best-fit category. Category balance is applied
 * downstream as a constraint — here it's only a gentle "favor fresh ground" nudge.
 *
 * Pure string builders. No I/O.
 */

import type { CandidateGenInput } from "./types"
import { renderEditorialControlBlocks, __formatTasteHints } from "./prompts"
import { SEASON_CATEGORIES } from "./categories"
import { categoryLabel } from "./diversity"
import type { KhatMapInvasionPolicy } from "@/types/khat-map"

// ─── Output contract ─────────────────────────────────────────────────────────

const AUDIENCE_FIT_FIELDS = `{
      "regional_relevance": number (0-10 — relevance specifically to KSA / Kuwait / Iraq / GCC),
      "cultural_resonance": number (0-10 — touches the region's lived reality, values, debates),
      "curiosity": number (0-10 — how badly people want to know / click),
      "guest_potential": number (0-10 — likelihood of landing a strong, credible guest),
      "discussion_potential": number (0-10 — depth + breadth of conversation it sparks),
      "timelessness": number (0-10 — still worth watching in years, not a 3-day trend),
      "viral_potential": number (0-10 — share-ability / spread),
      "educational_value": number (0-10 — viewer leaves knowing something real),
      "identity_alignment": number (0-10 — on Khat's identity + quality bar)
    }`

const AUDIENCE_TOPIC_FIELDS = `{
    "working_title": string (Arabic, concise, magnetic),
    "category": string (best-fit id from the category list — a label, not a target),
    "hook": string (Arabic — the opening tension that grabs attention),
    "why_matters": string,
    "why_now": string (≤ 16 words, Arabic, UI top-of-card),
    "goal": string,
    "description": string,
    "episode_type": one of "intellectual"|"social"|"psychological"|"personal_story"|"national"|"historical"|"economic"|"controversial"|"inspirational"|"mass_audience"|"signature_khat"|"invasion",
    "main_axes": string[] (2-4 Arabic angles),
    "suggested_questions": string[] (3-5 Arabic questions),
    "risk_level": "safe"|"medium"|"bold"|"highly_sensitive",
    "effort_level": "easy"|"medium"|"hard"|"requires_special",
    "sponsor_appeal": "low"|"medium"|"high",
    "audience_fit": ${AUDIENCE_FIT_FIELDS},
    "regional_note": string (Arabic, one line — why this lands in KSA / Kuwait / Iraq / GCC),
    "viral_angle": string (Arabic, one line — why it spreads),
    "debate_axis": string (Arabic, one line — the core tension people would argue about)
  }`

const AUDIENCE_CANDIDATE_SHAPE = `{
  "topic": ${AUDIENCE_TOPIC_FIELDS},
  "guest": null,
  "editorial_score": number (0-10 — your overall confidence this is a great Khat episode),
  "domain_reasoning": string | null
}`

// ─── Identity / editorial board framing ──────────────────────────────────────

function buildEditorialBoardBlock(invasionPolicy: KhatMapInvasionPolicy): string {
  const invasionLine =
    invasionPolicy === "required"
      ? "- the season keeps a Kuwait national-memory / Iraqi-invasion anchor (vary the angle across seasons)"
      : invasionPolicy === "excluded"
        ? "- no invasion episode this season — keep a different Kuwait / national-memory anchor instead"
        : "- keep a Kuwait / national-memory anchor when a fresh angle exists (identity grounding, not filler)"

  return [
    "# Khat Editorial Board — audience-first brief (authoritative)",
    "",
    "You are an experienced editorial board choosing the next season of خط بودكاست.",
    "خط is deep, original, emotionally honest, and timeless — never shallow trend-chasing.",
    "",
    "## Who we make this for",
    "The core audience is the GCC — primarily السعودية (Saudi Arabia)، الكويت (Kuwait)،",
    "العراق (Iraq), and the wider Gulf. Judge every idea by what THIS audience genuinely",
    "wants to watch and talk about — not by what a Western or pan-Arab show would pick.",
    "",
    "## How to think (in this order)",
    "1. Curiosity + discussion: which ideas have the highest curiosity and debate potential?",
    "2. Regional + cultural relevance: which truly resonate in KSA / Kuwait / Iraq / the GCC?",
    "3. Guest attraction: which are most likely to land a strong, credible guest?",
    "4. Timelessness: which hold lasting value rather than being a passing trend?",
    "5. Viral + quality: which spread and spark conversation WHILE staying on Khat's bar?",
    "",
    "## Depth is universal",
    "A science, business, health, finance, technology, history, or culture topic can be",
    "exactly as deep, timeless, and magnetic as a psychology or philosophy one. Do NOT",
    "default to introspective/philosophical framing — explore each idea on its own terms.",
    "",
    "## Quality bar (do not cross)",
    "- no shallow trend-chasing worthless in a year; no clickbait / tabloid framing",
    "- no low-value controversy for its own sake; no empty self-help / finance / wellness clichés",
    "- guests must have a real track record (this feeds guest_potential honestly)",
    "",
    "## Identity anchors (across the season)",
    invasionLine,
    "- at least one deeply human, emotionally powerful story; at least one bold, debatable episode",
  ].join("\n")
}

// ─── System prompt ───────────────────────────────────────────────────────────

export function buildAudienceFirstSystemPrompt(input: CandidateGenInput): string {
  const alreadyChosen = input.accepted_titles.length
    ? input.accepted_titles.slice(0, 30).map((t) => `  · ${t}`).join("\n")
    : "  (none yet)"
  const rejected = input.rejected_titles.length
    ? input.rejected_titles.slice(0, 20).map((t) => `  · ${t}`).join("\n")
    : "  (no rejections yet)"
  const taste = __formatTasteHints(input.taste_profile)
  const controlBlocks = renderEditorialControlBlocks(input.editorial_controls)

  const categoryMenu = SEASON_CATEGORIES.map(
    (c) => `  · ${c.id} — ${c.label_ar}: ${c.scope_ar}`,
  ).join("\n")

  const over = input.over_represented_categories ?? []
  const overLine =
    over.length > 0
      ? `Already well-covered this season (go find FRESH ground elsewhere): ${over
          .map((id) => categoryLabel(id))
          .join("، ")}.`
      : "Nothing is over-covered yet — range widely."

  return [
    buildEditorialBoardBlock(input.invasion_policy),
    "",
    "## Your task",
    `Propose ${input.target_count} of the STRONGEST possible Khat episode opportunities for`,
    `the GCC audience — a season of ~${input.season_target} episodes. Rank in your own head by`,
    `the 5-step order above. These are TOPICS only (no guests).`,
    "",
    "## On diversity (a constraint, not the goal)",
    "Episode potential comes first. Do NOT fill quotas. But a great board doesn't pitch ten",
    "psychology ideas — range naturally across the full space of what matters to people.",
    "Draw from this category space and tag each idea's `category` with the exact",
    "snake_case id from the left column — e.g. `social_issues` (no brackets, no Arabic):",
    categoryMenu,
    "",
    overLine,
    "",
    "## Score every idea honestly on Regional Audience Fit",
    "Fill `audience_fit` with all nine 0-10 factors, judged for the GCC audience specifically.",
    "Use the FULL range — a niche idea can score low on curiosity even if you like it. This is",
    "what we rank on, so be a discerning board, not a cheerleader.",
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
    "1. Optimize for the best GCC podcast season — strongest opportunities first, breadth second.",
    "2. Tag each card's `category` with the best-fit id; fill all nine `audience_fit` factors honestly.",
    "3. Add a `regional_note` (why it lands in KSA/Kuwait/Iraq/GCC), a `viral_angle`, and a `debate_axis`.",
    "4. PHASE A — TOPICS ONLY. Always emit `\"guest\": null`.",
    "5. Respect the quality bar, identity anchors, editorial controls, and negative memory strictly.",
    "6. Output JSON only — a top-level array of candidates. No prose outside the array.",
    "",
    "## Output contract",
    `Array<${AUDIENCE_CANDIDATE_SHAPE}>`,
  ].join("\n")
}

export function buildAudienceFirstUserPrompt(input: CandidateGenInput): string {
  return [
    `Produce ${input.target_count} of the strongest Khat episode opportunities for the GCC`,
    `audience (KSA, Kuwait, Iraq, wider Gulf). Rank by Regional Audience Fit; range naturally`,
    `across categories without filling quotas. Score all nine audience_fit factors honestly.`,
    `Respond with a JSON array only.`,
  ].join("\n")
}
