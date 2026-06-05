/**
 * Phase Beta — Editorial Voice Fingerprint.
 *
 * Two responsibilities:
 *   1. captureVoiceSignal — write one row to editorial_voice_signals
 *      whenever the operator takes an action on a candidate.
 *   2. buildSeasonFingerprint — aggregate prior signals into a
 *      per-season vector: which archetypes / topic-domains the operator
 *      systematically accepts, which they systematically reject.
 *
 * Phase Beta CAPTURES + AGGREGATES but does NOT yet feed back into the
 * archetype seeder. Phase Gamma uses the fingerprint to bias seedArchetypes.
 *
 * The fingerprint is a small, season-scoped vector — never grows
 * unbounded:
 *
 *   {
 *     season_id,
 *     archetype_weights: {<archetype_id>: <ratio in [-1, 1]>},
 *     topic_domain_weights: {<domain>: <ratio in [-1, 1]>},
 *     pipeline_lift: {alpha: number, legacy: number},
 *     signal_count: number,
 *     latest_signal_at: ISO string | null
 *   }
 *
 *   ratio = (accepts - rejects) / (accepts + rejects)
 *
 * Ratios in [-1, 0] mean "this operator rejects this category"; ratios
 * in [0, 1] mean "this operator accepts this category." Categories
 * with fewer than 3 signals are reported but flagged as low-confidence.
 */

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  editorialVoiceSignals,
  type EditorialVoiceSignalType,
  type EditorialVoiceSnapshot,
} from "@/lib/db/schema/editorial-voice"

export const VOICE_FINGERPRINT_VERSION = "beta-voice-1" as const

const MIN_CATEGORY_SIGNALS = 3

export interface CaptureVoiceSignalInput {
  seasonId: string
  candidateId: string
  signalType: EditorialVoiceSignalType
  /**
   * The candidate row at the time of the action. We snapshot the
   * archetype + scores so future schema changes don't poison the
   * fingerprint history.
   */
  snapshot: EditorialVoiceSnapshot
  weight?: number
  note?: string | null
  actorId?: string | null
}

/**
 * Append-only writer. Returns false silently if DB is null so server
 * actions can fire-and-forget without breaking the user flow.
 */
export async function captureVoiceSignal(
  input: CaptureVoiceSignalInput,
): Promise<boolean> {
  if (!db) return false
  try {
    await db.insert(editorialVoiceSignals).values({
      season_id: input.seasonId,
      candidate_id: input.candidateId,
      signal_type: input.signalType,
      snapshot: input.snapshot as unknown as Record<string, unknown>,
      weight: (input.weight ?? 1.0).toString(),
      note: input.note ?? null,
      actor_id: input.actorId ?? null,
    })
    return true
  } catch (err) {
    // We deliberately swallow errors — the fingerprint is best-effort
    // telemetry, not a correctness path. Logging is fine.
    console.warn(
      "[voice-fingerprint] capture failed:",
      err instanceof Error ? err.message : err,
    )
    return false
  }
}

export interface SeasonVoiceFingerprint {
  season_id: string
  archetype_weights: Record<string, { ratio: number; signal_count: number; confident: boolean }>
  topic_domain_weights: Record<string, { ratio: number; signal_count: number; confident: boolean }>
  pipeline_lift: { alpha: number; legacy: number }
  signal_count: number
  latest_signal_at: string | null
  version: string
}

/**
 * Read all signals for a season, group by category, and report
 * accept/reject ratios. Pure aggregation — no inference, no learning.
 */
export async function buildSeasonFingerprint(
  seasonId: string,
): Promise<SeasonVoiceFingerprint> {
  const empty: SeasonVoiceFingerprint = {
    season_id: seasonId,
    archetype_weights: {},
    topic_domain_weights: {},
    pipeline_lift: { alpha: 0, legacy: 0 },
    signal_count: 0,
    latest_signal_at: null,
    version: VOICE_FINGERPRINT_VERSION,
  }
  if (!db) return empty
  const rows = await db
    .select({
      signal_type: editorialVoiceSignals.signal_type,
      snapshot: editorialVoiceSignals.snapshot,
      weight: editorialVoiceSignals.weight,
      created_at: editorialVoiceSignals.created_at,
    })
    .from(editorialVoiceSignals)
    .where(eq(editorialVoiceSignals.season_id, seasonId))
    .orderBy(desc(editorialVoiceSignals.created_at))
    .limit(500)
  if (rows.length === 0) return empty

  const archetypeAggregate: Record<string, { pos: number; neg: number }> = {}
  const domainAggregate: Record<string, { pos: number; neg: number }> = {}
  let alphaCount = 0
  let legacyCount = 0
  for (const r of rows) {
    const s = (r.snapshot ?? null) as EditorialVoiceSnapshot | null
    const w = Number(r.weight)
    const positive =
      r.signal_type === "accept" ||
      r.signal_type === "promote" ||
      r.signal_type === "save_for_later"
    const aid = s?.archetype_id ?? null
    if (aid) {
      archetypeAggregate[aid] ??= { pos: 0, neg: 0 }
      if (positive) archetypeAggregate[aid].pos += w
      else archetypeAggregate[aid].neg += w
    }
    const td = s?.topic_domain ?? null
    if (td) {
      domainAggregate[td] ??= { pos: 0, neg: 0 }
      if (positive) domainAggregate[td].pos += w
      else domainAggregate[td].neg += w
    }
    if (s?.pipeline_version === "alpha") alphaCount += w
    else legacyCount += w
  }

  const arcOut: SeasonVoiceFingerprint["archetype_weights"] = {}
  for (const [k, { pos, neg }] of Object.entries(archetypeAggregate)) {
    const total = pos + neg
    if (total === 0) continue
    arcOut[k] = {
      ratio: round3((pos - neg) / total),
      signal_count: Math.round(total),
      confident: total >= MIN_CATEGORY_SIGNALS,
    }
  }
  const domOut: SeasonVoiceFingerprint["topic_domain_weights"] = {}
  for (const [k, { pos, neg }] of Object.entries(domainAggregate)) {
    const total = pos + neg
    if (total === 0) continue
    domOut[k] = {
      ratio: round3((pos - neg) / total),
      signal_count: Math.round(total),
      confident: total >= MIN_CATEGORY_SIGNALS,
    }
  }

  return {
    season_id: seasonId,
    archetype_weights: arcOut,
    topic_domain_weights: domOut,
    pipeline_lift: { alpha: round3(alphaCount), legacy: round3(legacyCount) },
    signal_count: rows.length,
    latest_signal_at: rows[0]?.created_at?.toISOString() ?? null,
    version: VOICE_FINGERPRINT_VERSION,
  }
}

/**
 * Compute the snapshot block from a candidate record + run. Pure
 * helper so the capture site doesn't need to assemble it inline.
 */
export function buildSnapshotFromCandidate(
  cand: {
    archetype?: { id?: string; name?: string } | null
    editorial_fit_score?: number | null
    hidden_gem_score?: number | null
    identity_confidence?: number | null
    pipeline_version?: string | null
  },
  topicDomain?: string | null,
): EditorialVoiceSnapshot {
  return {
    archetype_id: cand.archetype?.id ?? null,
    archetype_name: cand.archetype?.name ?? null,
    topic_domain: topicDomain ?? null,
    editorial_fit_score:
      cand.editorial_fit_score ?? null,
    hidden_gem_score: cand.hidden_gem_score ?? null,
    identity_confidence: cand.identity_confidence ?? null,
    pipeline_version: cand.pipeline_version === "alpha" ? "alpha" : null,
  }
}

function round3(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round(v * 1000) / 1000
}

