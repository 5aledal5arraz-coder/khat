/**
 * Phase X Step 2 — Novelty + quality filter for original-thinking topics.
 *
 * Implements the rejection rules from the brief:
 *   1. Title is generic (matches a banned-template pattern).
 *   2. Title is too similar to excludedTitles (normalized exact match).
 *   3. Emotional hook is weak (too short / banned cliché).
 *   4. Conflict is vague (too short / vague filler words only).
 *   5. Lens does not match output (lens key absent in registry).
 *   6. Title contains Kuwait-specific framing unless explicitly requested.
 *
 * Reasons are returned so the generator can log them and decide whether
 * to retry, ask for more candidates, or shrink the batch.
 *
 * v2 will swap normalized-title match for cosine-similarity over
 * embeddings. For now, normalized exact match is the contract.
 */

export type RejectionReason =
  | "generic_title"
  | "duplicate_title"
  | "weak_emotional_hook"
  | "vague_conflict"
  | "lens_mismatch"
  | "kuwait_bias"

export interface NoveltyContext {
  excludedTitles: string[]
  /** Set of valid lens keys from the registry. */
  validLensKeys: Set<string>
  /** Whether Kuwait-specific framing is allowed for this run. */
  allowKuwaitBias: boolean
}

export interface RejectionDecision {
  ok: boolean
  reasons: RejectionReason[]
}

/** Patterns that mark a title as generic / templated / self-help. */
const GENERIC_TITLE_PATTERNS: RegExp[] = [
  /^how to /i,
  /^x ways to /i,
  /^\d+ (?:tips|secrets|things|ways|lessons) (?:to|for|of) /i,
  /^things you (?:didn't know|never knew) /i,
  /^the truth about /i,
  /^why (?:everyone|everyone is|nobody) /i,
  /^the (?:ultimate|complete|definitive) guide to /i,
  /\b(?:hack|hacks|hacking)\s+(?:your|the)\b/i,
  /\bthe (?:secret|truth|key|art|power) of \w+ing\b/i,
  /\bunlock(?:ing)? your\b/i,
  /\b(?:transform|change) your life\b/i,
  /\blevel up\b/i,
  /\b(?:كيف|طرق|نصائح)\s+\d+\b/, // "كيف ٥ ..."
  /^\d+\s+(?:نصيحة|سر|طريقة|درس)/, // "5 طرق ..."
  /^أسرار\s+/, // "أسرار ..."
]

const KUWAIT_MARKERS: string[] = [
  "kuwait",
  "kuwaiti",
  "الكويت",
  "كويتي",
  "كويتية",
  "كويتيين",
  "kw",
  "مديرية ",
  "العاصمة الكويت",
]

/** Words that signal a hook with no actual emotional content. */
const WEAK_HOOK_PHRASES: string[] = [
  "we explore",
  "we discuss",
  "deep dive",
  "in this episode",
  "you'll learn",
  "تعرّف على",
  "نتحدث عن",
  "في هذه الحلقة",
  "نناقش",
]

/** Filler that signals a vague conflict statement. */
const VAGUE_CONFLICT_PHRASES: string[] = [
  "modern life",
  "society today",
  "balance work and life",
  "find yourself",
  "be the best version",
  "حياة عصرية",
  "المجتمع الحديث",
  "أفضل نسخة",
  "اكتشاف الذات",
]

const MIN_HOOK_LENGTH = 40 // chars
const MIN_CONFLICT_LENGTH = 35

export interface CandidateTopic {
  title: string
  lens: string
  philosophical_frame: string
  conflict: string
  emotional_hook: string
}

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, "") // Arabic diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function judgeCandidate(
  c: CandidateTopic,
  ctx: NoveltyContext,
): RejectionDecision {
  const reasons: RejectionReason[] = []

  // 1. Generic title patterns.
  if (GENERIC_TITLE_PATTERNS.some((re) => re.test(c.title))) {
    reasons.push("generic_title")
  }

  // 2. Duplicate against excluded titles (normalized exact match).
  const norm = normalizeTitle(c.title)
  if (
    norm.length === 0 ||
    ctx.excludedTitles.some((t) => normalizeTitle(t) === norm)
  ) {
    reasons.push("duplicate_title")
  }

  // 3. Weak emotional hook.
  const hook = c.emotional_hook?.trim() ?? ""
  const hookLower = hook.toLowerCase()
  if (
    hook.length < MIN_HOOK_LENGTH ||
    WEAK_HOOK_PHRASES.some((p) => hookLower.includes(p))
  ) {
    reasons.push("weak_emotional_hook")
  }

  // 4. Vague conflict.
  const conflict = c.conflict?.trim() ?? ""
  const conflictLower = conflict.toLowerCase()
  if (
    conflict.length < MIN_CONFLICT_LENGTH ||
    VAGUE_CONFLICT_PHRASES.some((p) => conflictLower.includes(p))
  ) {
    reasons.push("vague_conflict")
  }

  // 5. Lens key sanity.
  if (!c.lens || !ctx.validLensKeys.has(c.lens)) {
    reasons.push("lens_mismatch")
  }

  // 6. Kuwait bias (unless explicitly allowed).
  if (!ctx.allowKuwaitBias) {
    const titleLower = c.title.toLowerCase()
    const haystack = `${titleLower} ${conflictLower} ${hookLower}`
    if (KUWAIT_MARKERS.some((m) => haystack.includes(m))) {
      reasons.push("kuwait_bias")
    }
  }

  return { ok: reasons.length === 0, reasons }
}

export const REJECTION_RULES = {
  generic_title:
    "Title matches a banned template (how-to, listicle, secrets, hack-your-life, etc.).",
  duplicate_title:
    "Title (normalized) matches an excluded title or is empty after normalization.",
  weak_emotional_hook: `Emotional hook is shorter than ${MIN_HOOK_LENGTH} chars or contains an inert phrase like "we explore," "deep dive," "في هذه الحلقة."`,
  vague_conflict: `Conflict description is shorter than ${MIN_CONFLICT_LENGTH} chars or relies on vague filler ("modern life," "find yourself," "حياة عصرية").`,
  lens_mismatch: "Lens key is missing or not in the registry.",
  kuwait_bias:
    "Title/conflict/hook contains Kuwait-specific framing while the run did not request it.",
} as const
