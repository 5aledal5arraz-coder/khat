/**
 * Phase 2.3 (P2.3.a) — `system_events` unified event log substrate.
 *
 *   npm run migrate:phase2-3-system-events
 *
 * Forward (idempotent):
 *   1. Creates `system_events` table.
 *   2. Creates 4 supporting indexes (2 full + 2 partial).
 *
 * Reverse:
 *   MIGRATE_PHASE2_3_REVERSE=1 npm run migrate:phase2-3-system-events
 *
 * Reverse drops the indexes then the table. No other tables touched.
 *
 * Schema-additive only. P2.3.a deliberately does NOT wire any subsystem
 * emitter — see lib/system-events/emit.ts (helper) and types.ts (frozen
 * vocabulary). Wiring lands in P2.3.b–P2.3.d.
 *
 * The migration runs through the standard `lib/db` pool, which already
 * encodes the production-vs-localhost behavior used by every other P1+
 * migration: SSL on managed DB, no SSL on localhost. There is no
 * separate hostname guard — that pattern is reserved for the
 * destructive smokes, not for idempotent additive migrations.
 */

import { sql } from "drizzle-orm"
import { db, closeDb } from "@/lib/db"

const REVERSE = process.env.MIGRATE_PHASE2_3_REVERSE === "1"

async function main() {
  if (!db) {
    console.error(
      "[phase2-3-system-events] db is null — DATABASE_URL not configured",
    )
    process.exit(1)
  }

  if (REVERSE) {
    console.log(
      "[phase2-3-system-events] REVERSE: dropping indexes + system_events table…",
    )
    await db.execute(sql`DROP INDEX IF EXISTS idx_system_events_severity_event_at`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_system_events_subject`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_system_events_source_type_event_at`)
    await db.execute(sql`DROP INDEX IF EXISTS idx_system_events_event_at`)
    await db.execute(sql`DROP TABLE IF EXISTS system_events`)
    console.log("[phase2-3-system-events] reverse complete")
    await closeDb()
    process.exit(0)
  }

  console.log(
    "[phase2-3-system-events] forward: creating system_events table + 4 indexes…",
  )

  // 1. Table.
  //
  // BIGSERIAL primary key — see schema file for rationale (time-ordered
  // numeric IDs cheaper to index than UUIDs at log-volume scale; future
  // retention sweeps can use `id < threshold` semantics).
  //
  // event_at vs created_at: the writer sets event_at to the actual
  // moment the event happened; created_at is set by the DB when the
  // row lands. They differ when the writer batches/replays events.
  //
  // payload defaults to '{}'::jsonb so every row has a queryable
  // payload shape; readers can rely on `payload->>'key'` without
  // null checks.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS system_events (
      id            bigserial PRIMARY KEY,
      event_at      timestamp with time zone NOT NULL DEFAULT now(),
      source        text NOT NULL,
      event_type    text NOT NULL,
      severity      text NOT NULL DEFAULT 'info',
      actor         text,
      subject_kind  text,
      subject_id    text,
      payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
      request_id    text,
      created_at    timestamp with time zone NOT NULL DEFAULT now()
    )
  `)

  // 2. Indexes — order matters for readability but not correctness.

  // 2a. Recent-events-first; primary dashboard query path.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_system_events_event_at
    ON system_events (event_at DESC)
  `)

  // 2b. Source/type filter ordered by time — supports the dashboard
  //     filter panel + per-source counts in the observation report.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_system_events_source_type_event_at
    ON system_events (source, event_type, event_at DESC)
  `)

  // 2c. Trace-by-subject lookup. Partial — most events have no subject.
  //     Keeps the index small for sources like sweeper/rate-limit/
  //     schedule that emit subject-less events.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_system_events_subject
    ON system_events (subject_kind, subject_id)
    WHERE subject_kind IS NOT NULL
  `)

  // 2d. Severity priority lookup. Partial — most events are info, so
  //     the index covers only the small minority that the dashboard
  //     surfaces as warnings/errors.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_system_events_severity_event_at
    ON system_events (severity, event_at DESC)
    WHERE severity <> 'info'
  `)

  // 3. Post-migrate sanity check — confirms table + all 4 indexes
  //    landed. Matches the P2.1.d post-check contract (verify, don't
  //    just trust).
  const check = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM information_schema.tables
        WHERE table_name = 'system_events')::int AS table_count,
      (SELECT count(*) FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'system_events'
          AND indexname LIKE 'idx_system_events_%')::int AS index_count
  `)) as unknown as {
    rows: Array<{ table_count: number; index_count: number }>
  }
  const c = check.rows[0]
  console.log(
    `[phase2-3-system-events] post-migrate state: ` +
      `table_count=${c.table_count} index_count=${c.index_count}`,
  )
  if (c.table_count !== 1 || c.index_count !== 4) {
    console.error(
      "[phase2-3-system-events] POST-CHECK FAILED: expected " +
        "table_count=1, index_count=4",
    )
    await closeDb()
    process.exit(2)
  }

  console.log("[phase2-3-system-events] forward migration complete")
  console.log(
    "[phase2-3-system-events] writer wiring lands in P2.3.b–P2.3.d. " +
      "No subsystem emits to this table yet.",
  )
  await closeDb()
  process.exit(0)
}

main().catch(async (err) => {
  console.error("[phase2-3-system-events] migration failed:", err)
  await closeDb()
  process.exit(1)
})
