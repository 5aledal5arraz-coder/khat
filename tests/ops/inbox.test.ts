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
import {
  INBOX_NEW_STATUS,
  INBOX_STATUS_PARAM,
  matchesInboxStatus,
} from "@/lib/ops/inbox-filter"

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

/**
 * The link contract. The card's own copy promises every channel opens on the
 * waiting items; two of the four opened the FULL list instead, so the number
 * the operator had just read was unverifiable on arrival.
 */
describe("inbox links — «مفلتر مسبقًا» has to be true", () => {
  const CH = buildInboxChannels({
    guest_applications: 3,
    sponsorship_leads: 1,
    community_contributions: 2,
    teaser_questions: 5,
  })
  const href = (k: string) => CH.find((c) => c.key === k)!.href

  it("opens guest applications on the new slice, not the whole list", () => {
    expect(href("guest_applications")).toBe(
      `/admin/submissions?tab=guests&${INBOX_STATUS_PARAM}=${INBOX_NEW_STATUS}`,
    )
  })

  it("opens sponsorship leads on the new slice, not the whole list", () => {
    expect(href("sponsorship_leads")).toBe(
      `/admin/submissions?tab=sponsors&${INBOX_STATUS_PARAM}=${INBOX_NEW_STATUS}`,
    )
  })

  it("keeps the teaser-question filter", () => {
    expect(href("teaser_questions")).toBe("/admin/teaser-questions?status=pending")
  })

  it("sends every submissions channel through the shared param name", () => {
    for (const c of CH) {
      if (!c.href.startsWith("/admin/submissions")) continue
      expect(c.href).toContain(`${INBOX_STATUS_PARAM}=`)
    }
  })
})

/**
 * The destination filter and the counter must be ONE rule. `guest_applications`
 * and `sponsorship_leads` are nullable with no CHECK, and the counter's
 * `COALESCE(status,'new')` deliberately counts a NULL as new; if the list
 * dropped those rows the card would count records the page then hides.
 */
describe("matchesInboxStatus — the in-memory twin of COALESCE(status,'new')", () => {
  it("treats a NULL status as new, exactly like the SQL", () => {
    expect(matchesInboxStatus(null, "new")).toBe(true)
    expect(matchesInboxStatus(undefined, "new")).toBe(true)
  })

  it("treats an empty-string status as new too", () => {
    expect(matchesInboxStatus("", "new")).toBe(true)
  })

  it("excludes rows that have already been triaged", () => {
    expect(matchesInboxStatus("accepted", "new")).toBe(false)
    expect(matchesInboxStatus("under_review", "new")).toBe(false)
  })

  it("matches a non-new filter exactly, without the NULL fallback firing", () => {
    expect(matchesInboxStatus("accepted", "accepted")).toBe(true)
    expect(matchesInboxStatus(null, "accepted")).toBe(false)
  })

  it("matches everything when there is no filter — the unfiltered entrance", () => {
    expect(matchesInboxStatus(null, null)).toBe(true)
    expect(matchesInboxStatus("rejected", null)).toBe(true)
  })
})
