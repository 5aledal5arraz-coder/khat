/**
 * Migration-drift guard — the comparison logic.
 *
 * No real database and no real journal file: the DB reader is injected and the
 * journal is written to a temp dir. What is under test is the DECISION
 * (in_sync / drifted / unknown) and the operator message, which is the part
 * that was missing when the local DB sat 9 migrations behind for 22 days.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"

import {
  compareMigrations,
  checkMigrationDrift,
  readJournal,
  formatDriftMessage,
  type JournalEntry,
} from "@/lib/db/migration-guard"

const entries = (...tags: string[]): JournalEntry[] =>
  tags.map((tag, idx) => ({ idx, when: 1_781_000_000_000 + idx * 1000, tag }))

const whensOf = (list: JournalEntry[]): number[] => list.map((e) => e.when)

// ─── compareMigrations ───────────────────────────────────────────────

describe("compareMigrations", () => {
  it("reports in_sync when every journal entry has a matching applied row", () => {
    const journal = entries("0000_a", "0001_b", "0002_c")
    const result = compareMigrations(journal, whensOf(journal))

    expect(result).toEqual({ status: "in_sync", applied: 3, expected: 3 })
  })

  it("reports in_sync for a brand-new project with an empty journal", () => {
    expect(compareMigrations([], [])).toEqual({
      status: "in_sync",
      applied: 0,
      expected: 0,
    })
  })

  it("names the missing tags when the DB lags the journal", () => {
    // The real 2026-07-25 shape: DB stopped at 0009, journal reached 0018.
    const journal = entries(
      "0000_a",
      "0001_b",
      "0002_c",
      "0003_d",
      "0004_e",
    )
    const result = compareMigrations(journal, whensOf(journal).slice(0, 3))

    expect(result.status).toBe("drifted")
    if (result.status !== "drifted") return
    expect(result.applied).toBe(3)
    expect(result.expected).toBe(5)
    expect(result.missingTags).toEqual(["0003_d", "0004_e"])
    expect(result.unknownApplied).toBe(0)
  })

  it("detects a HOLE in the middle, which a count comparison would miss", () => {
    const journal = entries("0000_a", "0001_b", "0002_c")
    // Same count as expected, but 0001 was never applied and a stray row exists.
    const applied = [journal[0].when, journal[2].when, 999_999_999]

    const result = compareMigrations(journal, applied)

    expect(result.status).toBe("drifted")
    if (result.status !== "drifted") return
    expect(result.applied).toBe(3)
    expect(result.expected).toBe(3)
    expect(result.missingTags).toEqual(["0001_b"])
    expect(result.unknownApplied).toBe(1)
  })

  it("treats a completely unmigrated database as maximal drift", () => {
    const journal = entries("0000_a", "0001_b")
    const result = compareMigrations(journal, [])

    expect(result.status).toBe("drifted")
    if (result.status !== "drifted") return
    expect(result.missingTags).toEqual(["0000_a", "0001_b"])
  })

  it("orders missing tags by journal idx, not by discovery order", () => {
    const journal = entries("0000_a", "0001_b", "0002_c").reverse()
    const result = compareMigrations(journal, [])

    expect(result.status).toBe("drifted")
    if (result.status !== "drifted") return
    expect(result.missingTags).toEqual(["0000_a", "0001_b", "0002_c"])
  })
})

// ─── formatDriftMessage ──────────────────────────────────────────────

describe("formatDriftMessage", () => {
  it("returns null for non-drifted results so callers can't print a false alarm", () => {
    expect(formatDriftMessage({ status: "in_sync", applied: 3, expected: 3 })).toBeNull()
    expect(formatDriftMessage({ status: "unknown", reason: "no pool" })).toBeNull()
  })

  it("states both counts, the missing tags, and the command that fixes it", () => {
    const journal = entries("0000_a", "0001_b", "0002_c")
    const msg = formatDriftMessage(compareMigrations(journal, whensOf(journal).slice(0, 1)))

    expect(msg).toContain("1 migration")
    expect(msg).toContain("3 migration")
    expect(msg).toContain("0001_b")
    expect(msg).toContain("0002_c")
    expect(msg).toContain("npm run db:migrate")
  })

  it("elides a long missing list instead of flooding the boot log", () => {
    const journal = entries(...Array.from({ length: 30 }, (_, i) => `00${i}_m`))
    const msg = formatDriftMessage(compareMigrations(journal, []))!

    expect(msg).toContain("الناقص (30)")
    expect(msg).toContain("و18 غيرها")
  })

  it("calls out applied rows that the journal doesn't know about", () => {
    const journal = entries("0000_a")
    const msg = formatDriftMessage(compareMigrations(journal, [123, 456]))!

    expect(msg).toContain("2 migration مطبّقة على القاعدة")
  })
})

// ─── checkMigrationDrift ─────────────────────────────────────────────

describe("checkMigrationDrift", () => {
  let dir: string
  let journalRelPath: string
  const journal = entries("0000_a", "0001_b", "0002_c")

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "khat-migration-guard-"))
    mkdirSync(join(dir, "meta"), { recursive: true })
    const abs = join(dir, "meta", "_journal.json")
    writeFileSync(
      abs,
      JSON.stringify({ version: "7", dialect: "postgresql", entries: journal }),
    )
    // readJournal resolves against process.cwd(); pass a cwd-relative path.
    journalRelPath = relative(process.cwd(), abs)
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("reads a real journal file and reports in_sync", async () => {
    const result = await checkMigrationDrift({
      journalPath: journalRelPath,
      queryAppliedWhens: async () => whensOf(journal),
    })

    expect(result).toEqual({ status: "in_sync", applied: 3, expected: 3 })
  })

  it("reads a real journal file and reports drift", async () => {
    const result = await checkMigrationDrift({
      journalPath: journalRelPath,
      queryAppliedWhens: async () => whensOf(journal).slice(0, 2),
    })

    expect(result.status).toBe("drifted")
    if (result.status !== "drifted") return
    expect(result.missingTags).toEqual(["0002_c"])
  })

  it("returns unknown (never throws) when the database is unreachable", async () => {
    const result = await checkMigrationDrift({
      journalPath: journalRelPath,
      queryAppliedWhens: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432")
      },
    })

    expect(result.status).toBe("unknown")
    if (result.status !== "unknown") return
    expect(result.reason).toContain("ECONNREFUSED")
  })

  it("returns unknown when the journal file is missing", async () => {
    const result = await checkMigrationDrift({
      journalPath: "does/not/exist/_journal.json",
      queryAppliedWhens: async () => [],
    })

    expect(result.status).toBe("unknown")
    if (result.status !== "unknown") return
    expect(result.reason).toContain("_journal.json")
  })

  it("returns unknown when the journal is malformed rather than crashing boot", async () => {
    const bad = join(dir, "meta", "broken.json")
    writeFileSync(bad, JSON.stringify({ version: "7", entries: [{ tag: "0000_a" }] }))

    const result = await checkMigrationDrift({
      journalPath: relative(process.cwd(), bad),
      queryAppliedWhens: async () => [],
    })

    expect(result.status).toBe("unknown")
    if (result.status !== "unknown") return
    expect(result.reason).toContain("malformed")
  })
})

// ─── readJournal against the REAL repo journal ───────────────────────

describe("readJournal (repo journal)", () => {
  it("parses drizzle/migrations/meta/_journal.json with contiguous idx values", () => {
    const real = readJournal()

    expect(real.length).toBeGreaterThan(0)
    real.forEach((e, i) => {
      expect(e.idx).toBe(i)
      expect(e.tag).toMatch(/^\d{4}_/)
      expect(Number.isFinite(e.when)).toBe(true)
    })
  })
})
