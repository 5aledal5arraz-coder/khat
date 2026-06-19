/**
 * Real-world audit — inspect a real Alpha-mode discovery run.
 *
 *   npm run audit:inspect-alpha -- <run_id>
 *   (or:  npx tsx scripts/audit-inspect-alpha-run.ts <run_id>)
 *
 * Polls the run until terminal (completed/failed/cancelled) or
 * timeout. Then reports:
 *
 *   - Run state machine path
 *   - candidate_count
 *   - For each candidate: name, status, dropped_reason, pipeline_version,
 *     identity_confidence, attribute_confidences.nationality / .gender,
 *     evidence_bundle citation count, recommendation_score
 *   - Aggregate metrics: % Alpha-tagged, mean identity_confidence,
 *     mean recommendation_score, attribute coverage, evidence_bundle
 *     density
 *
 * Writes JSON + Markdown reports to outputs/audit-results/<run_id>.{json,md}
 * Returns exit 0 on success, exit 2 if no Alpha-tagged candidates after
 * timeout (real failure signal).
 */

import { eq, desc, sql } from "drizzle-orm"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve as resolvePath } from "node:path"
import { db, closeDb } from "@/lib/db"
import {
  discoveryRuns,
  guestDiscoveryCandidates,
} from "@/lib/db/schema/discovery"

const TAG = "[audit-inspect-alpha]"
const POLL_INTERVAL_MS = 5_000
const MAX_WAIT_MS = 4 * 60_000 // 4 minutes — Alpha verify is LLM-bound

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
])

async function main(): Promise<void> {
  if (!db) {
    console.error(`${TAG} db is null`)
    process.exit(1)
  }

  const runId = process.argv[2]
  if (!runId) {
    console.error(`${TAG} usage: audit-inspect-alpha-run.ts <run_id>`)
    process.exit(1)
  }

  console.log(`${TAG} watching run ${runId}`)
  console.log(`${TAG} poll every ${POLL_INTERVAL_MS / 1000}s, max ${MAX_WAIT_MS / 1000}s`)

  const startedAt = Date.now()
  let lastStatus: string | null = null

  // ─── Poll until terminal ─────────────────────────────────────────
  while (true) {
    const [run] = await db
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, runId))
      .limit(1)
    if (!run) {
      console.error(`${TAG} run ${runId} disappeared`)
      await closeDb()
      process.exit(1)
    }

    if (run.status !== lastStatus) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      console.log(
        `${TAG}   [t=${elapsed}s] status=${run.status} candidate_count=${run.candidate_count}`,
      )
      lastStatus = run.status
    }

    if (TERMINAL_STATUSES.has(run.status)) break
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      console.warn(
        `${TAG} TIMEOUT — run still in '${run.status}' after ${MAX_WAIT_MS / 1000}s — proceeding with partial data`,
      )
      break
    }
    await sleep(POLL_INTERVAL_MS)
  }

  // ─── Fetch the final run row + jobs that ran for it ──────────────
  const [run] = await db
    .select()
    .from(discoveryRuns)
    .where(eq(discoveryRuns.id, runId))
    .limit(1)

  // Pull all candidates with the Alpha fields. We use explicit field
  // list so the LEGACY_COLUMNS / Alpha-aware projection logic in
  // candidates.ts doesn't apply — we want raw schema column reads
  // here for audit transparency.
  const candRows = await db
    .select()
    .from(guestDiscoveryCandidates)
    .where(eq(guestDiscoveryCandidates.discovery_run_id, runId))
    .orderBy(desc(guestDiscoveryCandidates.recommendation_score))

  const total = candRows.length
  const promoted = candRows.filter((c) => c.status !== "rejected").length
  const alphaTagged = candRows.filter(
    (c) => c.pipeline_version === "alpha",
  ).length
  const droppedByAlpha = candRows.filter((c) => c.dropped_reason).length
  const withIdConf = candRows.filter(
    (c) => c.identity_confidence !== null,
  ).length
  const withAttrConf = candRows.filter(
    (c) => c.attribute_confidences !== null,
  ).length
  const withBundle = candRows.filter(
    (c) => c.evidence_bundle !== null,
  ).length

  const meanIdConf =
    candRows.reduce(
      (a, c) => a + (c.identity_confidence ? Number(c.identity_confidence) : 0),
      0,
    ) / Math.max(1, withIdConf)
  const meanRec =
    candRows.reduce(
      (a, c) =>
        a + (c.recommendation_score ? Number(c.recommendation_score) : 0),
      0,
    ) / Math.max(1, withIdConf)

  console.log("")
  console.log(`${TAG} ═══════════════════════════════════════════════════════════════`)
  console.log(`${TAG} Audit results for run ${runId}`)
  console.log(`${TAG} ═══════════════════════════════════════════════════════════════`)
  console.log(`${TAG}   final status:           ${run?.status}`)
  console.log(`${TAG}   error_message:          ${run?.error_message ?? "(none)"}`)
  console.log(`${TAG}   total candidates:       ${total}`)
  console.log(`${TAG}   non-rejected:           ${promoted}`)
  console.log(`${TAG}   pipeline_version=alpha: ${alphaTagged}/${total} (${pct(alphaTagged, total)})`)
  console.log(`${TAG}   dropped_reason set:     ${droppedByAlpha}/${total} (${pct(droppedByAlpha, total)})`)
  console.log(`${TAG}   identity_confidence:    ${withIdConf}/${total} populated (mean=${meanIdConf.toFixed(3)})`)
  console.log(`${TAG}   attribute_confidences:  ${withAttrConf}/${total} populated`)
  console.log(`${TAG}   evidence_bundle:        ${withBundle}/${total} populated`)
  console.log(`${TAG}   recommendation_score:   mean=${meanRec.toFixed(3)} on populated rows`)
  console.log("")

  // ─── Per-candidate snapshot of top 10 by recommendation_score ────
  console.log(`${TAG} Top 10 candidates by recommendation_score:`)
  console.log(`${TAG} ───────────────────────────────────────────────────────────────`)
  for (const c of candRows.slice(0, 10)) {
    const attrs = c.attribute_confidences as
      | {
          nationality?: { value?: string | null; confidence?: number }
          gender?: { value?: string | null; confidence?: number }
        }
      | null
    console.log(`${TAG} - ${c.proposed_name ?? "(no name)"}`)
    console.log(`${TAG}     status=${c.status} pipeline=${c.pipeline_version ?? "legacy"}`)
    console.log(`${TAG}     id_conf=${valOrNa(c.identity_confidence)}`)
    if (attrs?.nationality) {
      console.log(
        `${TAG}     nationality=${attrs.nationality.value ?? "?"}@${(attrs.nationality.confidence ?? 0).toFixed(2)}`,
      )
    }
    if (attrs?.gender) {
      console.log(
        `${TAG}     gender=${attrs.gender.value ?? "?"}@${(attrs.gender.confidence ?? 0).toFixed(2)}`,
      )
    }
    console.log(
      `${TAG}     rec=${valOrNa(c.recommendation_score)}  fit=${valOrNa(c.editorial_fit_score)}  hidden=${valOrNa(c.hidden_gem_score)}`,
    )
    if (c.dropped_reason) {
      console.log(`${TAG}     dropped: ${c.dropped_reason}`)
    }
  }

  // ─── Count Alpha worker activity from jobs table ─────────────────
  // RWA-A4 — verify_candidate jobs carry payload->>'candidate_id',
  // not 'run_id', so we join through guest_discovery_candidates to
  // find verify jobs that belong to this run. search_archetype and
  // rank_candidates jobs do carry run_id directly.
  const verifyJobs = await db.execute(sql`
    SELECT j.id, j.type, j.status
      FROM jobs j
     WHERE (
            (j.type IN ('discovery.search_archetype','discovery.rank_candidates')
              AND j.payload->>'run_id' = ${runId})
            OR
            (j.type = 'discovery.verify_candidate'
              AND j.payload->>'candidate_id' IN (
                SELECT id FROM guest_discovery_candidates
                 WHERE discovery_run_id = ${runId}
              ))
           )
  `) as unknown as { rows: Array<{ id: string; type: string; status: string }> }

  const jobsByType: Record<string, Record<string, number>> = {}
  for (const j of verifyJobs.rows ?? []) {
    jobsByType[j.type] ??= {}
    jobsByType[j.type][j.status] = (jobsByType[j.type][j.status] ?? 0) + 1
  }
  console.log("")
  console.log(`${TAG} Jobs that ran for this run:`)
  for (const [type, byStatus] of Object.entries(jobsByType)) {
    console.log(`${TAG}   ${type}:`, byStatus)
  }

  // ─── Write outputs/audit-results/<run_id>.json + .md ─────────────
  const outDir = resolvePath(process.cwd(), "outputs", "audit-results")
  await mkdir(outDir, { recursive: true })
  const summary = {
    run_id: runId,
    final_status: run?.status ?? null,
    error_message: run?.error_message ?? null,
    metrics: {
      total,
      non_rejected: promoted,
      alpha_tagged: alphaTagged,
      dropped_by_alpha: droppedByAlpha,
      identity_confidence_populated: withIdConf,
      attribute_confidences_populated: withAttrConf,
      evidence_bundle_populated: withBundle,
      mean_identity_confidence: round3(meanIdConf),
      mean_recommendation_score: round3(meanRec),
    },
    jobs_by_type: jobsByType,
    candidates: candRows.map((c) => ({
      id: c.id,
      proposed_name: c.proposed_name,
      status: c.status,
      pipeline_version: c.pipeline_version,
      identity_confidence:
        c.identity_confidence === null ? null : Number(c.identity_confidence),
      attribute_confidences: c.attribute_confidences,
      evidence_bundle_citations:
        Array.isArray(
          (c.evidence_bundle as { citations?: unknown[] } | null)?.citations,
        )
          ? (c.evidence_bundle as { citations: unknown[] }).citations.length
          : 0,
      editorial_fit_score:
        c.editorial_fit_score === null ? null : Number(c.editorial_fit_score),
      hidden_gem_score:
        c.hidden_gem_score === null ? null : Number(c.hidden_gem_score),
      recommendation_score:
        c.recommendation_score === null
          ? null
          : Number(c.recommendation_score),
      dropped_reason: c.dropped_reason,
    })),
  }
  await writeFile(
    resolvePath(outDir, `${runId}.json`),
    JSON.stringify(summary, null, 2),
  )

  // Quick markdown summary for human-readable consumption
  const md = [
    `# Real-world audit — Alpha pipeline run`,
    "",
    `**Run id:** \`${runId}\``,
    `**Final status:** ${run?.status ?? "(unknown)"}`,
    run?.error_message ? `**Error:** ${run.error_message}` : "",
    "",
    `## Aggregate metrics`,
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| total candidates | ${total} |`,
    `| non-rejected | ${promoted} |`,
    `| pipeline_version="alpha" | ${alphaTagged}/${total} (${pct(alphaTagged, total)}) |`,
    `| dropped_reason populated | ${droppedByAlpha}/${total} |`,
    `| identity_confidence populated | ${withIdConf}/${total} (mean ${meanIdConf.toFixed(3)}) |`,
    `| attribute_confidences populated | ${withAttrConf}/${total} |`,
    `| evidence_bundle populated | ${withBundle}/${total} |`,
    `| recommendation_score mean | ${meanRec.toFixed(3)} |`,
    "",
    `## Top 10 candidates by recommendation_score`,
    "",
    "| Name | Status | Pipeline | id-conf | nat | gender | rec | dropped |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...candRows.slice(0, 10).map((c) => {
      const attrs = c.attribute_confidences as
        | {
            nationality?: { value?: string | null; confidence?: number }
            gender?: { value?: string | null; confidence?: number }
          }
        | null
      return [
        `| ${(c.proposed_name ?? "(no name)").replace(/\|/g, "\\|").slice(0, 40)}`,
        c.status,
        c.pipeline_version ?? "legacy",
        valOrNa(c.identity_confidence),
        attrs?.nationality
          ? `${attrs.nationality.value ?? "?"}@${(attrs.nationality.confidence ?? 0).toFixed(2)}`
          : "—",
        attrs?.gender
          ? `${attrs.gender.value ?? "?"}@${(attrs.gender.confidence ?? 0).toFixed(2)}`
          : "—",
        valOrNa(c.recommendation_score),
        c.dropped_reason ? c.dropped_reason.slice(0, 30) : "—",
        "|",
      ].join(" | ")
    }),
    "",
    `## Worker jobs that ran for this run`,
    "",
    "```json",
    JSON.stringify(jobsByType, null, 2),
    "```",
    "",
  ]
    .filter(Boolean)
    .join("\n")
  await writeFile(resolvePath(outDir, `${runId}.md`), md)

  console.log("")
  console.log(`${TAG} wrote outputs/audit-results/${runId}.json`)
  console.log(`${TAG} wrote outputs/audit-results/${runId}.md`)

  await closeDb()

  // Decision rule for exit code
  if (alphaTagged === 0 && total > 0) {
    console.error(
      `${TAG} REAL FAILURE — ${total} candidates exist but ZERO are pipeline_version="alpha". Alpha dispatch did not fire.`,
    )
    process.exit(2)
  }
  if (total === 0 && run?.status === "completed") {
    console.error(
      `${TAG} REAL FAILURE — run completed with 0 candidates. Sources may be misconfigured.`,
    )
    process.exit(2)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function valOrNa(v: string | number | null): string {
  if (v === null) return "—"
  return Number(v).toFixed(3)
}

function pct(num: number, denom: number): string {
  if (denom === 0) return "—"
  return `${((num / denom) * 100).toFixed(0)}%`
}

function round3(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round(v * 1000) / 1000
}

main().catch(async (err) => {
  console.error(`${TAG} fatal:`, err)
  try {
    await closeDb()
  } catch {}
  process.exit(1)
})
