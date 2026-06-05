/**
 * Phase 2.1 (P2.1.e) — EIR transition matrix parity test.
 *
 * The legal transition matrix is encoded TWICE in the repo:
 *   • TypeScript: `lib/eir/transitions.ts` (`LINEAR_NEXT` +
 *                 `ADDITIONAL_TRANSITIONS` + universal archive escape).
 *   • SQL:        `scripts/migrate-phase2-1-eir-trigger.ts` (the
 *                 `(OLD.phase, NEW.phase) IN (…)` literal inside the
 *                 `khat_eir_check_transition` function + a separate
 *                 `IF NEW.phase = 'archived'` branch).
 *
 * If they drift, the service module allows a transition the trigger
 * considers illegal, or vice versa. This test parses the SQL literal
 * out of the migration file and compares pair-by-pair predicate
 * parity across every (from, to) combination of EPISODE_PHASES.
 *
 * Pure: file read + regex + set comparison. No DB, no I/O beyond
 * `readFileSync` on a known path.
 *
 * P2.1.a/d artefacts are FROZEN. If this test fails, fix is in one of:
 *   • `lib/eir/transitions.ts` `ADDITIONAL_TRANSITIONS` table, OR
 *   • `scripts/migrate-phase2-1-eir-trigger.ts` IN-list.
 * After patching, re-run `npm run migrate:phase2-1-eir-trigger` so the
 * SQL function picks up the change.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { EPISODE_PHASES, type EpisodePhase } from "@/lib/db/schema/eir"
import { allowedNextPhases } from "@/lib/eir/transitions"

const MIGRATION_PATH = resolve(
  __dirname,
  "../../scripts/migrate-phase2-1-eir-trigger.ts",
)

// ─── Extractors ─────────────────────────────────────────────────────

/**
 * Parse the SQL literal `(OLD.phase, NEW.phase) IN ( ('a','b'), …)`
 * out of the migration file and return the set of "from->to" pairs.
 *
 * Brittle to reformat: if someone re-indents the IN-list to a different
 * shape, the regex breaks. That's intentional — the failure surface
 * names exactly where to fix.
 */
function extractSqlPairs(text: string): Set<string> {
  const inListMatch = text.match(
    /\(OLD\.phase,\s*NEW\.phase\)\s*IN\s*\(([\s\S]*?)\)\s*;/,
  )
  if (!inListMatch) {
    throw new Error(
      "Could not find `(OLD.phase, NEW.phase) IN (...)` block in migration. " +
        "If the migration was reformatted, update this regex in trigger-matrix.test.ts.",
    )
  }
  const body = inListMatch[1]
  const pairRe = /\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g
  const pairs = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = pairRe.exec(body)) !== null) {
    pairs.add(`${m[1]}->${m[2]}`)
  }
  return pairs
}

const MIGRATION_TEXT = readFileSync(MIGRATION_PATH, "utf8")
const SQL_PAIRS = extractSqlPairs(MIGRATION_TEXT)

/**
 * SQL verdict — mirrors the trigger function's logic:
 *   1. archive escape: non-null + non-archived OLD → archived = true
 *   2. otherwise must appear in the IN-list
 */
function isAllowedBySql(from: EpisodePhase, to: EpisodePhase): boolean {
  if (to === "archived" && from !== "archived") return true
  return SQL_PAIRS.has(`${from}->${to}`)
}

/** TS verdict — calls the production helper. */
function isAllowedByTs(from: EpisodePhase, to: EpisodePhase): boolean {
  return allowedNextPhases(from).includes(to)
}

// ─── Assertions ─────────────────────────────────────────────────────

describe("EIR transition matrix — TS / SQL parity", () => {
  it("SQL IN-list contains exactly the expected explicit pairs (count check)", () => {
    // Linear chain has 14 entries that target a non-null next (every
    // phase except `archived`, which is terminal). Plus the
    // idea→guest_discovery branch. = 15 explicit pairs in the SQL
    // IN-list. (learned→archived counts here because it's in
    // LINEAR_NEXT — even though the archive escape would also catch
    // it. Belt-and-suspenders.)
    expect(SQL_PAIRS.size).toBe(15)
  })

  it("pair-by-pair predicate parity: SQL verdict === TS verdict for all 15² combinations", () => {
    const drift: Array<{ from: EpisodePhase; to: EpisodePhase; sql: boolean; ts: boolean }> = []
    for (const from of EPISODE_PHASES) {
      for (const to of EPISODE_PHASES) {
        const sql = isAllowedBySql(from, to)
        const ts = isAllowedByTs(from, to)
        if (sql !== ts) {
          drift.push({ from, to, sql, ts })
        }
      }
    }
    expect(
      drift,
      `TS/SQL parity drift detected on ${drift.length} pair(s). ` +
        `First few: ${drift.slice(0, 5).map((d) => `${d.from}→${d.to} (sql=${d.sql}, ts=${d.ts})`).join("; ")}`,
    ).toEqual([])
  })

  it("universal archive escape is present in SQL function body", () => {
    // The trigger function must contain the archive-escape branch.
    expect(MIGRATION_TEXT).toMatch(/IF\s+NEW\.phase\s*=\s*'archived'/)
    expect(MIGRATION_TEXT).toMatch(/OLD\.phase\s*IS\s*NOT\s*NULL/)
    expect(MIGRATION_TEXT).toMatch(/OLD\.phase\s*<>\s*'archived'/)
  })

  it("universal archive escape is present in TS for every non-archived phase", () => {
    const failures: EpisodePhase[] = []
    for (const phase of EPISODE_PHASES) {
      if (phase === "archived") continue
      if (!allowedNextPhases(phase).includes("archived")) {
        failures.push(phase)
      }
    }
    expect(
      failures,
      `phases missing archive escape in TS: [${failures.join(", ")}]`,
    ).toEqual([])
  })

  it("`archived` is terminal in both TS and SQL", () => {
    expect(allowedNextPhases("archived")).toEqual([])
    const fromArchived: string[] = []
    for (const p of SQL_PAIRS) {
      if (p.startsWith("archived->")) fromArchived.push(p)
    }
    expect(fromArchived).toEqual([])
  })

  it("every non-archived phase has at least one allowed transition (no orphans)", () => {
    const orphans: EpisodePhase[] = []
    for (const phase of EPISODE_PHASES) {
      if (phase === "archived") continue
      if (allowedNextPhases(phase).length === 0) orphans.push(phase)
    }
    expect(orphans).toEqual([])
  })

  it("EPISODE_PHASES enum is the same on both sides (count check)", () => {
    // Sanity: if a new phase is added to the enum, both the TS matrix
    // and the SQL IN-list must be updated. Locking the count at 15
    // catches accidental enum drift.
    expect(EPISODE_PHASES.length).toBe(15)
  })
})
