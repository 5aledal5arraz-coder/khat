/**
 * `/admin/ops` — «الوارد» inbox counters.
 *
 * Two things are locked down here, and both are the feature itself rather than
 * an implementation detail:
 *
 *  1. THE COUNT CONDITION. `guest_applications.status` and
 *     `sponsorship_leads.status` are nullable with NO check constraint, and
 *     `teaser_questions.status` is nullable too (its CHECK passes on NULL,
 *     because `NULL IN (…)` is NULL, not FALSE). If any of those three loses
 *     its COALESCE the counter silently under-reports and the operator is told
 *     an inbox is empty when it isn't — the exact failure this section exists
 *     to end. Equally, teaser questions must be counted with NO extra
 *     condition: filtering on "the teaser is still active" would rebuild the
 *     hidden queue.
 *  2. THE ZERO STATE. Zero is a real answer and renders as 0 with a working
 *     link; UNREADABLE is a different answer and must never render as 0.
 */

import { describe, it, expect } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import {
  INBOX_COUNTS_SQL,
  INBOX_CHANNEL_KEYS,
  buildInboxChannels,
  totalWaiting,
  type InboxCounts,
} from "@/lib/ops/inbox"

/** The statement as Postgres will actually receive it. */
const RENDERED = new PgDialect().sqlToQuery(INBOX_COUNTS_SQL).sql
const normalized = RENDERED.replace(/\s+/g, " ").toLowerCase()

describe("INBOX_COUNTS_SQL — the count conditions", () => {
  it("counts guest applications as new, treating a NULL status as new", () => {
    expect(normalized).toContain(
      "select count(*) from guest_applications where coalesce(status, 'new') = 'new'",
    )
  })

  it("counts sponsorship leads as new, treating a NULL status as new", () => {
    expect(normalized).toContain(
      "select count(*) from sponsorship_leads where coalesce(status, 'new') = 'new'",
    )
  })

  it("counts new community contributions and excludes spam", () => {
    expect(normalized).toContain(
      "select count(*) from community_contributions where status = 'new' and spam = false",
    )
  })

  it("counts teaser questions as pending, treating a NULL status as pending", () => {
    expect(normalized).toContain(
      "select count(*) from teaser_questions where coalesce(status, 'pending') = 'pending'",
    )
  })

  it("adds NO further condition to the teaser-question count", () => {
    // Isolate the teaser_questions sub-select and assert its WHERE clause is
    // the status predicate and nothing else — no is_active, no window, no join.
    const sub = normalized.match(
      /select count\(\*\) from teaser_questions where (.*?)\)::int/,
    )
    expect(sub).not.toBeNull()
    expect(sub![1].trim()).toBe("coalesce(status, 'pending') = 'pending'")
  })

  it("uses no bound parameters — the predicates are literal, not caller-supplied", () => {
    expect(new PgDialect().sqlToQuery(INBOX_COUNTS_SQL).params).toEqual([])
  })

  it("aliases every channel key the reader expects", () => {
    for (const key of INBOX_CHANNEL_KEYS) {
      expect(normalized).toContain(`as ${key}`)
    }
  })
})

describe("buildInboxChannels — zero state", () => {
  const ZERO: InboxCounts = {
    guest_applications: 0,
    sponsorship_leads: 0,
    community_contributions: 0,
    teaser_questions: 0,
  }

  it("returns all four channels", () => {
    expect(buildInboxChannels(ZERO).map((c) => c.key)).toEqual([...INBOX_CHANNEL_KEYS])
  })

  it("reports a real 0 (not null) when the queue is genuinely empty", () => {
    for (const c of buildInboxChannels(ZERO)) {
      expect(c.count).toBe(0)
    }
  })

  it("still links to the filtered destination at zero", () => {
    const q = buildInboxChannels(ZERO).find((c) => c.key === "teaser_questions")!
    expect(q.href).toBe("/admin/teaser-questions?status=pending")
  })

  it("carries an Arabic empty hint for every channel", () => {
    for (const c of buildInboxChannels(ZERO)) {
      expect(c.emptyHint.length).toBeGreaterThan(0)
    }
  })

  it("totals to 0 rather than to null", () => {
    expect(totalWaiting(ZERO)).toBe(0)
  })
})

describe("buildInboxChannels — unreadable state", () => {
  it("renders an unreadable count as null, never as 0", () => {
    for (const c of buildInboxChannels(null)) {
      expect(c.count).toBeNull()
    }
  })

  it("keeps the links usable even when the counts failed", () => {
    for (const c of buildInboxChannels(null)) {
      expect(c.href.startsWith("/admin/")).toBe(true)
    }
  })

  it("reports an unreadable total as null, never as 0", () => {
    expect(totalWaiting(null)).toBeNull()
  })
})

describe("totalWaiting", () => {
  it("sums the four channels", () => {
    expect(
      totalWaiting({
        guest_applications: 2,
        sponsorship_leads: 1,
        community_contributions: 4,
        teaser_questions: 3,
      }),
    ).toBe(10)
  })
})
