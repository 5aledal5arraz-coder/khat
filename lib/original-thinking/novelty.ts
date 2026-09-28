/**
 * Phase X Step 2 — Novelty + quality filter for original-thinking topics.
 *
 * Implements the rejection rules from the brief:
 *   1. Title is generic (matches a banned-template pattern).
 *   2. Title is too similar to excludedTitles (normalized exact match).
 *   3. Emotional hook is weak (too short / banned cliché).
 *   4. Conflict is vague (too short / vague filler words only).
 *   5. Lens does not match output (lens key absent in registry).
 *   6. (retired 2026-09-28) Kuwait-specific framing. The constitution's
 *      audience rule replaced it: pan-Arab titles, but the story may be
 *      Kuwaiti-rooted — a Kuwaiti guest's own words tripped this rule.
 *      `kuwait_bias` stays in the type for stored rejections only.
 *   7. The constitution's avoid list — the deterministic policy lexicon
 *      (politics, religious/sectarian dispute, scandal) over title + hook.
 *
 * Reasons are returned so the generator can log them and decide whether
 * to retry, ask for more candidates, or shrink the batch.
 *
 * v2 will swap normalized-title match for cosine-similarity over
 * embeddings. For now, normalized exact match is the contract.
 */

import { lexiconPolicyHits } from "@/lib/khat-map/core/policy"

export type RejectionReason =
  | "generic_title"
  | "duplicate_title"
  | "weak_emotional_hook"
  | "vague_conflict"
  | "lens_mismatch"
  | "kuwait_bias"
  | "policy_avoid"

export interface NoveltyContext {
  excludedTitles: string[]
  /** Set of valid lens keys from the registry. */
  validLensKeys: Set<string>
  /** Kept for callers; no rule reads it since the constitution (see rule 6). */
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

  // 6. (retired) Kuwait bias — see the header.

  // 7. The constitution's avoid list.
  if (lexiconPolicyHits(`${c.title}. ${hook}`).length > 0) {
    reasons.push("policy_avoid")
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
  policy_avoid:
    "Topic text hits the constitution's avoid lexicon (politics, religious/sectarian dispute, scandal).",
  kuwait_bias:
    "(retired 2026-09-28 — the constitution's audience rule replaced it) Title/conflict/hook contained Kuwait-specific framing.",
} as const
