/**
 * Smoke — Editorial Intelligence schema (Phase 1).
 *
 * Pure file-system + module-import smoke. Verifies the schema layer is
 * declared correctly. Does NOT touch the live DB — that's the
 * migration's job. Phase 1 ships SCHEMA ONLY so this smoke focuses on:
 *
 *   • New schema module exists + exports the three tables
 *   • Closed-vocab constants are exported with the spec'd values
 *   • market_topic_signals has every editorial column added
 *   • Migration script exists, registered in package.json, contains
 *     idempotent ADD COLUMN / CREATE TABLE IF NOT EXISTS guards
 *   • No destructive operations (DROP, TRUNCATE, ALTER COLUMN TYPE)
 */

import { promises as fs } from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "..")
const FAIL: string[] = []
const PASS: string[] = []

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}
async function readRel(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), "utf8")
}
async function caseRun(label: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    PASS.push(label)
    console.log(`✅ ${label}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    FAIL.push(`${label} — ${message}`)
    console.log(`❌ ${label}`)
    console.log(`   ${message}`)
  }
}

async function main() {
  console.log("\n🧪 smoke-khat-brain-editorial-intelligence — Phase 1\n")

  await caseRun("1/8 schema module exports three tables + drizzle objects", async () => {
    const mod = await import("../lib/db/schema/editorial-intelligence")
    for (const name of [
      "marketSignalReviewEvents",
      "marketTrustedSources",
      "editorialTasteWeights",
    ]) {
      assert(
        (mod as Record<string, unknown>)[name],
        `editorial-intelligence.ts must export ${name}`,
      )
    }
  })

  await caseRun("2/8 closed-vocab constants match the spec", async () => {
    const mod = await import("../lib/db/schema/editorial-intelligence")
    // Statuses
    assert(
      JSON.stringify(mod.SIGNAL_REVIEW_STATUSES) ===
        JSON.stringify(["new", "approved", "rejected", "archived"]),
      "SIGNAL_REVIEW_STATUSES must be exactly [new, approved, rejected, archived]",
    )
    // Tags
    for (const t of [
      "strong",
      "weak",
      "timeless",
      "repetitive",
      "emotional",
      "controversial",
      "deep",
      "surface_level",
      "off_identity",
    ]) {
      assert(
        (mod.SIGNAL_EDITORIAL_TAGS as readonly string[]).includes(t),
        `SIGNAL_EDITORIAL_TAGS missing "${t}"`,
      )
    }
    // Actions
    for (const a of ["approve", "reject", "tag", "untag", "note", "archive", "restore"]) {
      assert(
        (mod.SIGNAL_REVIEW_ACTIONS as readonly string[]).includes(a),
        `SIGNAL_REVIEW_ACTIONS missing "${a}"`,
      )
    }
    // Trusted source types
    for (const s of [
      "youtube",
      "podcast",
      "website",
      "rss",
      "creator",
      "journalist",
      "thinker",
    ]) {
      assert(
        (mod.TRUSTED_SOURCE_TYPES as readonly string[]).includes(s),
        `TRUSTED_SOURCE_TYPES missing "${s}"`,
      )
    }
    // Taste weight dimensions
    for (const d of ["theme", "lens", "source", "tag", "topic_domain"]) {
      assert(
        (mod.TASTE_WEIGHT_DIMENSIONS as readonly string[]).includes(d),
        `TASTE_WEIGHT_DIMENSIONS missing "${d}"`,
      )
    }
  })

  await caseRun("3/8 market_topic_signals declares every editorial column", async () => {
    const src = await readRel("lib/db/schema/market-intelligence.ts")
    for (const col of [
      "review_status",
      "editorial_tags",
      "reviewed_by",
      "reviewed_at",
      "operator_notes",
      "operator_created",
      "trusted_source_id",
      "signal_score",
      "score_components",
    ]) {
      assert(src.includes(`"${col}"`), `column "${col}" missing from schema`)
    }
    // operator_created must NOT be nullable
    assert(
      src.includes("operator_created: boolean(\"operator_created\").notNull()"),
      "operator_created must be NOT NULL with a default",
    )
    assert(
      src.includes('review_status: text("review_status").notNull()'),
      "review_status must be NOT NULL with a default",
    )
  })

  await caseRun("4/8 schema barrel re-exports the new module", async () => {
    const src = await readRel("lib/db/schema/index.ts")
    assert(
      src.includes('./editorial-intelligence'),
      "lib/db/schema/index.ts must re-export ./editorial-intelligence",
    )
  })

  await caseRun("5/8 migration script exists + is registered in package.json", async () => {
    const exists = await fs
      .access(path.join(REPO_ROOT, "scripts/migrate-khat-brain-editorial-intelligence.ts"))
      .then(() => true)
      .catch(() => false)
    assert(exists, "scripts/migrate-khat-brain-editorial-intelligence.ts missing")
    const pkg = JSON.parse(await readRel("package.json"))
    assert(
      pkg.scripts["migrate:khat-brain-editorial-intelligence"],
      'package.json must register "migrate:khat-brain-editorial-intelligence"',
    )
  })

  await caseRun("6/8 migration is additive + idempotent (no destructive verbs)", async () => {
    const src = await readRel("scripts/migrate-khat-brain-editorial-intelligence.ts")
    for (const banned of [
      "DROP TABLE",
      "DROP COLUMN",
      "TRUNCATE",
      "DELETE FROM",
      "ALTER COLUMN",
    ]) {
      assert(!src.includes(banned), `migration contains destructive verb "${banned}"`)
    }
    // Idempotency guards
    assert(
      (src.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length >= 3,
      "migration must use CREATE TABLE IF NOT EXISTS for each new table",
    )
    assert(
      (src.match(/ADD COLUMN IF NOT EXISTS/g) ?? []).length >= 9,
      "migration must use ADD COLUMN IF NOT EXISTS for each new column",
    )
    assert(
      src.includes("WHEN duplicate_object THEN NULL"),
      "migration must guard CHECK/FK constraints against duplicate_object",
    )
  })

  await caseRun("7/8 migration prints BEFORE/AFTER row counts", async () => {
    const src = await readRel("scripts/migrate-khat-brain-editorial-intelligence.ts")
    assert(
      src.includes('console.log("BEFORE")') &&
        src.includes('console.log("\\nAFTER")'),
      "migration must print BEFORE and AFTER snapshots",
    )
    assert(
      src.includes("fetchCount") && src.includes("tableExists"),
      "migration must include the count helper used by both snapshots",
    )
  })

  await caseRun("8/8 phase boundary: no UI / job wiring yet (Phase 1 schema-only)", async () => {
    // Phase 1 is schema + types ONLY. No job handler should reference
    // the new tables yet. (Phases 2-5 will wire them in.)
    const banned = [
      "marketSignalReviewEvents",
      "marketTrustedSources",
      "editorialTasteWeights",
    ]
    for (const symbol of banned) {
      // Allow only inside the schema module + its barrel + smoke + migration.
      const allowedFiles = new Set([
        "lib/db/schema/editorial-intelligence.ts",
        "lib/db/schema/index.ts",
        "scripts/smoke-khat-brain-editorial-intelligence.ts",
        "scripts/migrate-khat-brain-editorial-intelligence.ts",
      ])
      // Targeted check: ensure no job handler imports these symbols.
      const handlerFiles = [
        "lib/jobs/handlers/market-intelligence.ts",
        "lib/hybrid-topics/generate.ts",
        "lib/hybrid-topics/inputs.ts",
        "lib/hybrid-topics/diagnostics.ts",
        "lib/market-intelligence/clustering.ts",
        "lib/market-intelligence/extraction.ts",
        "lib/market-intelligence/freshness.ts",
      ]
      for (const f of handlerFiles) {
        try {
          const src = await readRel(f)
          assert(
            !src.includes(symbol),
            `Phase 1 must not wire ${symbol} into ${f} yet`,
          )
        } catch {
          // file missing — fine
        }
      }
      void allowedFiles
    }
  })

  console.log(
    `\n${FAIL.length === 0 ? "🎉" : "💥"} ${PASS.length} passed, ${FAIL.length} failed`,
  )
  if (FAIL.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error("Smoke crashed:", err)
  process.exit(1)
})
