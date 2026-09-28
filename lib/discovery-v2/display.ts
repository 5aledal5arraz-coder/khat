/**
 * Guest Discovery v2 — what the run page may SAY about a stored candidate.
 *
 * Pure and client-safe (no I/O), so the card and its tests share one rule.
 * Rows written before 2026-09-28 carry numbers and Wikidata facts the
 * scorer no longer trusts; these helpers make the page honest about both
 * without rewriting stored data.
 */

import type { StoryAssessment, V2Flag, V2ScoreKey } from "./types"

interface StoredCard {
  scores?: { unmeasured?: V2ScoreKey[] } | null
  story?: Pick<StoryAssessment, "status"> | null
  flags?: V2Flag[] | null
}

/**
 * Which score rows have no evidence behind them («غير مقيّم»). New rows
 * carry the list; an older row still gets the one inference that is
 * certain — a story that was never checked has no story score.
 */
export function unmeasuredScores(c: StoredCard): Set<V2ScoreKey> {
  const out = new Set<V2ScoreKey>(c.scores?.unmeasured ?? [])
  if (c.story?.status === "not_checked") out.add("story")
  return out
}

/**
 * True when the stored Wikidata facts belong to a CONFIDENT match. New rows
 * store no facts from an untrusted match at all; older rows did, and their
 * flags say so — a birth year or photo from a possible namesake is hidden.
 */
export function wikiFactsTrusted(c: StoredCard): boolean {
  const flags = c.flags ?? []
  return !flags.includes("identity_uncertain") && !flags.includes("identity_unverified")
}
