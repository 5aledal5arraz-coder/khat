/**
 * Shared creative brief — the archetype / boldness / anti-cliché / novelty /
 * diversity doctrine that BOTH season-topic generators use:
 *   • the editorial batch engine (prompts-editorial.ts, generateBatch)
 *   • the guided-mode hybrid engine (lib/ai/prompts/hybrid-topics.ts)
 *
 * Keeping it here means "what makes a Khat topic creative" is defined once and
 * stays consistent across engines. Pure string builders + shared constants.
 */

/** The nine episode SHAPES. A great season is diverse in shape, not just subject. */
export const ARCHETYPE_IDS = [
  "personal_story",
  "hidden_world",
  "contrarian",
  "taboo",
  "investigation",
  "cultural_moment",
  "big_idea",
  "reframe",
  "provocation",
] as const

export type ArchetypeId = (typeof ARCHETYPE_IDS)[number]

/** The `archetype` output-field spec, reused verbatim in both engines' contracts. */
export const ARCHETYPE_FIELD_SPEC =
  'one of "personal_story"|"hidden_world"|"contrarian"|"taboo"|"investigation"|"cultural_moment"|"big_idea"|"reframe"|"provocation" (the SHAPE of the episode)'

export function buildArchetypesBlock(): string {
  return [
    "# Episode Archetypes — the SHAPE of an episode (span them; don't stack one)",
    "Subject ≠ shape. Two episodes about 'money' can be a personal-story and an",
    "investigation — utterly different experiences. Pick the archetype that makes each",
    "idea magnetic, and make the BATCH span many archetypes. Repeating one shape (esp.",
    "the abstract 'big_idea' panel) is the #1 way a season feels samey.",
    "",
    "  · personal_story — one human at the centre: a lived experience, a transformation,",
    "                     a life most listeners have never lived from the inside.",
    "  · hidden_world   — a subculture, profession, or system outsiders never see: how it",
    "                     really works, its unwritten rules, who wins and who loses.",
    "  · contrarian     — challenges something 'everyone knows'. The counter-intuitive",
    "                     truth, argued credibly — not contrarian for its own sake.",
    "  · taboo          — عيب: what people avoid saying out loud in Gulf/Arab society, opened",
    "                     with honesty and care (not shock). The relief of naming it.",
    "  · investigation  — a mystery, an unexplained pattern, a 'how did this happen': true-",
    "                     crime energy, a thread pulled until something surprising appears.",
    "  · cultural_moment— a live phenomenon reshaping how people think, love, work, or",
    "                     believe RIGHT NOW — captured before anyone else names it.",
    "  · big_idea       — a deep concept/question that reframes how you see the world. Use",
    "                     sparingly and only when genuinely fresh — this is the overused one.",
    "  · reframe        — take something utterly familiar and reveal it isn't what you",
    "                     thought. The 'wait… really?' episode.",
    "  · provocation    — a real two-sided tension people will argue about for days.",
  ].join("\n")
}

export function buildOriginalityBlock(): string {
  return [
    "## Originality is the job (read twice)",
    "A batch of similar topics is a FAILURE, even if each one is individually fine. Your",
    "FIRST idea for any theme is the one every other podcast already made — discard it and",
    "find the specific, human, surprising version underneath. Aim for topics that make even",
    "a well-read listener think 'I've never heard anyone talk about that' or 'wait, is that",
    "true?'. Depth is universal: a science, business, or history idea can be as magnetic as",
    "a psychology one — do NOT default to introspective/philosophical framing.",
  ].join("\n")
}

export function buildBannedShapesBlock(): string {
  return [
    "## BANNED shapes (the generic defaults — never pitch these)",
    "- 'الخليج + [macro trend]' panels: post-oil economy, digital transformation, green",
    "  transition, the future of jobs/AI, 'youth between ambition and frustration',",
    "  'mental-health awareness' — these are the exact clichés that make a season feel dead.",
    "- explainer-of-a-Wikipedia-topic; awareness-campaign framing; empty self-help /",
    "  finance / wellness; low-value controversy for its own sake; anything shallow enough",
    "  to be worthless in a year; clickbait / tabloid.",
    "If your idea smells like a conference session or a newspaper op-ed headline, kill it.",
  ].join("\n")
}

export function buildBoldnessDialBlock(): string {
  return [
    "## The boldness dial (this batch)",
    "Aim ≈ 70% FRESH ANGLES ON RESONANT THEMES (proven to pull Arab listeners — taboo,",
    "psychology, true-crime/mystery, power, identity, money, faith, love — but via an angle",
    "nobody's done) + ≈ 30% WHITE SPACE (underexplored territory, contrarian takes, hidden",
    "worlds). Include at least ONE genuine WILDCARD: a topic no other Arabic podcast would",
    "think to make, that you'd personally fight to record. A safe batch is a failed batch.",
  ].join("\n")
}

export function buildResonanceEngineBlock(): string {
  return [
    "## The resonance engine (build each topic on at least one)",
    "Great episodes run on a real ENGINE, not a subject label: a genuine tension · a personal",
    "stake · a taboo named out loud · a hidden world opened · a credible contrarian claim · a",
    "'wait, really?' reframe · a mystery pulled apart. If a topic has none of these, it's an",
    "article, not an episode.",
  ].join("\n")
}
