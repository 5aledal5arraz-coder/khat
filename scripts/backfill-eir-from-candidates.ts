/**
 * Khat Brain Phase 2 — backfill existing Khat Map candidates with EIRs.
 *
 * Walks every Khat Map episode candidate that:
 *   - has no eir_id yet
 *   - is in a "high-value" status (approved, converted_to_preparation,
 *     converted_to_episode) — proposed/rejected/postponed candidates
 *     don't get EIRs because they're not in production
 *
 * For each, calls ensureEirForCandidate (which is idempotent + atomic)
 * and walks the EIR to the phase that matches the candidate's current
 * lifecycle status. Then, for converted candidates, stamps eir_id on
 * the linked preparation row.
 *
 * Project is pre-production — this is intentionally simple. It does NOT
 * try to backfill performance, decisions, fingerprints, or any other
 * Khat Map artifact. Just the spine.
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/backfill-eir-from-candidates.ts
 */

import { eq, inArray, and, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapEpisodeCandidates,
} from "@/lib/db/schema/khat-map"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { ensureEirForCandidate, walkEirToPhase } from "@/lib/khat-brain"
import { getEpisodeCandidateById } from "@/lib/khat-map/core/queries"
import type { KhatMapEpisodeCandidateStatus } from "@/types/khat-map"
import type { EpisodePhase } from "@/lib/eir"

// Map candidate status → EIR phase target. Anything not listed is
// excluded from backfill entirely.
const STATUS_TO_PHASE: Partial<Record<KhatMapEpisodeCandidateStatus, EpisodePhase>> = {
  approved: "guest_assigned",
  converted_to_preparation: "researching",
  converted_to_episode: "ready_to_publish",
}

interface RowSummary {
  candidate_id: string
  status: KhatMapEpisodeCandidateStatus
  prior_eir_id: string | null
  resulting_eir_id: string
  walked_to: EpisodePhase
  prep_stamped: boolean
}

async function main() {
  console.log("Khat Brain — EIR backfill\n")

  const eligibleStatuses = Object.keys(STATUS_TO_PHASE) as KhatMapEpisodeCandidateStatus[]
  const candidates = await db!
    .select()
    .from(khatMapEpisodeCandidates)
    .where(
      and(
        isNull(khatMapEpisodeCandidates.eir_id),
        inArray(khatMapEpisodeCandidates.status, eligibleStatuses),
      ),
    )

  console.log(`Found ${candidates.length} eligible candidates to backfill.\n`)
  if (candidates.length === 0) {
    console.log("Nothing to do.")
    process.exit(0)
  }

  const summaries: RowSummary[] = []

  for (const row of candidates) {
    const status = row.status as KhatMapEpisodeCandidateStatus
    const targetPhase = STATUS_TO_PHASE[status]
    if (!targetPhase) continue

    // Re-load via the mapper so the bridge sees a properly-typed object.
    const candidate = await getEpisodeCandidateById(row.id)
    if (!candidate) continue

    const { eir, created } = await ensureEirForCandidate({
      candidate,
      guestId: candidate.suggested_guest_candidate_id,
      adminId: null,
    })

    // Walk forward to the appropriate phase.
    const walked = await walkEirToPhase({
      eirId: eir.id,
      toPhase: targetPhase,
      actorId: null,
      reason: "backfill",
    })

    // Stamp eir_id on the linked preparation if present.
    let prepStamped = false
    if (candidate.converted_preparation_id) {
      const update = await db!
        .update(episodePreparations)
        .set({ eir_id: eir.id, updated_at: new Date() })
        .where(
          and(
            eq(episodePreparations.id, candidate.converted_preparation_id),
            isNull(episodePreparations.eir_id),
          ),
        )
        .returning({ id: episodePreparations.id })
      prepStamped = update.length > 0
    }

    summaries.push({
      candidate_id: candidate.id,
      status,
      prior_eir_id: created ? null : eir.id,
      resulting_eir_id: walked.id,
      walked_to: walked.phase,
      prep_stamped: prepStamped,
    })
  }

  // Group + report.
  const byStatus: Record<string, number> = {}
  let prepsStamped = 0
  for (const s of summaries) {
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1
    if (s.prep_stamped) prepsStamped++
  }

  console.log(`✅ Backfill complete.\n`)
  console.log(`Created/linked EIRs: ${summaries.length}`)
  for (const [status, n] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${n}`)
  }
  console.log(`Preparations stamped with eir_id: ${prepsStamped}`)

  // Final orphan check.
  const orphans = await db!
    .select({ id: khatMapEpisodeCandidates.id })
    .from(khatMapEpisodeCandidates)
    .where(
      and(
        isNull(khatMapEpisodeCandidates.eir_id),
        inArray(khatMapEpisodeCandidates.status, eligibleStatuses),
      ),
    )
  if (orphans.length > 0) {
    console.warn(
      `\n⚠️  ${orphans.length} eligible candidate(s) still without eir_id ` +
        `(possible races or transient errors — re-run to retry).`,
    )
  }

  process.exit(0)
}

main().catch((e) => {
  console.error("❌ backfill failed:", e)
  process.exit(1)
})
