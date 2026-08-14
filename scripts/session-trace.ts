/**
 * Read-only forensic read of what the server recorded in a time window.
 *
 * Answers "what actually happened during that session" from the two places
 * that keep a record: `ai_runs` (the AI telemetry spine — every call, its
 * status and `error_class`) and the preparation row itself.
 *
 * No writes. Safe to run against production.
 *
 *   npx tsx scripts/session-trace.ts "2026-08-13 17:30" "2026-08-13 20:30"
 */
import { readFileSync } from "node:fs"
import path from "node:path"

// Minimal env loader — same shape as scripts/diag-hybrid-readiness.ts. It has
// to run BEFORE lib/db is evaluated, which is why the imports below are dynamic.
for (const f of [".env.local", ".env.production", ".env"]) {
  try {
    for (const line of readFileSync(path.resolve(__dirname, "..", f), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      const [, k, rawV] = m
      if (process.env[k]) continue
      let v = rawV.trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[k] = v
    }
  } catch {
    /* try the next candidate */
  }
}

const since = process.argv[2] ?? "2026-08-13 17:30"
const until = process.argv[3] ?? "2026-08-13 20:30"

async function main() {
  const { db } = await import("../lib/db")
  const { sql } = await import("drizzle-orm")

  const q = async (label: string, text: string) => {
    console.log(`\n===== ${label} =====`)
    try {
      const r = await db!.execute(sql.raw(text))
      const rows = (r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])
      if (!Array.isArray(rows) || rows.length === 0) {
        console.log("(none)")
        return
      }
      for (const row of rows) console.log(JSON.stringify(row))
    } catch (e) {
      console.log("QUERY FAILED:", e instanceof Error ? e.message : String(e))
    }
  }

  await q(
    "ai_runs — every call in the window",
    `select to_char(started_at,'HH24:MI:SS') t, task_kind, model_name, status,
            coalesce(error_class,'-') err_class, latency_ms, cost_usd
     from ai_runs
     where started_at between '${since}' and '${until}'
     order by started_at`,
  )

  await q(
    "ai_runs — FAILURES only",
    `select to_char(started_at,'HH24:MI:SS') t, task_kind, status, error_class,
            left(coalesce(error_message,''),200) err
     from ai_runs
     where started_at between '${since}' and '${until}' and status <> 'success'
     order by started_at`,
  )

  await q(
    "the preparation row",
    `select id, left(title,45) title, status,
            to_char(created_at,'HH24:MI') created, to_char(updated_at,'HH24:MI') updated,
            sections_status
     from episode_preparations
     where updated_at between '${since}' and '${until}'
     order by updated_at`,
  )

  await q(
    "which of the nine sections are actually EMPTY",
    `select left(title,36) title,
       (executive_summary is null or executive_summary::text in ('null','{}','[]','""')) exec_empty,
       (knowledge_bank     is null or knowledge_bank::text     in ('null','{}','[]','""')) knowledge_empty,
       (guest_intelligence is null or guest_intelligence::text in ('null','{}','[]','""')) guest_empty,
       (conversation_axes  is null or conversation_axes::text  in ('null','{}','[]','""')) axes_empty,
       (episode_flow       is null or episode_flow::text       in ('null','{}','[]','""')) flow_empty,
       (question_system    is null or question_system::text    in ('null','{}','[]','""')) questions_empty,
       (host_instructions  is null or host_instructions::text  in ('null','{}','[]','""')) host_empty,
       (quotes_references  is null or quotes_references::text  in ('null','{}','[]','""')) quotes_empty,
       (viral_moments      is null or viral_moments::text      in ('null','{}','[]','""')) viral_empty,
       (research_data      is null or research_data::text      in ('null','{}','[]','""')) research_empty
     from episode_preparations
     where updated_at between '${since}' and '${until}'`,
  )

  // The badge prints `X/9`, where X counts every "ready" in sections_status —
  // and sections_status carries TEN keys, because `research` lives in it too.
  // So a prep with research ready and one failed section scores a perfect 9/9.
  await q(
    "the badge: what it counts vs what it should count",
    `select left(title,34) title,
            (select count(*) from jsonb_object_keys(sections_status)) keys_in_json,
            (select count(*) from jsonb_each(sections_status) e
              where e.value->>'status' = 'ready') badge_shows,
            (select count(*) from jsonb_each(sections_status) e
              where e.value->>'status' = 'ready' and e.key <> 'research') truly_ready_of_9,
            (select string_agg(e.key, ', ') from jsonb_each(sections_status) e
              where e.value->>'status' <> 'ready') not_ready
     from episode_preparations
     where sections_status is not null
     order by updated_at desc limit 8`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
