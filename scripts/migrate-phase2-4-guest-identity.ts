/**
 * Phase 2.4 (P2.4.a) — Guest Identity Unification: schema substrate.
 *
 *   npm run migrate:phase2-4-guest-identity
 *
 * Forward (idempotent):
 *   1. Pre-flight diagnostic counts (read-only).
 *   2. CREATE TABLE IF NOT EXISTS guest_candidate_links + 2 indexes.
 *   3. CREATE TABLE IF NOT EXISTS guest_application_links + 2 indexes.
 *   4. Orphan scan on guest_discovery_candidates.promoted_guest_id.
 *      Aborts unless `--confirm-orphans` is set when orphans exist.
 *   5. ADD CONSTRAINT fk_gdc_promoted_guest ON guest_discovery_candidates
 *      → guests.id ON DELETE SET NULL. Idempotent: skipped if present.
 *   6. Post-migrate sanity check.
 *
 * Reverse:
 *   MIGRATE_PHASE2_4_REVERSE=1 npm run migrate:phase2-4-guest-identity
 *
 * Reverse drops the FK constraint and both junction tables (indexes
 * drop with the tables). Reverse does NOT restore any orphan
 * promoted_guest_id values that were cleared with --confirm-orphans
 * — those NULLs stay (by design; the migration's stdout records every
 * cleared value).
 *
 * Operator flags:
 *   (none)                            forward, aborts on orphans
 *   --confirm-orphans                 forward, clears orphans first
 *   MIGRATE_PHASE2_4_REVERSE=1        reverse
 *
 * The orphan list is capped at 20 rows in stdout (operator §2 of the
 * P2.4.a refinement); additional rows are summarised as "and N more..."
 * but ALL of them are cleared when --confirm-orphans is set.
 */

import { sql } from "drizzle-orm"
import { db, closeDb } from "@/lib/db"

const REVERSE = process.env.MIGRATE_PHASE2_4_REVERSE === "1"
const CONFIRM_ORPHANS = process.argv.includes("--confirm-orphans")
const ORPHAN_PRINT_CAP = 20

interface OrphanRow {
  id: string
  promoted_guest_id: string
}

async function main() {
  if (!db) {
    console.error(
      "[phase2-4-guest-identity] db is null — DATABASE_URL not configured",
    )
    process.exit(1)
  }

  if (REVERSE) {
    console.log(
      "[phase2-4-guest-identity] REVERSE: dropping FK + junction tables…",
    )
    // R1: drop the FK constraint. IF EXISTS is safe across both
    // post-forward and pre-forward states.
    await db.execute(sql`
      ALTER TABLE guest_discovery_candidates
        DROP CONSTRAINT IF EXISTS fk_gdc_promoted_guest
    `)
    // R2: drop the junction tables. Indexes drop with the tables.
    await db.execute(sql`DROP TABLE IF EXISTS guest_application_links`)
    await db.execute(sql`DROP TABLE IF EXISTS guest_candidate_links`)
    console.log("[phase2-4-guest-identity] reverse complete")
    await closeDb()
    process.exit(0)
  }

  // ─── Step 1: Pre-flight diagnostics ────────────────────────────────
  console.log("[phase2-4-guest-identity] pre-flight diagnostics:")

  const guestsCount = (await db.execute(sql`
    SELECT count(*)::int AS n FROM guests
  `)) as unknown as { rows: Array<{ n: number }> }
  console.log(`  guests:                          ${guestsCount.rows[0]?.n ?? 0}`)

  const candidatesCount = (await db.execute(sql`
    SELECT count(*)::int AS n FROM guest_candidates
  `)) as unknown as { rows: Array<{ n: number }> }
  console.log(`  guest_candidates:                ${candidatesCount.rows[0]?.n ?? 0}`)

  const applicationsCount = (await db.execute(sql`
    SELECT count(*)::int AS n FROM guest_applications
  `)) as unknown as { rows: Array<{ n: number }> }
  console.log(`  guest_applications:              ${applicationsCount.rows[0]?.n ?? 0}`)

  const promotedCount = (await db.execute(sql`
    SELECT count(*)::int AS n
      FROM guest_discovery_candidates
     WHERE promoted_guest_id IS NOT NULL
  `)) as unknown as { rows: Array<{ n: number }> }
  console.log(
    `  discovery candidates promoted:   ${promotedCount.rows[0]?.n ?? 0}`,
  )

  // ─── Step 2: guest_candidate_links ─────────────────────────────────
  console.log(
    "[phase2-4-guest-identity] step 2: create guest_candidate_links + indexes…",
  )
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS guest_candidate_links (
      id             text PRIMARY KEY,
      guest_id       text NOT NULL,
      candidate_id   text NOT NULL,
      link_type      text NOT NULL DEFAULT 'promoted',
      confidence     text NOT NULL,
      linked_at      timestamp with time zone NOT NULL DEFAULT now(),
      linked_by      text,
      CONSTRAINT fk_gcl_guest
        FOREIGN KEY (guest_id)
        REFERENCES guests(id) ON DELETE CASCADE,
      CONSTRAINT fk_gcl_candidate
        FOREIGN KEY (candidate_id)
        REFERENCES guest_candidates(id) ON DELETE CASCADE
    )
  `)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_gcl_candidate
      ON guest_candidate_links (candidate_id)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_gcl_guest
      ON guest_candidate_links (guest_id)
  `)

  // ─── Step 3: guest_application_links ───────────────────────────────
  console.log(
    "[phase2-4-guest-identity] step 3: create guest_application_links + indexes…",
  )
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS guest_application_links (
      id              text PRIMARY KEY,
      guest_id        text NOT NULL,
      application_id  text NOT NULL,
      link_type       text NOT NULL DEFAULT 'accepted',
      linked_at       timestamp with time zone NOT NULL DEFAULT now(),
      linked_by       text,
      CONSTRAINT fk_gal_guest
        FOREIGN KEY (guest_id)
        REFERENCES guests(id) ON DELETE CASCADE,
      CONSTRAINT fk_gal_application
        FOREIGN KEY (application_id)
        REFERENCES guest_applications(id) ON DELETE CASCADE
    )
  `)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_gal_application
      ON guest_application_links (application_id)
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_gal_guest
      ON guest_application_links (guest_id)
  `)

  // ─── Step 4: Orphan scan + gate ────────────────────────────────────
  const orphansRes = (await db.execute(sql`
    SELECT id, promoted_guest_id
      FROM guest_discovery_candidates
     WHERE promoted_guest_id IS NOT NULL
       AND promoted_guest_id NOT IN (SELECT id FROM guests)
  `)) as unknown as { rows: OrphanRow[] }
  const orphans = orphansRes.rows
  const orphanCount = orphans.length

  if (orphanCount > 0) {
    console.log(
      `[phase2-4-guest-identity] orphan scan: ${orphanCount} promoted_guest_id value(s) do not match any guests.id:`,
    )
    const shown = orphans.slice(0, ORPHAN_PRINT_CAP)
    for (const o of shown) {
      console.log(
        `  candidate=${o.id}  promoted_guest_id=${o.promoted_guest_id}`,
      )
    }
    if (orphanCount > ORPHAN_PRINT_CAP) {
      console.log(`  …and ${orphanCount - ORPHAN_PRINT_CAP} more`)
    }

    if (!CONFIRM_ORPHANS) {
      console.error(
        `[phase2-4-guest-identity] REFUSED: ${orphanCount} orphan(s) detected. ` +
          "The FK `fk_gdc_promoted_guest` cannot be created until these are resolved. " +
          "Re-run with `--confirm-orphans` to SET them to NULL " +
          "(the FK's `ON DELETE SET NULL` semantics — this is what would " +
          "happen anyway if the referenced guest were deleted later).",
      )
      await closeDb()
      process.exit(3)
    }

    console.log(
      `[phase2-4-guest-identity] --confirm-orphans: clearing ${orphanCount} value(s)…`,
    )
    await db.execute(sql`
      UPDATE guest_discovery_candidates
         SET promoted_guest_id = NULL
       WHERE promoted_guest_id IS NOT NULL
         AND promoted_guest_id NOT IN (SELECT id FROM guests)
    `)
    console.log(`[phase2-4-guest-identity] cleared ${orphanCount} orphan value(s)`)
  } else {
    console.log("[phase2-4-guest-identity] orphan scan: 0 orphan(s)")
  }

  // ─── Step 5: ADD CONSTRAINT (idempotent — check existence first) ───
  const fkRes = (await db.execute(sql`
    SELECT count(*)::int AS n
      FROM information_schema.table_constraints
     WHERE constraint_name = 'fk_gdc_promoted_guest'
       AND table_name = 'guest_discovery_candidates'
       AND constraint_type = 'FOREIGN KEY'
  `)) as unknown as { rows: Array<{ n: number }> }
  if ((fkRes.rows[0]?.n ?? 0) === 0) {
    console.log(
      "[phase2-4-guest-identity] step 5: adding fk_gdc_promoted_guest…",
    )
    await db.execute(sql`
      ALTER TABLE guest_discovery_candidates
        ADD CONSTRAINT fk_gdc_promoted_guest
        FOREIGN KEY (promoted_guest_id)
        REFERENCES guests(id)
        ON DELETE SET NULL
    `)
  } else {
    console.log(
      "[phase2-4-guest-identity] step 5: fk_gdc_promoted_guest already exists, skipping",
    )
  }

  // ─── Step 6: Post-migrate sanity check ─────────────────────────────
  const check = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM information_schema.tables
        WHERE table_name = 'guest_candidate_links')::int AS gcl_count,
      (SELECT count(*) FROM information_schema.tables
        WHERE table_name = 'guest_application_links')::int AS gal_count,
      (SELECT count(*) FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_gdc_promoted_guest')::int AS fk_count
  `)) as unknown as {
    rows: Array<{ gcl_count: number; gal_count: number; fk_count: number }>
  }
  const c = check.rows[0]
  console.log(
    `[phase2-4-guest-identity] post-migrate state: ` +
      `gcl_count=${c.gcl_count} gal_count=${c.gal_count} fk_count=${c.fk_count}`,
  )
  if (c.gcl_count !== 1 || c.gal_count !== 1 || c.fk_count !== 1) {
    console.error(
      "[phase2-4-guest-identity] POST-CHECK FAILED: expected " +
        "gcl_count=1, gal_count=1, fk_count=1",
    )
    await closeDb()
    process.exit(2)
  }

  console.log("[phase2-4-guest-identity] forward migration complete")
  console.log(
    "[phase2-4-guest-identity] no writes to junction tables yet — P2.4.b backfill ships those.",
  )
  await closeDb()
  process.exit(0)
}

main().catch(async (err) => {
  console.error("[phase2-4-guest-identity] migration failed:", err)
  await closeDb()
  process.exit(1)
})
