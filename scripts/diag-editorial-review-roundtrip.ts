/**
 * Diagnostic — Editorial review round-trip against the live DB.
 *
 *   npx tsx scripts/diag-editorial-review-roundtrip.ts
 *
 * Picks one real `new` signal, runs approve → restore through the
 * mutation layer (same code path the UI uses), prints BEFORE/AFTER row
 * counts and the audit rows that landed.
 *
 * Side-effects:
 *   • 1 signal flipped to 'approved' then back to 'new'
 *   • 2 rows inserted into market_signal_review_events
 *
 * Leaves market_topic_signals state intact (other than reviewed_by /
 * reviewed_at on the chosen signal which now hold the diag actor id).
 */

import { readFileSync } from "node:fs"
import path from "node:path"
try {
  const envPath = path.resolve(__dirname, "..", ".env.local")
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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
} catch {}

import { sql } from "drizzle-orm"

async function main() {
  const { db } = await import("../lib/db")
  const { approveSignal, restoreSignal } = await import(
    "../lib/market-intelligence/review-mutations"
  )

  if (!db) {
    console.error("DB unavailable — set DATABASE_URL in .env.local")
    process.exit(1)
  }

  // Use a stable diag actor so reviewed_by has a non-null value but
  // doesn't pollute real audit attribution.
  const actorId = "diag-roundtrip"

  console.log("\n🧪 Editorial review round-trip — live DB\n")

  // BEFORE
  const beforeStatuses = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE review_status='new')::int       AS new_n,
      count(*) FILTER (WHERE review_status='approved')::int  AS approved_n,
      count(*) FILTER (WHERE review_status='rejected')::int  AS rejected_n,
      count(*) FILTER (WHERE review_status='archived')::int  AS archived_n
    FROM market_topic_signals
  `)
  const beforeEvents = await db.execute(sql`
    SELECT count(*)::int AS n FROM market_signal_review_events
  `)
  const beforeRow = beforeStatuses.rows[0] as Record<string, number>
  const beforeEventCount = Number(
    (beforeEvents.rows[0] as { n?: number }).n ?? 0,
  )
  console.log("BEFORE")
  console.log(`  signals.new       : ${beforeRow.new_n}`)
  console.log(`  signals.approved  : ${beforeRow.approved_n}`)
  console.log(`  signals.rejected  : ${beforeRow.rejected_n}`)
  console.log(`  signals.archived  : ${beforeRow.archived_n}`)
  console.log(`  audit events      : ${beforeEventCount}`)

  // Pick one 'new' signal.
  const pick = await db.execute(sql`
    SELECT id, title FROM market_topic_signals
    WHERE review_status = 'new'
    ORDER BY collected_at DESC
    LIMIT 1
  `)
  const target = pick.rows[0] as { id: string; title: string } | undefined
  if (!target) {
    console.error("\nno 'new' signals available to test against")
    process.exit(1)
  }
  console.log(`\ntarget signal:  ${target.id}`)
  console.log(`title:          "${target.title.slice(0, 70)}"`)

  // approve
  console.log("\nstep 1 — approveSignal(target)")
  const approveResult = await approveSignal(target.id, { actorId })
  console.log(`  ok=${approveResult.ok}`)
  console.log(`  previousStatus=${approveResult.previousStatus}`)
  console.log(`  newStatus=${approveResult.newStatus}`)
  console.log(`  eventId=${approveResult.eventId}`)

  // restore
  console.log("\nstep 2 — restoreSignal(target)  (puts it back to 'new')")
  const restoreResult = await restoreSignal(target.id, { actorId })
  console.log(`  ok=${restoreResult.ok}`)
  console.log(`  previousStatus=${restoreResult.previousStatus}`)
  console.log(`  newStatus=${restoreResult.newStatus}`)
  console.log(`  eventId=${restoreResult.eventId}`)

  // AFTER
  const afterStatuses = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE review_status='new')::int       AS new_n,
      count(*) FILTER (WHERE review_status='approved')::int  AS approved_n,
      count(*) FILTER (WHERE review_status='rejected')::int  AS rejected_n,
      count(*) FILTER (WHERE review_status='archived')::int  AS archived_n
    FROM market_topic_signals
  `)
  const afterEvents = await db.execute(sql`
    SELECT count(*)::int AS n FROM market_signal_review_events
  `)
  const afterRow = afterStatuses.rows[0] as Record<string, number>
  const afterEventCount = Number(
    (afterEvents.rows[0] as { n?: number }).n ?? 0,
  )

  console.log("\nAFTER")
  console.log(`  signals.new       : ${afterRow.new_n}`)
  console.log(`  signals.approved  : ${afterRow.approved_n}`)
  console.log(`  signals.rejected  : ${afterRow.rejected_n}`)
  console.log(`  signals.archived  : ${afterRow.archived_n}`)
  console.log(`  audit events      : ${afterEventCount}  (+${afterEventCount - beforeEventCount})`)

  // Show the new audit rows
  const rows = await db.execute(sql`
    SELECT action, previous_status, new_status, actor_id, created_at::text
    FROM market_signal_review_events
    WHERE signal_id = ${target.id}
    ORDER BY created_at DESC
    LIMIT 5
  `)
  console.log("\naudit rows for target signal (latest 5):")
  for (const r of rows.rows) {
    const row = r as Record<string, unknown>
    console.log(
      `  ${row.created_at}  ${row.action}  ${row.previous_status ?? "—"} → ${row.new_status ?? "—"}  (actor=${row.actor_id})`,
    )
  }

  // Sanity assertions
  const failures: string[] = []
  if (afterRow.new_n !== beforeRow.new_n) {
    failures.push(`new count changed: ${beforeRow.new_n} → ${afterRow.new_n}`)
  }
  if (afterEventCount !== beforeEventCount + 2) {
    failures.push(
      `expected +2 audit rows, got +${afterEventCount - beforeEventCount}`,
    )
  }
  if (approveResult.previousStatus !== "new") {
    failures.push(`approve.previousStatus expected 'new', got ${approveResult.previousStatus}`)
  }
  if (approveResult.newStatus !== "approved") {
    failures.push(`approve.newStatus expected 'approved', got ${approveResult.newStatus}`)
  }
  if (restoreResult.previousStatus !== "approved") {
    failures.push(`restore.previousStatus expected 'approved', got ${restoreResult.previousStatus}`)
  }
  if (restoreResult.newStatus !== "new") {
    failures.push(`restore.newStatus expected 'new', got ${restoreResult.newStatus}`)
  }

  if (failures.length === 0) {
    console.log("\n✅ Round-trip verified — state intact, audit log captured both decisions.")
    process.exit(0)
  }
  console.log("\n❌ failures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}

main().catch((err) => {
  console.error("❌ roundtrip failed:", err)
  process.exit(1)
})
