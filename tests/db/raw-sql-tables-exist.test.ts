/**
 * Guard — every table named in a raw `sql` template must still exist in
 * `lib/db/schema/`.
 *
 * The bug this exists for: Khat Brain Phase 5 dropped nine legacy
 * `studio_*` tables, but `app/admin/episodes/conversation-actions.ts`
 * kept a hand-written `FROM studio_website_packages` query. Drizzle's
 * typed builders would have caught it at compile time; a raw template is
 * invisible to both the compiler and the test suite, so the server action
 * threw `relation ... does not exist` at runtime and the operator saw
 * nothing at all.
 *
 * The check is deliberately lexical — no database connection — so it runs
 * in CI and fails the moment a schema file loses a table that raw SQL
 * still names.
 */

import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { getTableName, is, Table } from "drizzle-orm"
import * as schema from "@/lib/db/schema"

const ROOTS = ["app", "lib", "scripts"]
const SOURCE_EXT = /\.(ts|tsx)$/

/**
 * `scripts/migrate-khat-brain-drop-legacy-studio.ts` names the dropped
 * tables on purpose — that is the file that drops them.
 */
const EXEMPT_FILES = new Set([
  join("scripts", "migrate-khat-brain-drop-legacy-studio.ts"),
])

/** SQL keywords that can follow FROM/JOIN/INTO/UPDATE without being a table. */
const NOT_A_TABLE = new Set([
  "lateral",
  "only",
  "of",
  "set",
  "skip",
  "locked",
  "select",
  "values",
  "distinct",
  "new",
  "old",
  "excluded",
  "unnest",
  "generate_series",
])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE_EXT.test(entry)) out.push(full)
  }
  return out
}

/**
 * Pull the text of every `` sql`…` `` / `` sql.raw(`…`) `` template out of a
 * source file. `${…}` interpolations become a placeholder so a bound
 * parameter never reads as a table name.
 */
export function extractSqlLiterals(source: string): string[] {
  const literals: string[] = []
  // The leading guard keeps `` `sql` `` inside a prose comment from matching.
  const opener = /(?:^|[^\w.`])sql(?:\.raw\(|\s*)`/g
  let match: RegExpExecArray | null
  while ((match = opener.exec(source))) {
    let i = match.index + match[0].length
    let depth = 0
    let buffer = ""
    while (i < source.length) {
      const char = source[i]
      if (char === "\\") {
        buffer += char + (source[i + 1] ?? "")
        i += 2
        continue
      }
      if (char === "$" && source[i + 1] === "{") {
        depth++
        i += 2
        buffer += " ? "
        continue
      }
      if (depth > 0) {
        if (char === "}") depth--
        i++
        continue
      }
      if (char === "`") break
      buffer += char
      i++
    }
    literals.push(buffer)
    opener.lastIndex = i
  }
  return literals
}

const stripComments = (sqlText: string) =>
  sqlText.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")

/** Table names a raw SQL string reads or writes, minus CTEs and keywords. */
export function tablesNamedIn(rawSql: string): string[] {
  const text = stripComments(rawSql)

  const ctes = new Set<string>()
  const cteRe = /(?:\bwith\b|,)\s*(?:recursive\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\([^)]*\))?\s+as\s*(?:materialized\s*)?\(/gi
  let cte: RegExpExecArray | null
  while ((cte = cteRe.exec(text))) ctes.add(cte[1].toLowerCase())

  const found = new Set<string>()
  const tableRe = /\b(?:from|join|into|update)\s+(?:only\s+)?(?:lateral\s+)?(?:public\.)?["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?\s*(\(|\.)?/gi
  let hit: RegExpExecArray | null
  while ((hit = tableRe.exec(text))) {
    // A trailing "(" is a set-returning function, "." a qualified column.
    if (hit[2]) continue
    const name = hit[1].toLowerCase()
    if (NOT_A_TABLE.has(name) || ctes.has(name)) continue
    // Postgres catalogs are real, just not ours to model.
    if (name.startsWith("pg_") || name.startsWith("information_schema")) continue
    found.add(name)
  }
  return [...found]
}

function schemaTableNames(): Set<string> {
  const names = new Set<string>()
  for (const value of Object.values(schema)) {
    if (is(value as never, Table)) names.add(getTableName(value as never))
  }
  return names
}

describe("raw SQL only names tables the schema still defines", () => {
  const tables = schemaTableNames()

  it("finds the Drizzle schema", () => {
    expect(tables.size).toBeGreaterThan(50)
    expect(tables.has("studio_analysis_records")).toBe(true)
  })

  it("has no raw query pointing at a table that no longer exists", () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (EXEMPT_FILES.has(file)) continue
        for (const literal of extractSqlLiterals(readFileSync(file, "utf8"))) {
          for (const table of tablesNamedIn(literal)) {
            if (!tables.has(table)) offenders.push(`${file} → ${table}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  // Proof the guard actually bites: the exact query that was live on
  // `khat-hardening-2026-06` until this commit.
  it("flags the dropped table the shipped query used to read", () => {
    const wasLive = `
      const rows = await db.execute(sql\`
        SELECT p.session_id, s.video_title
        FROM studio_website_packages p
        JOIN studio_sessions s ON s.id = p.session_id
        WHERE p.linked_episode_id = \${episodeId}
        LIMIT 1\`)
    `
    const named = extractSqlLiterals(wasLive).flatMap(tablesNamedIn)
    expect(named).toContain("studio_website_packages")
    expect(named.filter((t) => !tables.has(t))).toEqual(["studio_website_packages"])
    // …and the surviving table in the same query is NOT flagged.
    expect(tables.has("studio_sessions")).toBe(true)
  })
})
