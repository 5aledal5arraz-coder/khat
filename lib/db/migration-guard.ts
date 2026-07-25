/**
 * Migration drift guard — does the database actually have the schema this
 * code was written against?
 *
 * Why this exists: on 2026-07-25 the local DB was found sitting at migration
 * `0009` while `_journal.json` had reached `19`. The drift had gone unnoticed
 * for 22 days because NOTHING compared the two — `drizzle-kit migrate` had been
 * silently no-op'ing (see lib/env-file.ts for that root cause), and every
 * downstream failure surfaced as an unrelated "column does not exist" much
 * later, in a completely different part of the app.
 *
 * The guard closes that loop: one comparison, run at worker boot and at
 * prebuild, that names the missing migrations instead of letting them be
 * rediscovered as mystery runtime errors.
 *
 * Deliberately conservative about what counts as a failure:
 *   • drift CONFIRMED  → loud, explicit, names every missing tag.
 *   • DB UNREACHABLE   → `unknown`, never fatal. Builds run in environments
 *     with no database, and a CI box without DATABASE_URL is not a drifted
 *     schema. Failing there would train people to ignore the guard.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/** One entry of `drizzle/migrations/meta/_journal.json`. */
export interface JournalEntry {
  idx: number
  /** Folder-millis timestamp. Drizzle stores this verbatim as `created_at`. */
  when: number
  tag: string
}

export type MigrationDriftResult =
  | {
      status: "in_sync"
      applied: number
      expected: number
    }
  | {
      status: "drifted"
      applied: number
      expected: number
      /** Journal tags with no matching row in `__drizzle_migrations`. */
      missingTags: string[]
      /** Applied rows with no matching journal entry (DB ahead of / diverged from code). */
      unknownApplied: number
    }
  | {
      status: "unknown"
      reason: string
    }

const DEFAULT_JOURNAL_PATH = "drizzle/migrations/meta/_journal.json"

/**
 * Compare the journal against the timestamps recorded in
 * `drizzle.__drizzle_migrations`.
 *
 * Matching is by `when`/`created_at`, not by count: drizzle writes the journal
 * entry's `when` verbatim into `created_at`, so this identifies exactly WHICH
 * migrations are missing — a count alone would be blind to a hole in the middle
 * or to a DB that diverged rather than lagged.
 *
 * Pure and synchronous on purpose — this is the part worth testing.
 */
export function compareMigrations(
  entries: JournalEntry[],
  appliedWhens: number[],
): MigrationDriftResult {
  const applied = new Set(appliedWhens)
  const expected = new Set(entries.map((e) => e.when))

  const missingTags = entries
    .filter((e) => !applied.has(e.when))
    .sort((a, b) => a.idx - b.idx)
    .map((e) => e.tag)

  const unknownApplied = appliedWhens.filter((w) => !expected.has(w)).length

  if (missingTags.length === 0 && unknownApplied === 0) {
    return { status: "in_sync", applied: appliedWhens.length, expected: entries.length }
  }

  return {
    status: "drifted",
    applied: appliedWhens.length,
    expected: entries.length,
    missingTags,
    unknownApplied,
  }
}

/**
 * Read + validate `_journal.json`. Throws with a precise reason; callers that
 * must not fail (see `checkMigrationDrift`) translate the throw into `unknown`.
 */
export function readJournal(journalPath?: string): JournalEntry[] {
  const path = resolve(process.cwd(), journalPath ?? DEFAULT_JOURNAL_PATH)
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))

  const entries =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { entries?: unknown }).entries)
      ? ((parsed as { entries: unknown[] }).entries)
      : null

  if (!entries) {
    throw new Error(`journal at ${path} has no "entries" array`)
  }

  return entries.map((raw, i) => {
    const e = raw as Partial<JournalEntry>
    if (typeof e.when !== "number" || typeof e.tag !== "string") {
      throw new Error(`journal entry #${i} is malformed (missing "when" or "tag")`)
    }
    return { idx: typeof e.idx === "number" ? e.idx : i, when: e.when, tag: e.tag }
  })
}

/**
 * Default reader: the `created_at` column of `drizzle.__drizzle_migrations`.
 *
 * `created_at` is a bigint, which pg returns as a string — hence the explicit
 * Number() conversion. A missing table (42P01) is NOT an error: it means the
 * migration system was never initialised here, which is maximal drift, and the
 * operator needs to hear that rather than a swallowed "unknown".
 */
async function defaultQueryAppliedWhens(): Promise<number[]> {
  const { pool } = await import("@/lib/db")
  if (!pool) throw new Error("no database pool (DATABASE_URL unset)")

  try {
    const res = await pool.query<{ created_at: string }>(
      "select created_at from drizzle.__drizzle_migrations",
    )
    return res.rows.map((r) => Number(r.created_at))
  } catch (err) {
    if ((err as { code?: string })?.code === "42P01") return []
    throw err
  }
}

/**
 * Full check: read the journal, query the DB, compare.
 *
 * Never throws. Anything that prevents the comparison — no pool, unreachable
 * host, unreadable journal — comes back as `unknown` with the reason attached.
 */
export async function checkMigrationDrift(
  opts: {
    journalPath?: string
    queryAppliedWhens?: () => Promise<number[]>
  } = {},
): Promise<MigrationDriftResult> {
  let entries: JournalEntry[]
  try {
    entries = readJournal(opts.journalPath)
  } catch (err) {
    return { status: "unknown", reason: `تعذّرت قراءة _journal.json: ${errMsg(err)}` }
  }

  let appliedWhens: number[]
  try {
    appliedWhens = await (opts.queryAppliedWhens ?? defaultQueryAppliedWhens)()
  } catch (err) {
    return { status: "unknown", reason: `تعذّر الاتصال بقاعدة البيانات: ${errMsg(err)}` }
  }

  return compareMigrations(entries, appliedWhens)
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Cap on how many tags are listed before eliding — keeps boot logs readable. */
const MAX_LISTED_TAGS = 12

/**
 * Operator-facing Arabic message for a drifted result. Returns null for the
 * `in_sync` / `unknown` cases, which callers report (or ignore) themselves.
 */
export function formatDriftMessage(result: MigrationDriftResult): string | null {
  if (result.status !== "drifted") return null

  const shown = result.missingTags.slice(0, MAX_LISTED_TAGS)
  const rest = result.missingTags.length - shown.length
  const tagList =
    result.missingTags.length === 0
      ? "لا شيء"
      : shown.join("، ") + (rest > 0 ? ` … (و${rest} غيرها)` : "")

  const lines = [
    "انحراف بين الكود وقاعدة البيانات (migration drift):",
    `  القاعدة عند: ${result.applied} migration`,
    `  الكود يحتاج: ${result.expected} migration`,
    `  الناقص (${result.missingTags.length}): ${tagList}`,
  ]

  if (result.unknownApplied > 0) {
    lines.push(
      `  تحذير إضافي: ${result.unknownApplied} migration مطبّقة على القاعدة وما لها أثر في _journal.json — يعني القاعدة منحرفة مو بس متأخرة.`,
    )
  }

  lines.push("  الحل: شغّل `npm run db:migrate`")
  return lines.join("\n")
}
