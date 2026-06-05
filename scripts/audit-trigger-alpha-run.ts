/**
 * Real-world audit — trigger a real Alpha-mode discovery run.
 *
 *   npm run audit:trigger-alpha
 *   (or:  npx tsx scripts/audit-trigger-alpha-run.ts)
 *
 * Bypasses the admin UI (which we can't drive because Chrome MCP is
 * offline and Chrome is at tier "read") and exercises the same code
 * path the operator's "ابدأ تشغيلاً جديداً" button hits:
 *
 *   1. Resolve a real EIR (Operator Day #2 era — known good)
 *   2. Insert a real discovery_runs row pointed at its season +
 *      source_episode_candidate
 *   3. Enqueue discovery.seed_archetypes against the running worker
 *      (which is now running with KHAT_GUEST_DISCOVERY_V2=1)
 *
 * The worker picks up the job within a few seconds, generates
 * archetypes, fans out search jobs, verifies candidates through Alpha
 * (identity_confidence + attribute_confidences + evidence_bundle +
 * recommendation_score), and writes them to guest_discovery_candidates.
 *
 * Print the new run id at the end so the inspect script can poll it.
 */

import { and, eq } from "drizzle-orm"
import { db, closeDb } from "@/lib/db"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { khatMapEpisodeCandidates } from "@/lib/db/schema/khat-map"
import { discoveryRuns } from "@/lib/db/schema/discovery"
import { createDiscoveryRun } from "@/lib/discovery"
import { enqueueJob } from "@/lib/jobs/queue"

// Known-good EIR from Operator Day #2 (the same one URL-encoded earlier
// in /admin/discovery?eirId=f1c501f5-fd57-49b8-97bb-d3876b67ed82).
const PRIMARY_EIR_ID = "f1c501f5-fd57-49b8-97bb-d3876b67ed82"
const TAG = "[audit-trigger-alpha]"

async function main(): Promise<void> {
  if (!db) {
    console.error(`${TAG} db is null — DATABASE_URL not configured`)
    process.exit(1)
  }

  // ─── 1. Resolve the EIR ──────────────────────────────────────────
  const [eir] = await db
    .select({
      id: episodeIntelligenceRecords.id,
      season_id: episodeIntelligenceRecords.season_id,
      working_title: episodeIntelligenceRecords.working_title,
      topic_domain: episodeIntelligenceRecords.topic_domain,
      editorial_intent: episodeIntelligenceRecords.editorial_intent,
    })
    .from(episodeIntelligenceRecords)
    .where(eq(episodeIntelligenceRecords.id, PRIMARY_EIR_ID))
    .limit(1)

  if (!eir) {
    console.error(`${TAG} EIR ${PRIMARY_EIR_ID} not found — pick a real EIR id and rerun`)
    await closeDb()
    process.exit(1)
  }

  console.log(`${TAG} resolved EIR ${eir.id}`)
  console.log(`${TAG}   season_id    = ${eir.season_id ?? "(none)"}`)
  console.log(`${TAG}   working_title = ${eir.working_title}`)
  console.log(`${TAG}   topic_domain  = ${eir.topic_domain ?? "(none)"}`)

  // ─── 2. Look up the season's editorial_controls.guest_filters ────
  // so we exercise the SAME filter-inheritance path the UI uses.
  const { khatMapSeasons } = await import("@/lib/db/schema/khat-map")
  const [season] = eir.season_id
    ? await db
        .select({ editorial_controls: khatMapSeasons.editorial_controls })
        .from(khatMapSeasons)
        .where(eq(khatMapSeasons.id, eir.season_id))
        .limit(1)
    : []
  const controls = (season?.editorial_controls ?? null) as
    | { guest_filters?: { gender?: string; nationality?: string } }
    | null
  const gender =
    controls?.guest_filters?.gender === "male" ||
    controls?.guest_filters?.gender === "female"
      ? controls.guest_filters.gender
      : "male" // Real-world audit default — Operator Day #2 used male
  const nationality =
    controls?.guest_filters?.nationality === "kuwaiti" ||
    controls?.guest_filters?.nationality === "non_kuwaiti"
      ? controls.guest_filters.nationality
      : "kuwaiti" // Operator Day #2 default
  console.log(
    `${TAG}   filters: gender=${gender}, nationality=${nationality}`,
  )

  // ─── 3. Find the matching episode candidate id ───────────────────
  // (the bridge column on guest_discovery_candidates +
  // discovery_runs.source_episode_candidate_id points here)
  // editorial_intent.source_id is the canonical link — same logic the
  // discovery action uses.
  const intent = (eir.editorial_intent ?? {}) as { source_id?: string | null }
  const sourceEpisodeCandidateId = intent.source_id ?? null
  console.log(
    `${TAG}   source_episode_candidate_id = ${sourceEpisodeCandidateId ?? "(none)"}`,
  )

  // ─── 4. Build the seed prompt the same way the UI does ───────────
  const intentObj = (eir.editorial_intent ?? {}) as Record<string, unknown>
  const hook = typeof intentObj.hook === "string" ? intentObj.hook : ""
  const whyMatters =
    typeof intentObj.why_matters === "string" ? intentObj.why_matters : ""
  const parts: string[] = [`بحث عن ضيف للحلقة: ${eir.working_title}`]
  if (eir.topic_domain) parts.push(`مجال: ${eir.topic_domain}`)
  if (hook) parts.push(`الخطّاف: ${hook}`)
  if (whyMatters) parts.push(`لماذا يهم: ${whyMatters}`)
  const seedPrompt = parts.join(" · ").slice(0, 1200)
  console.log(`${TAG}   seedPrompt = ${seedPrompt.slice(0, 100)}…`)

  // ─── 5. Insert the run + enqueue seed_archetypes ─────────────────
  // Smaller count (4 archetypes) to keep audit cycle time short.
  //
  // RWA-B1 — first real audit pass with youtube + google_web alone
  // returned 12 YouTube channel titles, zero real people. Alpha
  // correctly dropped all 12. The recall problem is source-side,
  // not classifier-side. Enable the Phase Beta sources I built:
  //   • editorial  — iTunes podcast guest extraction works without
  //                  Brave key (tier 1). Tier 2 newspaper queries
  //                  no-op silently when Brave key absent.
  //   • network    — DB-only; mines prior promoted candidates from
  //                  the same season for name mentions. Free.
  //   • public_voice — Brave-only; skipped when key absent
  //                    (no-ops cleanly).
  const ALPHA_PLATFORMS = [
    "youtube",
    "google_web",
    "editorial",
    "network",
    "public_voice",
  ] as const
  const ARCHETYPE_COUNT = 4

  const run = await createDiscoveryRun({
    season_id: eir.season_id,
    source_episode_candidate_id: sourceEpisodeCandidateId,
    seed_prompt: seedPrompt,
    source_config: {
      platforms: [...ALPHA_PLATFORMS] as never,
      candidates_per_archetype: 3,
      gender,
      nationality,
      source_episode_candidate_id: sourceEpisodeCandidateId,
      source_episode_working_title: eir.working_title,
      source_episode_topic_domain: eir.topic_domain ?? null,
      hiddenness_preference: "balanced",
    },
    created_by: "audit-trigger-alpha",
  })

  console.log(`${TAG} created discovery_run ${run.id}`)

  await enqueueJob(
    "discovery.seed_archetypes",
    {
      run_id: run.id,
      count: ARCHETYPE_COUNT,
      seed_prompt: seedPrompt,
    },
    { priority: 5, maxAttempts: 2 },
  )

  console.log(`${TAG} enqueued discovery.seed_archetypes for run ${run.id}`)
  console.log("")
  console.log(`AUDIT_RUN_ID=${run.id}`)

  await closeDb()
}

main().catch(async (err) => {
  console.error(`${TAG} fatal:`, err)
  try {
    await closeDb()
  } catch {}
  process.exit(1)
})
