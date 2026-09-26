/**
 * `deleteGuest` — the "not linked" guard lives IN the DELETE's WHERE clause
 * (three NOT EXISTS sub-selects), not in a read before it. The db-mock used
 * by delete-guest-linked.test.ts never renders SQL, so it cannot see those
 * clauses: delete them and every test there stays green.
 *
 * Here a REAL drizzle instance renders the statement against a fake pg client
 * that only records what it was asked to run — no database, no network.
 */
import { describe, it, expect, vi } from "vitest"

const h = vi.hoisted(() => ({ queries: [] as Array<{ text: string; values: unknown[] }> }))

vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres")
  const schema = await import("@/lib/db/schema")
  const client = {
    query: vi.fn(async (q: { text: string; values?: unknown[] } | string, values?: unknown[]) => {
      const text = typeof q === "string" ? q : q.text
      h.queries.push({ text, values: (typeof q === "string" ? undefined : q.values) ?? values ?? [] })
      return { rows: [], rowCount: 1, command: "DELETE", fields: [] }
    }),
  }
  return { db: drizzle(client as never, { schema }), pool: client, USE_DB: true }
})

import { deleteGuest } from "@/lib/admin/queries"

describe("deleteGuest — the guard is part of the DELETE", () => {
  it("renders one DELETE whose WHERE carries NOT EXISTS for episodes, episode_guests and EIRs", async () => {
    h.queries = []
    const res = await deleteGuest("g-123")
    expect(res).toEqual({ success: true })

    expect(h.queries).toHaveLength(1) // no separate read-then-delete
    const { text, values } = h.queries[0]
    const sql = text.replace(/\s+/g, " ")
    expect(sql).toMatch(/^delete from "guests" where/i)

    const notExists = sql.match(/not exists \(select 1 from "([a-z_]+)" where "\1"\."guest_id" = \$\d+\)/gi) ?? []
    expect(notExists).toHaveLength(3)
    const tables = notExists.map((m) => /from "([a-z_]+)"/i.exec(m)![1]).sort()
    expect(tables).toEqual(["episode_guests", "episode_intelligence_records", "episodes"])

    // The id itself is bound, and every sub-select is scoped to THIS guest.
    expect(sql).toMatch(/"guests"\."id" = \$\d+/)
    expect(values.length).toBe(4)
    expect(values.every((v) => v === "g-123")).toBe(true)
    // …and they are ANDed with the id, not ORed.
    expect(sql).not.toMatch(/\bor\b/i)
  })
})
