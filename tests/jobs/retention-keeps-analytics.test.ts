/**
 * Khaled, 2026-10-03: visitor-counter visits are kept FOREVER. The retention
 * pass (lib/jobs/retention.ts, the manual `jobs:retention-ai-runs` CLI) must
 * never read or write `analytics_events`.
 *
 * Behavioural, not only textual: the pass is run end to end — dry-run AND
 * the `--confirm` wet path — against a DB mock that records every statement,
 * and no statement may name the table.
 */
import fs from "fs"
import { describe, it, expect, vi } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

const statements: string[] = []
const dialect = new PgDialect()
const record = async (q: SQL) => {
  statements.push(dialect.sqlToQuery(q).sql)
  return { rows: [] }
}
vi.mock("@/lib/db", () => ({
  db: {
    execute: (q: SQL) => record(q),
    transaction: async (fn: (tx: { execute: typeof record }) => Promise<void>) => fn({ execute: record }),
  },
}))
vi.mock("@/lib/log", () => ({ log: { info: () => {}, warn: () => {}, error: () => {} } }))

import { runRetentionJob } from "@/lib/jobs/retention"

describe("retention never touches analytics_events", () => {
  it("dry-run and the confirmed wet path issue no statement against it", async () => {
    await runRetentionJob({ dryRun: true, now: new Date("2027-12-01T00:00:00Z") })
    await runRetentionJob({ dryRun: false, now: new Date("2027-12-01T00:00:00Z") })
    // Positive control: the mock really saw the pass (incl. a wet DELETE).
    expect(statements.length).toBeGreaterThan(5)
    expect(statements.some((s) => /DELETE FROM jobs/.test(s))).toBe(true)
    expect(statements.filter((s) => /analytics_events/i.test(s))).toEqual([])
  })

  it("neither the module nor its CLI names the table", () => {
    expect(fs.readFileSync("lib/jobs/retention.ts", "utf8")).not.toMatch(/analytics_events/i)
    expect(fs.readFileSync("scripts/job-retention-ai-runs.ts", "utf8")).not.toMatch(/analytics_events/i)
  })
})
