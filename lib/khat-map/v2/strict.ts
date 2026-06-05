/**
 * Strict mode — angle-bank bias for the Khat Map v2 batch engine.
 *
 * When the admin picks "Strict (No AI)" at setup, the engine:
 *   1. Queries the topic bank for angles that are both `status='active'`
 *      and `freshness='fresh'` — i.e. canonical angles that haven't been
 *      burned in a recent season.
 *   2. Subtracts any angle_code already used in THIS season (accepted
 *      candidates' `topic_angle_code` values).
 *   3. If the remaining count is less than the number of slots still to
 *      fill, throws `AngleBankExhaustedError` — the server action
 *      translates this into the `ANGLE_BANK_EXHAUSTED` error code so
 *      the UI can surface the "switch mode" CTA.
 *   4. Otherwise returns the usable angle codes + their titles — these
 *      go into the prompt as a hard constraint, and the post-filter
 *      drops any candidate whose `topic_angle_code` is not in the set.
 *
 * No silent fallback. Per PR4 decision, an exhausted bank hard-stops.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapTopicBank,
  khatMapEpisodeCandidates,
  khatMapSeasonDecisions,
} from "@/lib/db/schema/khat-map"
import type { KhatMapTopicDomain } from "@/types/khat-map"

export class AngleBankExhaustedError extends Error {
  readonly code = "ANGLE_BANK_EXHAUSTED"
  constructor(
    public readonly available: number,
    public readonly required: number,
  ) {
    super(
      `Angle bank exhausted: ${available} fresh angles available, ${required} still needed`,
    )
    this.name = "AngleBankExhaustedError"
  }
}

export interface StrictAngleOption {
  angle_code: string
  title: string
  description: string | null
  episode_type: string | null
  category: string | null
  domain: KhatMapTopicDomain | null
}

/**
 * Fetch fresh/active angle codes eligible for this season. Excludes any
 * angle already referenced by an accepted candidate in THIS season
 * (so the admin can't pick the same angle twice).
 *
 * Returns candidate options the caller can feed into the prompt.
 */
export async function listStrictAngleOptions(
  season_id: string,
): Promise<StrictAngleOption[]> {
  // 1. All fresh + active angles in the bank.
  const bank = await db!
    .select()
    .from(khatMapTopicBank)
    .where(
      and(
        eq(khatMapTopicBank.status, "active"),
        eq(khatMapTopicBank.freshness, "fresh"),
        isNotNull(khatMapTopicBank.angle_code),
      ),
    )

  // 2. Angle codes already consumed this season (via accepted candidates).
  const acceptedIds = await db!
    .select({
      topic_candidate_id: khatMapSeasonDecisions.topic_candidate_id,
    })
    .from(khatMapSeasonDecisions)
    .where(
      and(
        eq(khatMapSeasonDecisions.season_id, season_id),
        eq(khatMapSeasonDecisions.kind, "accept"),
      ),
    )
  const topicIds = acceptedIds
    .map((r) => r.topic_candidate_id)
    .filter((x): x is string => x !== null)
  const usedCodes = new Set<string>()
  if (topicIds.length > 0) {
    const rows = await db!
      .select({
        angle_code: khatMapEpisodeCandidates.topic_angle_code,
      })
      .from(khatMapEpisodeCandidates)
      .where(inArray(khatMapEpisodeCandidates.id, topicIds))
    for (const r of rows) {
      if (r.angle_code) usedCodes.add(r.angle_code)
    }
  }

  return bank
    .filter((r) => r.angle_code && !usedCodes.has(r.angle_code))
    .map((r) => ({
      angle_code: r.angle_code!,
      title: r.title,
      description: r.description,
      episode_type: r.episode_type,
      category: r.category,
      domain: (r.category as KhatMapTopicDomain | null) ?? null,
    }))
}

/**
 * Throw if the fresh pool can't cover the remaining slots. `required`
 * is typically `remainingSlots` — we need at least that many distinct
 * fresh angles so each card lands on a unique bank entry.
 */
export function assertStrictBankSufficient(
  options: StrictAngleOption[],
  required: number,
): void {
  if (options.length < required) {
    throw new AngleBankExhaustedError(options.length, required)
  }
}

/**
 * Render a compact, prompt-ready list of strict angle codes the LLM
 * MUST pick from. Keeps the system prompt readable — titles and codes
 * only, no full descriptions (those would blow up the context).
 */
export function buildStrictAngleBlock(
  options: StrictAngleOption[],
  max: number,
): string {
  if (options.length === 0) return ""
  const head = options.slice(0, max)
  const lines = head.map(
    (o) => `  · ${o.angle_code} — ${o.title}${o.episode_type ? ` [${o.episode_type}]` : ""}`,
  )
  return [
    "## Strict angle bank (MUST pick from — no exceptions)",
    `You are in STRICT mode. Every card's topic_angle_code MUST be one of the codes below — VERBATIM. Do NOT invent new angle codes. Do NOT propose topics that don't map to one of these codes. If none fit the requested role, pick the closest and reduce editorial_score to reflect the fit.`,
    ...lines,
  ].join("\n")
}

/**
 * Post-filter: drop any candidate whose topic_angle_code isn't in the
 * allowed set. Returns `{kept, dropped}` so the caller can log or
 * surface the drop count.
 */
export function filterByStrictAngles<
  T extends { topic: { topic_angle_code: string | null } },
>(candidates: T[], allowedCodes: Set<string>): { kept: T[]; dropped: T[] } {
  const kept: T[] = []
  const dropped: T[] = []
  for (const c of candidates) {
    if (c.topic.topic_angle_code && allowedCodes.has(c.topic.topic_angle_code)) {
      kept.push(c)
    } else {
      dropped.push(c)
    }
  }
  return { kept, dropped }
}
