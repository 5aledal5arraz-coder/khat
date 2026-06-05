/**
 * CTO audit — deep season inspection.
 *
 * Audits the most recent fully-AI-generated season ("الموسم 9999" / id
 * 1697ccfa) plus its sibling seasons. For each season we surface:
 *   - candidates by status (proposed / approved / rejected / converted)
 *   - editorial scores + topic_domain distribution
 *   - guest candidate suggestions
 *   - decisions journal
 *   - linked EIRs + their phases
 *   - linked preparation rows + prep_v2 presence
 *
 * Then it attempts a fresh test season + hybrid run to document the
 * end-to-end path including any current-state failures.
 */

import { sql, desc, eq, asc, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
  khatMapSeasonDecisions,
} from "@/lib/db/schema/khat-map"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { aiRuns } from "@/lib/db/schema/ai-runs"

const TARGET_SEASON_NAMES = [
  "الموسم 9999 — خريطة استكشاف",
  "الموسم 9998 — خريطة استكشاف",
  "الموسم 9997 — خريطة استكشاف",
]

function trunc(s: string | null | undefined, n: number): string {
  if (!s) return "—"
  return s.length > n ? s.slice(0, n) + "…" : s
}

async function auditSeason(seasonId: string, name: string) {
  if (!db) return
  console.log("\n══════════════════════════════════════════════════════════")
  console.log(` SEASON: ${name}`)
  console.log(` id: ${seasonId}`)
  console.log("══════════════════════════════════════════════════════════")

  const [season] = await db
    .select()
    .from(khatMapSeasons)
    .where(eq(khatMapSeasons.id, seasonId))
    .limit(1)
  if (!season) {
    console.log("  ❌ season not found")
    return
  }
  console.log(
    `\n  status=${season.status} target=${season.target_episode_count} mode=${season.v2_mode ?? "—"} created=${season.created_at?.toISOString().slice(0, 10)}`,
  )

  // ── Candidates ─────────────────────────────────────────────────────
  const cands = await db
    .select()
    .from(khatMapEpisodeCandidates)
    .where(eq(khatMapEpisodeCandidates.season_id, seasonId))
    .orderBy(asc(khatMapEpisodeCandidates.created_at))
  console.log(`\n  ── candidates: ${cands.length} ─────────────────────`)
  const byStatus = new Map<string, number>()
  for (const c of cands) {
    byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1)
  }
  console.log(
    "  status counts:",
    [...byStatus.entries()].map(([k, v]) => `${k}=${v}`).join(", "),
  )

  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]
    console.log(`\n  ── candidate ${i + 1}/${cands.length} ─────────────`)
    console.log(`     id        ${c.id.slice(0, 8)}`)
    console.log(`     status    ${c.status}`)
    console.log(`     domain    ${c.topic_domain ?? "—"}`)
    console.log(`     type      ${c.episode_type ?? "—"}`)
    console.log(`     angle     ${c.topic_angle_code ?? "—"}`)
    console.log(`     score     ${c.composite_score ?? "—"}`)
    console.log(`     title     ${c.working_title}`)
    if (c.eir_id) console.log(`     eir_id    ${c.eir_id.slice(0, 8)}`)
    if (c.suggested_guest_candidate_id)
      console.log(`     guest_cand ${c.suggested_guest_candidate_id.slice(0, 8)}`)
    if (c.converted_preparation_id)
      console.log(`     prep_id   ${c.converted_preparation_id.slice(0, 8)}`)

    // The candidate schema does not declare `editorial_intent` (that
    // field lives on the EIR). The audit script intentionally peeks
    // for it via runtime — cast through `unknown` to satisfy strict TS.
    const intent =
      (c as unknown as { editorial_intent?: Record<string, unknown> | null })
        .editorial_intent ?? null
    if (intent) {
      console.log(`     hook      ${trunc((intent.hook as string) ?? null, 100)}`)
      console.log(`     why       ${trunc((intent.why_matters as string) ?? null, 100)}`)
      console.log(`     why_now   ${trunc((intent.why_now as string) ?? null, 100)}`)
      console.log(`     goal      ${trunc((intent.goal as string) ?? null, 100)}`)
      const axes = intent.main_axes as string[] | undefined
      if (axes && axes.length > 0) {
        console.log(`     axes      [${axes.length}] ${axes.map((a) => trunc(a, 40)).join(" · ")}`)
      }
      const qs = intent.suggested_questions as string[] | undefined
      if (qs && qs.length > 0) {
        console.log(`     qs        [${qs.length}] first: ${trunc(qs[0], 80)}`)
      }
      if (intent.production_notes) {
        console.log(`     prod_note ${trunc(intent.production_notes as string, 100)}`)
      }
    }
    // `hybrid_provenance` is not on the candidate schema today —
    // the audit script reads it opportunistically through a runtime
    // cast for legacy/seed data that may carry the field.
    const prov =
      (c as unknown as { hybrid_provenance?: Record<string, unknown> | null })
        .hybrid_provenance ?? null
    if (prov) {
      console.log(
        `     prov      market="${trunc((prov.market_inspiration as string) ?? null, 50)}" lens="${trunc((prov.original_lens as string) ?? null, 50)}" strength=${prov.strength_score ?? "—"}`,
      )
    }
  }

  // ── Guest candidates ──────────────────────────────────────────────
  const guests = await db
    .select()
    .from(khatMapGuestCandidates)
    .where(eq(khatMapGuestCandidates.season_id, seasonId))
  console.log(`\n  ── guest candidates: ${guests.length} ──────────────────`)
  for (const g of guests) {
    // The audit prints a few fields that don't exist on the strict
    // guest-candidate schema (`archetype`, `proposed_name`,
    // `proposed_bio`, `composite_score`). They were earlier prototypes
    // or live on related tables. Cast through `unknown` so the script
    // keeps reading whatever happens to be on the row at runtime.
    const gx = g as unknown as Record<string, unknown>
    console.log(
      `     ${g.id.slice(0, 8)} status=${g.status ?? "—"} archetype=${gx.archetype ?? gx.category ?? "—"} score=${gx.composite_score ?? gx.relevance_score ?? "—"}`,
    )
    console.log(`              name: ${gx.proposed_name ?? gx.full_name ?? "—"}`)
    const bio = (gx.proposed_bio ?? gx.bio) as string | undefined | null
    if (bio) console.log(`              bio:  ${trunc(bio, 120)}`)
  }

  // ── Decisions ─────────────────────────────────────────────────────
  const decisions = await db
    .select()
    .from(khatMapSeasonDecisions)
    .where(eq(khatMapSeasonDecisions.season_id, seasonId))
    .orderBy(asc(khatMapSeasonDecisions.created_at))
  console.log(`\n  ── decisions journal: ${decisions.length} entries ─────`)
  const byKind = new Map<string, number>()
  for (const d of decisions) byKind.set(d.kind, (byKind.get(d.kind) ?? 0) + 1)
  console.log(
    "  kinds:",
    [...byKind.entries()].map(([k, v]) => `${k}=${v}`).join(", "),
  )
  for (const d of decisions.slice(-10)) {
    // Schema fields are `target` and `reason_text` — older versions of
    // the audit referenced `target_kind` / `reason`. Read both via a
    // permissive cast so the script is resilient to either shape.
    const dx = d as unknown as Record<string, unknown>
    const target = (dx.target_kind ?? dx.target ?? "—") as string
    const reason = (dx.reason ?? dx.reason_text ?? null) as string | null
    console.log(
      `     ${d.created_at?.toISOString().slice(0, 16)} kind=${d.kind} target=${target} reason=${trunc(reason, 80)}`,
    )
  }

  // ── Linked EIRs ───────────────────────────────────────────────────
  const eirs = await db
    .select()
    .from(episodeIntelligenceRecords)
    .where(eq(episodeIntelligenceRecords.season_id, seasonId))
  console.log(`\n  ── linked EIRs: ${eirs.length} ────────────────────────`)
  for (const e of eirs) {
    console.log(
      `\n     ${e.id.slice(0, 8)} phase=${(e.phase ?? "—").padEnd(20)} ${trunc(e.working_title, 80)}`,
    )
    const intent = e.editorial_intent as Record<string, unknown> | null
    if (intent) {
      console.log(`        domain    ${e.topic_domain ?? "—"}`)
      console.log(`        type      ${e.episode_type ?? "—"}`)
      console.log(`        risk      ${e.risk_level ?? "—"}`)
      console.log(`        effort    ${e.effort_level ?? "—"}`)
      console.log(`        hook      ${trunc((intent.hook as string) ?? null, 110)}`)
      console.log(`        why       ${trunc((intent.why_matters as string) ?? null, 110)}`)
      console.log(`        why_now   ${trunc((intent.why_now as string) ?? null, 110)}`)
      console.log(`        goal      ${trunc((intent.goal as string) ?? null, 110)}`)
      const axes = intent.main_axes as string[] | undefined
      if (axes && axes.length > 0) {
        console.log(`        axes      [${axes.length}]`)
        for (const ax of axes.slice(0, 5)) console.log(`                  · ${trunc(ax, 90)}`)
      }
      const qs = intent.suggested_questions as string[] | undefined
      if (qs && qs.length > 0) {
        console.log(`        qs        [${qs.length}]`)
        for (const q of qs.slice(0, 3)) console.log(`                  · ${trunc(q, 90)}`)
      }
      if (intent.production_notes) {
        console.log(`        prod      ${trunc(intent.production_notes as string, 110)}`)
      }
    } else {
      console.log(`        ⚠️  editorial_intent is null`)
    }
  }

  // ── Linked preparations ───────────────────────────────────────────
  if (eirs.length > 0) {
    const eirIds = eirs.map((e) => e.id)
    const preps = await db
      .select({
        id: episodePreparations.id,
        eir_id: episodePreparations.eir_id,
        title: episodePreparations.title,
        status: episodePreparations.status,
        prep_v2: episodePreparations.prep_v2,
      })
      .from(episodePreparations)
      .where(inArray(episodePreparations.eir_id, eirIds))
    console.log(`\n  ── linked preparations: ${preps.length} ──────────`)
    for (const p of preps) {
      const v2 = p.prep_v2 as Record<string, unknown> | null
      console.log(
        `\n     prep ${p.id.slice(0, 8)} (eir ${p.eir_id?.slice(0, 8) ?? "—"}) status=${p.status ?? "—"}`,
      )
      console.log(`        title:  ${trunc(p.title, 80)}`)
      if (v2) {
        const axes = (v2.axes_of_tension as string[] | undefined) ?? []
        const qb = (v2.question_bank as Array<Record<string, unknown>> | undefined) ?? []
        const sens = (v2.sensitive_zones as string[] | undefined) ?? []
        const opens = (v2.opening_options as Array<{ approach: string; text: string }> | undefined) ?? []
        const sections = (v2.episode_sections as Array<Record<string, unknown>> | undefined) ?? []
        const host = v2.host_guidance as { overall_tone?: string; do_list?: string[]; dont_list?: string[] } | undefined
        const dir = v2.director_guidance as { shot_priorities?: string[] } | undefined
        console.log(`        prep_v2 version=${v2.generator_version ?? "?"} mins=${v2.total_estimated_minutes ?? "—"}`)
        console.log(`        thesis: ${trunc(v2.thesis as string, 110)}`)
        console.log(`        axes:   [${axes.length}] ${axes.slice(0, 3).map((a) => trunc(a, 40)).join(" · ")}`)
        console.log(`        sens:   [${sens.length}] ${sens.slice(0, 3).map((s) => trunc(s, 40)).join(" · ")}`)
        console.log(`        opens:  [${opens.length}] first: ${trunc(opens[0]?.text ?? null, 80)}`)
        console.log(`        sections:[${sections.length}]`)
        console.log(`        qbank:  [${qb.length}] must_ask=${qb.filter((q) => q.priority === "must_ask").length}`)
        console.log(`        host:   tone="${trunc(host?.overall_tone ?? null, 60)}" do=[${host?.do_list?.length ?? 0}] dont=[${host?.dont_list?.length ?? 0}]`)
        console.log(`        dir:    shots=[${dir?.shot_priorities?.length ?? 0}]`)
      } else {
        console.log(`        ⚠️  prep_v2 is null`)
      }
    }
  }

  // ── AI runs tied to this season's EIRs (ai_runs has no season_id) ─
  // Audit finding: there's no season_id link on ai_runs. We can only
  // approximate by joining through eir_id.
  const eirIdsForRuns = eirs.map((e) => e.id)
  const runs =
    eirIdsForRuns.length > 0
      ? await db
          .select({
            task_kind: aiRuns.task_kind,
            model_name: aiRuns.model_name,
            status: aiRuns.status,
            cost_usd: aiRuns.cost_usd,
            latency_ms: aiRuns.latency_ms,
            started_at: aiRuns.started_at,
            eir_id: aiRuns.eir_id,
            error_message: aiRuns.error_message,
          })
          .from(aiRuns)
          .where(inArray(aiRuns.eir_id, eirIdsForRuns))
          .orderBy(desc(aiRuns.started_at))
          .limit(40)
      : []
  console.log(`\n  ── AI runs for season: ${runs.length} ────────────────`)
  let totalCost = 0
  let okCount = 0
  for (const r of runs) {
    totalCost += Number(r.cost_usd ?? 0)
    if (r.status === "succeeded") okCount++
    console.log(
      `     ${r.started_at?.toISOString().slice(11, 19)} ${(r.task_kind ?? "—").padEnd(28)} ${(r.model_name ?? "—").padEnd(15)} ${(r.status ?? "—").padEnd(10)} cost=$${Number(r.cost_usd ?? 0).toFixed(4)} ${r.latency_ms ?? "—"}ms${r.error_message ? " err: " + trunc(r.error_message, 50) : ""}`,
    )
  }
  console.log(
    `\n  totals: ok=${okCount}/${runs.length} cost=$${totalCost.toFixed(4)}`,
  )
}

async function main() {
  if (!db) {
    console.error("DB unavailable")
    process.exit(1)
  }

  for (const name of TARGET_SEASON_NAMES) {
    const [s] = await db
      .select({ id: khatMapSeasons.id, name: khatMapSeasons.name })
      .from(khatMapSeasons)
      .where(eq(khatMapSeasons.name, name))
      .limit(1)
    if (s) {
      await auditSeason(s.id, s.name ?? name)
    } else {
      console.log(`\n⚠️  season not found: ${name}`)
    }
  }

  process.exit(0)
}

main().catch((err) => {
  console.error("audit failed:", err)
  process.exit(1)
})
