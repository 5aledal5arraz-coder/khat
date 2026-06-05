/**
 * Khat Brain — bridge between Khat Map v2 and the EIR spine.
 *
 * Two responsibilities:
 *
 *   1. ensureEirForCandidate — idempotent "if this candidate has no
 *      EIR yet, create one and link both sides; otherwise return the
 *      existing EIR." Called from acceptance + conversion + backfill.
 *
 *   2. walkEirToPhase — advance an EIR through the linear forward
 *      chain by one or more steps. The state machine in lib/eir
 *      enforces single-step transitions; this helper composes them so
 *      callers can request the *target* phase without knowing the path.
 *
 * Both helpers stay strictly above lib/eir — they never touch the EIR
 * table directly. That keeps the audit trail honest: every transition
 * still flows through transitionEpisodePhase and lands in
 * eir_phase_transitions.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { khatMapEpisodeCandidates } from "@/lib/db/schema/khat-map"
import {
  createEpisodeIntelligenceRecord,
  getEpisodeIntelligenceRecord,
  transitionEpisodePhase,
  type EpisodePhase,
  type EpisodeIntelligenceRecord,
} from "@/lib/eir"
import {
  EPISODE_PHASES,
  type EditorialIntent,
} from "@/lib/db/schema/eir"
import type { KhatMapEpisodeCandidate } from "@/types/khat-map"

// ─── ensureEirForCandidate ─────────────────────────────────────────────

export interface EnsureEirInput {
  candidate: KhatMapEpisodeCandidate
  /** Falls back to the candidate's `suggested_guest_candidate_id`. */
  guestId?: string | null
  /** Optional admin id for created_by + transition actor. */
  adminId?: string | null
  /**
   * Override starting phase. Defaults to:
   *   - "guest_assigned" if a guest is attached
   *   - "guest_discovery" otherwise
   * Useful when the bridge is called late in the lifecycle (backfill).
   */
  initialPhase?: EpisodePhase
}

export interface EnsureEirResult {
  eir: EpisodeIntelligenceRecord
  /** True when this call created a fresh EIR; false on an idempotent hit. */
  created: boolean
}

/**
 * If the candidate already has `eir_id` and the row exists, return it
 * unchanged. Otherwise create a new EIR pre-filled from the candidate's
 * editorial fields and stamp `eir_id` back onto the candidate row.
 *
 * Always idempotent: parallel callers will at most create one EIR per
 * candidate (enforced by the unique partial index on
 * `khat_map_episode_candidates.eir_id`). If we lose the race we read
 * back the winner's row.
 */
export async function ensureEirForCandidate(
  input: EnsureEirInput,
): Promise<EnsureEirResult> {
  const { candidate } = input

  // Hot path — already linked.
  if (candidate.eir_id) {
    const existing = await getEpisodeIntelligenceRecord(candidate.eir_id)
    if (existing) return { eir: existing, created: false }
    // Stale link — fall through and create a fresh EIR.
  }

  const guestId = input.guestId ?? candidate.suggested_guest_candidate_id ?? null
  const initialPhase: EpisodePhase =
    input.initialPhase ?? (guestId ? "guest_assigned" : "guest_discovery")

  const editorialIntent: EditorialIntent = {
    hook: candidate.hook ?? null,
    why_matters: candidate.why_matters ?? null,
    why_now: candidate.why_now ?? null,
    goal: candidate.goal ?? null,
    description: candidate.description ?? null,
    main_axes: candidate.main_axes ?? [],
    suggested_questions: candidate.suggested_questions ?? [],
    production_notes: candidate.production_notes ?? null,
    source: "khat_map_candidate",
    source_id: candidate.id,
  }

  const eir = await createEpisodeIntelligenceRecord({
    phase: initialPhase,
    season_id: candidate.season_id,
    working_title: candidate.working_title,
    topic_domain: candidate.topic_domain,
    episode_type: candidate.episode_type,
    topic_angle_code: candidate.topic_angle_code,
    guest_id: null, // candidates point to khat_map_guest_candidates, not guests.
    editorial_intent: editorialIntent,
    risk_level: candidate.risk_level,
    effort_level: candidate.effort_level,
    created_by: input.adminId ?? null,
  })

  // Stamp the back-link. The unique partial index protects us from
  // creating two EIRs for the same candidate concurrently.
  try {
    await db!
      .update(khatMapEpisodeCandidates)
      .set({ eir_id: eir.id, updated_at: new Date() })
      .where(eq(khatMapEpisodeCandidates.id, candidate.id))
  } catch (err) {
    // If the unique-index race fires (PG error 23505), another caller
    // already linked this candidate. Read back the winner and dispose
    // of our duplicate EIR by archiving it.
    if (isUniqueViolation(err)) {
      await transitionEpisodePhase({
        eir_id: eir.id,
        to_phase: "archived",
        actor_id: input.adminId ?? null,
        reason: "lost ensureEirForCandidate race",
      })
      const reread = await freshCandidateById(candidate.id)
      if (reread?.eir_id) {
        const winner = await getEpisodeIntelligenceRecord(reread.eir_id)
        if (winner) return { eir: winner, created: false }
      }
    }
    throw err
  }

  return { eir, created: true }
}

// ─── walkEirToPhase ────────────────────────────────────────────────────

export interface WalkEirInput {
  eirId: string
  toPhase: EpisodePhase
  actorId?: string | null
  reason?: string | null
}

/**
 * Move an EIR forward through the linear chain until it reaches
 * `toPhase`. Each individual transition is validated by the state
 * machine, so requesting a target phase that's not reachable from the
 * current one (e.g. trying to walk an `archived` EIR) throws cleanly.
 *
 * Idempotent — if the EIR is already at `toPhase`, returns it unchanged.
 * No-ops for backwards requests are NOT supported; trying to walk
 * backwards throws.
 */
export async function walkEirToPhase(
  input: WalkEirInput,
): Promise<EpisodeIntelligenceRecord> {
  const eir = await getEpisodeIntelligenceRecord(input.eirId)
  if (!eir) throw new Error(`walkEirToPhase: EIR not found ${input.eirId}`)

  const fromIdx = EPISODE_PHASES.indexOf(eir.phase)
  const toIdx = EPISODE_PHASES.indexOf(input.toPhase)
  if (fromIdx < 0 || toIdx < 0) {
    throw new Error(`walkEirToPhase: unknown phase`)
  }
  if (fromIdx === toIdx) return eir
  if (toIdx < fromIdx) {
    throw new Error(
      `walkEirToPhase: cannot walk backwards from ${eir.phase} to ${input.toPhase}`,
    )
  }

  let current = eir
  for (let i = fromIdx + 1; i <= toIdx; i++) {
    const next = EPISODE_PHASES[i]
    // Skip the optional guest_discovery branch when walking from idea —
    // most callers want to land on guest_assigned, not bounce through
    // discovery first.
    if (current.phase === "idea" && next === "guest_discovery") continue
    current = await transitionEpisodePhase({
      eir_id: input.eirId,
      to_phase: next,
      actor_id: input.actorId ?? null,
      reason: input.reason ?? null,
    })
  }
  return current
}

// ─── Helpers ───────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "23505",
  )
}

async function freshCandidateById(id: string): Promise<{ eir_id: string | null } | null> {
  const rows = await db!
    .select({ eir_id: khatMapEpisodeCandidates.eir_id })
    .from(khatMapEpisodeCandidates)
    .where(eq(khatMapEpisodeCandidates.id, id))
    .limit(1)
  return rows[0] ?? null
}
