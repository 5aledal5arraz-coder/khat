/**
 * Model end-of-life calendar — the "you are building on something that is
 * being switched off" signal.
 *
 * A retired model does not degrade gracefully: the provider starts returning
 * 404/400 for it and every task pinned to it fails at once. Because model ids
 * live in Settings overrides and `KHAT_AI_MODEL_<KIND>` env pins as well as in
 * `registry.ts`, nothing in the code review path notices that a pinned id has a
 * shutdown date. This table is that missing check.
 *
 * Deliberately a CODE file, not a table: retirement dates are published facts
 * about the outside world, they change by editing a constant, and putting them
 * in the DB would mean a migration plus a second source of truth that can go
 * stale in a way nobody reviews. Same reasoning as `EXTRA_PRICING`.
 *
 * Rules this file exists to enforce (see `findEolRisks`):
 *   • Warn at 30 days, not earlier. Something 80 days out that shouts every
 *     morning trains the operator to scroll past the banner — and then the
 *     one that matters gets scrolled past too.
 *   • Warn only about models we ACTUALLY depend on: currently selected for a
 *     task kind, or genuinely called in the recent window. A retirement date
 *     for a model we never invoke is trivia, not an alert.
 *
 * Adding an entry: put the provider's own published date in `retiresOn` and
 * record where it came from + when it was read in `source`. An undated claim
 * about the future is not evidence.
 */

import type { AiProvider } from "./types"

/** Warn only once a retirement is this close (or already past). */
export const EOL_WARN_DAYS = 30

export interface ModelRetirement {
  provider: AiProvider
  modelName: string
  /** Retirement date, ISO `YYYY-MM-DD`, interpreted as UTC. */
  retiresOn: string
  /** Provenance: which published source, read on which date. */
  source: string
}

/**
 * Seeded with the retirements that are confirmed and dated. OpenAI's GPT-5.6
 * family has no published shutdown date yet, so it is deliberately absent —
 * an empty entry would be a guess, and a guessed date here produces a false
 * alarm that costs more trust than the warning is worth.
 */
export const MODEL_RETIREMENTS: readonly ModelRetirement[] = [
  /**
   * ── THE `gemini-2.5-*` ENTRIES WERE REMOVED, NOT FORGOTTEN ──────────────
   * They carried `2026-10-16`, read 2026-07-24. Re-checked on 2026-08-07
   * against the same publisher — https://ai.google.dev/gemini-api/docs/deprecations
   * — and all three of `gemini-2.5-flash`, `gemini-2.5-pro` and
   * `gemini-2.5-flash-lite` now read **"No shutdown date announced"**.
   * Google withdrew the date.
   *
   * Keeping it would have fired the EOL_WARN_DAYS banner on 2026-09-16 for a
   * retirement that is not happening — and the note at the top of this file
   * is explicit that a false alarm costs more trust than the warning is
   * worth. An undated model is simply absent from this list; that is the
   * design, not a gap.
   */
  {
    // Read 2026-08-07: a REAL date that this list was missing, and the model
    // is reachable today through EXTRA_PRICING + a Settings override.
    provider: "gemini",
    modelName: "gemini-3.1-flash-lite",
    retiresOn: "2027-05-07",
    source:
      "ai.google.dev/gemini-api/docs/deprecations, read 2026-08-07 — replacement: gemini-3.5-flash-lite",
  },
  {
    // ALREADY RETIRED, and still sitting in EXTRA_PRICING in registry.ts —
    // which is exactly how a dead model stays reachable via a Settings
    // override without anything objecting.
    provider: "gemini",
    modelName: "gemini-2.0-flash",
    retiresOn: "2026-06-01",
    source: "ai.google.dev/gemini-api/docs/deprecations, read 2026-08-07 — replacement: gemini-3.6-flash",
  },
]

/** Why a retirement made it onto the operator's screen. */
export type EolReason = "selected" | "used"

export interface EolRisk {
  provider: AiProvider
  modelName: string
  retiresOn: string
  /** Whole days from `now` to the retirement date. Negative = already past. */
  daysLeft: number
  /** True once the date has passed — the model is gone, not "going". */
  retired: boolean
  /** `selected` (pinned for a task kind now) outranks `used` (called recently). */
  reason: EolReason
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Whole days from `now` until an ISO date, both floored to UTC midnight so the
 * answer doesn't flicker with the time of day the page happens to be loaded.
 * Returns null for an unparseable date rather than a misleading number.
 */
export function daysUntil(retiresOn: string, now: Date): number | null {
  const target = Date.parse(`${retiresOn}T00:00:00Z`)
  if (!Number.isFinite(target)) return null
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target - today) / MS_PER_DAY)
}

/**
 * The retirements an operator should act on right now.
 *
 * A model qualifies only when BOTH hold:
 *   1. it is within `EOL_WARN_DAYS` of its date (or already past it), and
 *   2. we depend on it — currently selected for some task kind, or actually
 *      called in the caller's recent-usage window.
 *
 * Pure: the caller supplies the two dependency sets and `now`, so this is
 * directly unit-testable and has no clock or DB of its own.
 */
export function findEolRisks(input: {
  /** Model ids currently resolved for a task kind (registry/env/Settings). */
  selectedModels: Iterable<string>
  /** Model ids with at least one real call in the recent window. */
  recentlyUsedModels: Iterable<string>
  now: Date
  /** Test seam — defaults to the published table above. */
  retirements?: readonly ModelRetirement[]
}): EolRisk[] {
  const selected = new Set(input.selectedModels)
  const used = new Set(input.recentlyUsedModels)
  const table = input.retirements ?? MODEL_RETIREMENTS

  const risks: EolRisk[] = []
  for (const entry of table) {
    // Dependency test first: it's cheaper, and it's the condition that keeps
    // this list short enough to stay readable.
    const reason: EolReason | null = selected.has(entry.modelName)
      ? "selected"
      : used.has(entry.modelName)
        ? "used"
        : null
    if (!reason) continue

    const daysLeft = daysUntil(entry.retiresOn, input.now)
    if (daysLeft === null) continue
    if (daysLeft > EOL_WARN_DAYS) continue

    risks.push({
      provider: entry.provider,
      modelName: entry.modelName,
      retiresOn: entry.retiresOn,
      daysLeft,
      retired: daysLeft < 0,
      reason,
    })
  }
  // Most urgent first — already-retired models sort to the top by construction.
  return risks.sort((a, b) => a.daysLeft - b.daysLeft)
}
