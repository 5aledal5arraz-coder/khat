/**
 * Production-readiness fix sprint — final audit on the fresh season.
 *
 * Reads the qa-fresh season created by qa-fresh-season-test.ts and
 * dumps every column the audit cares about: candidate scores, risk +
 * effort, guest details, EIR phases, prep V2 presence, AI runs telemetry.
 *
 * Pure read — no DB writes.
 */

import { sql, eq, desc, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
} from "@/lib/db/schema/khat-map"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { aiRuns } from "@/lib/db/schema/ai-runs"

async function main() {
  if (!db) {
    console.error("DB unavailable")
    process.exit(1)
  }

  const [season] = await db
    .select()
    .from(khatMapSeasons)
    .where(sql`name LIKE 'qa-fresh%'`)
    .orderBy(desc(khatMapSeasons.created_at))
    .limit(1)
  if (!season) {
    console.error("no fresh season found")
    process.exit(1)
  }

  console.log("════════════════════════════════════════════════════════════")
  console.log(" FRESH SEASON AUDIT — post-billing-fix")
  console.log(` season: ${season.id}`)
  console.log(` name: ${season.name}`)
  console.log("════════════════════════════════════════════════════════════")

  const cands = await db
    .select()
    .from(khatMapEpisodeCandidates)
    .where(eq(khatMapEpisodeCandidates.season_id, season.id))
    .orderBy(desc(khatMapEpisodeCandidates.composite_score))
  console.log(`\n── candidates: ${cands.length} ──`)
  for (const c of cands) {
    console.log(
      `  ${c.id.slice(0, 8)} status=${c.status.padEnd(28)} score=${c.composite_score === null ? "null" : Number(c.composite_score).toFixed(3)} risk=${(c.risk_level ?? "—").padEnd(8)} effort=${(c.effort_level ?? "—").padEnd(8)} domain=${(c.topic_domain ?? "—").padEnd(20)} type=${c.episode_type ?? "—"}`,
    )
    console.log(`         title    : ${(c.working_title ?? "").slice(0, 80)}`)
    console.log(
      `         hook     : ${(c.hook ?? "").slice(0, 80)}`,
    )
    console.log(
      `         rationale: ${c.composite_score_rationale ?? "—"}`,
    )
  }

  // Guest candidates.
  const guests = await db
    .select()
    .from(khatMapGuestCandidates)
    .where(eq(khatMapGuestCandidates.season_id, season.id))
  console.log(`\n── guest_candidates: ${guests.length} ──`)
  for (const g of guests) {
    const isStub = (g.risk_flags ?? []).includes("stub_needs_replacement")
    console.log(
      `  ${g.id.slice(0, 8)} ${isStub ? "STUB" : "REAL"} archetype=${(g.category ?? "—").padEnd(20)} relevance=${g.relevance_score ?? "—"}`,
    )
    console.log(`         name : ${g.full_name}`)
    if (g.bio) console.log(`         bio  : ${g.bio.slice(0, 100)}`)
    if (g.why_fit) console.log(`         fit  : ${g.why_fit.slice(0, 100)}`)
  }

  // EIRs.
  const eirs = await db
    .select()
    .from(episodeIntelligenceRecords)
    .where(eq(episodeIntelligenceRecords.season_id, season.id))
  console.log(`\n── EIRs: ${eirs.length} ──`)
  for (const e of eirs) {
    console.log(
      `  ${e.id.slice(0, 8)} phase=${(e.phase ?? "—").padEnd(20)} risk=${(e.risk_level ?? "—").padEnd(8)} effort=${(e.effort_level ?? "—").padEnd(8)} ${(e.working_title ?? "").slice(0, 60)}`,
    )
  }

  // Preparations + prep V2 presence.
  const eirIds = eirs.map((e) => e.id)
  const preps =
    eirIds.length > 0
      ? await db
          .select()
          .from(episodePreparations)
          .where(inArray(episodePreparations.eir_id, eirIds))
      : []
  console.log(`\n── preparations: ${preps.length} ──`)
  let withV2 = 0
  for (const p of preps) {
    const v2 = p.prep_v2 as Record<string, unknown> | null
    if (v2) {
      withV2++
      const sens = (v2.sensitive_zones as string[] | undefined) ?? []
      const qb = (v2.question_bank as Array<Record<string, unknown>> | undefined) ?? []
      console.log(
        `  ${p.id.slice(0, 8)} eir=${p.eir_id?.slice(0, 8) ?? "—"} v2=YES axes=${(v2.axes_of_tension as string[] ?? []).length} qs=${qb.length} (must_ask=${qb.filter((q) => q.priority === "must_ask").length}) sens=${sens.length}`,
      )
      console.log(`         thesis    : ${(v2.thesis as string | undefined ?? "").slice(0, 80)}`)
      if (sens.length > 0) {
        for (const s of sens.slice(0, 3))
          console.log(`         sens.zone : ${(s ?? "").slice(0, 80)}`)
      }
    } else {
      console.log(
        `  ${p.id.slice(0, 8)} eir=${p.eir_id?.slice(0, 8) ?? "—"} v2=NULL`,
      )
    }
  }
  console.log(`\n  preps with v2: ${withV2}/${preps.length}`)

  // AI runs tied to this season.
  const runs = await db
    .select({
      task_kind: aiRuns.task_kind,
      model_name: aiRuns.model_name,
      status: aiRuns.status,
      cost_usd: aiRuns.cost_usd,
      latency_ms: aiRuns.latency_ms,
      error_class: aiRuns.error_class,
    })
    .from(aiRuns)
    .where(eq(aiRuns.season_id, season.id))
    .orderBy(desc(aiRuns.started_at))
  console.log(`\n── ai_runs tagged season_id: ${runs.length} ──`)
  let cost = 0
  let okN = 0
  let failedN = 0
  for (const r of runs) {
    cost += Number(r.cost_usd ?? 0)
    if (r.status === "succeeded") okN++
    else if (r.status === "failed") failedN++
  }
  console.log(
    `  ok=${okN}  failed=${failedN}  total_cost=$${cost.toFixed(4)}`,
  )
  // Show first 8 + summary by task_kind.
  const byKind = new Map<string, number>()
  for (const r of runs) {
    byKind.set(r.task_kind ?? "—", (byKind.get(r.task_kind ?? "—") ?? 0) + 1)
  }
  console.log(
    "  by task_kind:",
    [...byKind.entries()].map(([k, v]) => `${k}=${v}`).join(", "),
  )

  console.log("\n════════════════════════════════════════════════════════════\n")
  process.exit(0)
}

main().catch((err) => {
  console.error("audit failed:", err)
  process.exit(1)
})
