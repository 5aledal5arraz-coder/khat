/**
 * CTO audit — pre-flight probe.
 *
 * Reports current AI router state and existing season inventory so the
 * full audit run knows what's possible.
 */

import { sql, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { aiRuns } from "@/lib/db/schema/ai-runs"
import { khatMapSeasons } from "@/lib/db/schema/khat-map"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"

async function main() {
  if (!db) {
    console.error("DB unavailable")
    process.exit(1)
  }

  console.log("══════════════════════════════════════════════════════════")
  console.log(" KHAT CTO AUDIT — pre-flight probe")
  console.log(" date:", new Date().toISOString())
  console.log("══════════════════════════════════════════════════════════")

  // 1. Recent AI runs — quota check.
  console.log("\n── recent AI runs (last 10) ─────────────────────────────")
  const recent = await db
    .select({
      id: aiRuns.id,
      task_kind: aiRuns.task_kind,
      model_name: aiRuns.model_name,
      status: aiRuns.status,
      error_class: aiRuns.error_class,
      error_message: aiRuns.error_message,
      cost_usd: aiRuns.cost_usd,
      started_at: aiRuns.started_at,
    })
    .from(aiRuns)
    .orderBy(desc(aiRuns.started_at))
    .limit(10)
  for (const r of recent) {
    const ts =
      r.started_at instanceof Date
        ? r.started_at.toISOString().slice(0, 19)
        : "—"
    const err = r.error_message ? ` err="${r.error_message.slice(0, 80)}"` : ""
    console.log(
      `  ${ts} ${r.task_kind.padEnd(28)} ${r.model_name.padEnd(15)} ${r.status.padEnd(10)}${err}`,
    )
  }

  // 2. Last 7 days success / failure ratio.
  console.log("\n── 7-day AI run summary ─────────────────────────────────")
  const summary = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'succeeded')::int AS ok,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE error_class = 'quota_exceeded' OR error_message LIKE '%429%' OR error_message LIKE '%quota%')::int AS quota,
      ROUND(SUM(cost_usd)::numeric, 4) AS total_cost
    FROM ai_runs
    WHERE started_at >= NOW() - INTERVAL '7 days'
  `)
  console.log("  rows:", JSON.stringify(summary.rows[0]))

  // 3. Existing seasons.
  console.log("\n── seasons inventory ────────────────────────────────────")
  const seasons = await db
    .select({
      id: khatMapSeasons.id,
      name: khatMapSeasons.name,
      status: khatMapSeasons.status,
      target_episode_count: khatMapSeasons.target_episode_count,
      v2_mode: khatMapSeasons.v2_mode,
      created_at: khatMapSeasons.created_at,
    })
    .from(khatMapSeasons)
    .orderBy(desc(khatMapSeasons.created_at))
    .limit(8)
  for (const s of seasons) {
    const ts =
      s.created_at instanceof Date ? s.created_at.toISOString().slice(0, 10) : "—"
    console.log(
      `  ${ts} ${s.id.slice(0, 8)} ${(s.name ?? "(unnamed)").padEnd(40)} status=${(s.status ?? "—").padEnd(10)} target=${s.target_episode_count ?? "—"} mode=${s.v2_mode ?? "—"}`,
    )
  }

  // 4. EIR phase distribution.
  console.log("\n── EIR phase distribution ──────────────────────────────")
  const phases = await db.execute(sql`
    SELECT phase, COUNT(*)::int AS n
    FROM episode_intelligence_records
    GROUP BY phase
    ORDER BY n DESC
  `)
  for (const row of phases.rows) {
    console.log(`  ${(row as { phase: string }).phase.padEnd(20)} ${(row as { n: number }).n}`)
  }

  // 5. Latest 10 EIRs.
  console.log("\n── latest EIRs ─────────────────────────────────────────")
  const latest = await db
    .select({
      id: episodeIntelligenceRecords.id,
      working_title: episodeIntelligenceRecords.working_title,
      phase: episodeIntelligenceRecords.phase,
      season_id: episodeIntelligenceRecords.season_id,
      created_at: episodeIntelligenceRecords.created_at,
    })
    .from(episodeIntelligenceRecords)
    .orderBy(desc(episodeIntelligenceRecords.created_at))
    .limit(10)
  for (const e of latest) {
    const ts =
      e.created_at instanceof Date ? e.created_at.toISOString().slice(0, 10) : "—"
    const title = (e.working_title ?? "—").slice(0, 50)
    console.log(`  ${ts} ${e.id.slice(0, 8)} phase=${(e.phase ?? "—").padEnd(20)} ${title}`)
  }

  console.log("\n══════════════════════════════════════════════════════════")
  process.exit(0)
}

main().catch((err) => {
  console.error("probe failed:", err)
  process.exit(1)
})
