/**
 * Real-world audit — UI render validation.
 *
 *   npx tsx scripts/audit-ui-promote-then-revert.ts <action>
 *     where <action> ∈ { promote | revert }
 *
 * Strategy: the audit caught one real Kuwaiti name (تركي الشمري) with
 * nationality detected at 0.40, but identity_confidence stayed at 0.09
 * due to single-platform evidence. The Alpha pipeline correctly marked
 * it `rejected` with `dropped_reason = person_class_below_threshold`.
 * Because listCandidates filters out `rejected` by default, the new
 * Alpha card never renders on /admin/discovery so we can't see how it
 * looks with real data.
 *
 * For UI-render validation only, this script temporarily flips ONE
 * Alpha-tagged candidate's status to `proposed` so the main page shows
 * its card. After the operator screenshots it, run with `revert` to
 * restore the original status.
 *
 * Cosmetic operation; only the visibility flag changes. No data is
 * created or destroyed.
 */

import { eq, and, isNotNull, desc } from "drizzle-orm"
import { db, closeDb } from "@/lib/db"
import { guestDiscoveryCandidates } from "@/lib/db/schema/discovery"

const TAG = "[audit-ui-promote-then-revert]"
// We keep the original status here so revert puts it back exactly.
// The original is always "rejected" because that's the only status
// the Alpha pipeline produces for sub-threshold rows.
const PRE_STATE = "rejected" as const

async function main(): Promise<void> {
  const action = process.argv[2]
  if (action !== "promote" && action !== "revert") {
    console.error(`${TAG} usage: ... promote | revert`)
    process.exit(1)
  }
  if (!db) {
    console.error(`${TAG} db is null`)
    process.exit(1)
  }

  // Pick the strongest Alpha-tagged candidate by nationality confidence.
  // We use a raw SQL slice because nationality is in jsonb.
  const rows = await db
    .select({
      id: guestDiscoveryCandidates.id,
      proposed_name: guestDiscoveryCandidates.proposed_name,
      status: guestDiscoveryCandidates.status,
      pipeline_version: guestDiscoveryCandidates.pipeline_version,
      identity_confidence: guestDiscoveryCandidates.identity_confidence,
      attribute_confidences: guestDiscoveryCandidates.attribute_confidences,
      recommendation_score: guestDiscoveryCandidates.recommendation_score,
    })
    .from(guestDiscoveryCandidates)
    .where(
      and(
        eq(guestDiscoveryCandidates.pipeline_version, "alpha"),
        isNotNull(guestDiscoveryCandidates.attribute_confidences),
      ),
    )
    .orderBy(desc(guestDiscoveryCandidates.recommendation_score))
    .limit(20)

  // Pick the row with the highest nationality.confidence
  let best: (typeof rows)[0] | null = null
  let bestNatConf = -1
  for (const r of rows) {
    const a = (r.attribute_confidences ?? {}) as {
      nationality?: { confidence?: number }
    }
    const conf = a.nationality?.confidence ?? 0
    if (conf > bestNatConf) {
      bestNatConf = conf
      best = r
    }
  }

  if (!best) {
    console.error(`${TAG} no Alpha-tagged candidate found`)
    await closeDb()
    process.exit(1)
  }

  console.log(`${TAG} chosen candidate:`)
  console.log(`${TAG}   id:                   ${best.id}`)
  console.log(`${TAG}   name:                 ${best.proposed_name}`)
  console.log(`${TAG}   current status:       ${best.status}`)
  console.log(`${TAG}   pipeline_version:     ${best.pipeline_version}`)
  console.log(`${TAG}   identity_confidence:  ${best.identity_confidence}`)
  console.log(`${TAG}   nationality conf:     ${bestNatConf}`)
  console.log("")

  if (action === "promote") {
    if (best.status !== PRE_STATE) {
      console.warn(
        `${TAG} WARN: row not in expected pre-state '${PRE_STATE}' — found '${best.status}'`,
      )
    }
    await db
      .update(guestDiscoveryCandidates)
      .set({ status: "proposed", updated_at: new Date() })
      .where(eq(guestDiscoveryCandidates.id, best.id))
    console.log(`${TAG} → flipped status: ${best.status} → 'proposed'`)
    console.log(`${TAG}   Now navigate to http://localhost:3000/admin/discovery`)
    console.log(`${TAG}   The Alpha card should render with badges.`)
    console.log("")
    console.log(`AUDIT_UI_CANDIDATE_ID=${best.id}`)
  } else {
    // revert
    await db
      .update(guestDiscoveryCandidates)
      .set({ status: PRE_STATE, updated_at: new Date() })
      .where(eq(guestDiscoveryCandidates.id, best.id))
    console.log(`${TAG} → restored status to '${PRE_STATE}'`)
  }

  await closeDb()
}

main().catch(async (err) => {
  console.error(`${TAG} fatal:`, err)
  try {
    await closeDb()
  } catch {}
  process.exit(1)
})
