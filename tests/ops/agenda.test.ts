/**
 * `/admin/ops` — «الأيام الجاية».
 *
 * Two things are locked down, and both are the section itself:
 *
 *  1. THE SOURCE PREDICATES. Each of the three sub-selects earns its WHERE
 *     clause for a stated reason (archived records aren't commitments; an
 *     already-published enrichment has nothing pending; a done task isn't due).
 *     Equally load-bearing is what is NOT here: `episodes.release_date` is not
 *     a publish gate, so reading it would report shipped work as upcoming.
 *  2. THE DISPLAY RULES. The window, the 6-row cap, overdue-first, and the
 *     three distinct end states — empty (a real answer), unreadable (never
 *     renders as empty), and truncated (never silent).
 */

import { describe, it, expect } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import {
  AGENDA_SQL,
  AGENDA_ROW_LIMIT,
  AGENDA_WINDOW_DAYS,
  buildAgenda,
  type AgendaRow,
} from "@/lib/ops/agenda"

/** The statement as Postgres will actually receive it. */
const RENDERED = new PgDialect().sqlToQuery(AGENDA_SQL).sql
const normalized = RENDERED.replace(/\s+/g, " ").toLowerCase()

describe("AGENDA_SQL — the three sources", () => {
  it("reads planned recordings from the EIR, excluding archived records", () => {
    expect(normalized).toContain("from episode_intelligence_records e")
    expect(normalized).toContain("e.recording_scheduled_at is not null")
    expect(normalized).toContain("e.archived_at is null")
  })

  it("reads scheduled enrichment content only while it is UNPUBLISHED", () => {
    expect(normalized).toContain("from episode_enrichments en")
    expect(normalized).toContain("en.scheduled_for is not null")
    // Mirrors isEnrichmentPublic()'s inert-first rule: a missing status is
    // 'published', so it must NOT be reported as pending work.
    expect(normalized).toContain(
      "coalesce(en.publish_status, 'published') <> 'published'",
    )
  })

  it("reads only OPEN CRM tasks that actually carry a due date", () => {
    expect(normalized).toContain("from crm_tasks t")
    expect(normalized).toContain("t.status = 'open'")
    expect(normalized).toContain("t.due_at is not null")
  })

  it("never reads episodes.release_date — it is not a publish gate", () => {
    expect(normalized).not.toContain("release_date")
  })

  it("carries the CRM subject so a task row can open its record", () => {
    expect(normalized).toContain("t.subject_kind")
    expect(normalized).toContain("t.subject_id")
  })
})

describe("AGENDA_SQL — the window and the fetch size", () => {
  it("bounds every source by the SAME forward window", () => {
    const windows = normalized.match(/interval '14 days'/g) ?? []
    expect(windows).toHaveLength(3)
    expect(AGENDA_WINDOW_DAYS).toBe(14)
  })

  it("puts NO backward bound on the window — overdue never ages out", () => {
    // A `>= now()` anywhere would silently drop the overdue rows, which are
    // the entire reason the section exists.
    expect(normalized).not.toContain(">= now()")
    expect(normalized).not.toContain("> now()")
  })

  it("orders ascending, so overdue rows arrive first", () => {
    expect(normalized).toContain("order by due_at asc")
  })

  it("fetches exactly one row past the cap, to detect truncation", () => {
    expect(normalized).toContain(`limit ${AGENDA_ROW_LIMIT + 1}`)
  })

  it("uses no bound parameters — the predicates are literal", () => {
    expect(new PgDialect().sqlToQuery(AGENDA_SQL).params).toEqual([])
  })
})

// ─── buildAgenda ─────────────────────────────────────────────────────

const NOW = Date.parse("2026-07-26T12:00:00.000Z")
const at = (offsetHours: number) =>
  new Date(NOW + offsetHours * 3_600_000).toISOString()

function row(over: Partial<AgendaRow> & { due_at: string }): AgendaRow {
  return {
    kind: "task",
    id: over.due_at,
    title: "عنوان",
    subject_kind: null,
    subject_id: null,
    ...over,
  }
}

describe("buildAgenda — ordering", () => {
  it("sorts ascending by date, which puts overdue on top", () => {
    const agenda = buildAgenda(
      [
        row({ due_at: at(48), id: "in-2-days" }),
        row({ due_at: at(-72), id: "overdue-3-days" }),
        row({ due_at: at(2), id: "in-2-hours" }),
        row({ due_at: at(-1), id: "overdue-1-hour" }),
      ],
      NOW,
    )!
    expect(agenda.items.map((i) => i.id)).toEqual([
      "overdue-3-days",
      "overdue-1-hour",
      "in-2-hours",
      "in-2-days",
    ])
  })

  it("flags exactly the rows whose date has passed", () => {
    const agenda = buildAgenda(
      [row({ due_at: at(-1), id: "past" }), row({ due_at: at(1), id: "future" })],
      NOW,
    )!
    expect(agenda.items.map((i) => [i.id, i.overdue])).toEqual([
      ["past", true],
      ["future", false],
    ])
  })
})

describe("buildAgenda — the row cap", () => {
  const many = Array.from({ length: 9 }, (_, i) => row({ due_at: at(i + 1), id: `r${i}` }))

  it(`renders at most ${AGENDA_ROW_LIMIT} rows`, () => {
    expect(buildAgenda(many, NOW)!.items).toHaveLength(AGENDA_ROW_LIMIT)
  })

  it("keeps the EARLIEST rows when it truncates", () => {
    expect(buildAgenda(many, NOW)!.items.map((i) => i.id)).toEqual([
      "r0", "r1", "r2", "r3", "r4", "r5",
    ])
  })

  it("says it truncated instead of hiding the rest silently", () => {
    expect(buildAgenda(many, NOW)!.hasMore).toBe(true)
  })

  it("does not claim more rows when the list fits", () => {
    expect(buildAgenda(many.slice(0, AGENDA_ROW_LIMIT), NOW)!.hasMore).toBe(false)
  })
})

describe("buildAgenda — the three end states", () => {
  it("an empty agenda is a real, empty answer — not null", () => {
    const agenda = buildAgenda([], NOW)
    expect(agenda).not.toBeNull()
    expect(agenda!.items).toEqual([])
    expect(agenda!.hasMore).toBe(false)
  })

  it("an UNREADABLE agenda stays null — it must never render as empty", () => {
    expect(buildAgenda(null, NOW)).toBeNull()
  })
})

describe("buildAgenda — every row opens its own record", () => {
  it("routes a planned recording to the EIR recording tab", () => {
    const [item] = buildAgenda(
      [row({ kind: "recording", id: "eir-1", due_at: at(4) })],
      NOW,
    )!.items
    expect(item.href).toBe("/admin/khat-brain/episodes/eir-1?tab=recording")
    expect(item.kindLabel).toBe("تصوير")
  })

  it("routes scheduled episode content to that episode", () => {
    const [item] = buildAgenda(
      [row({ kind: "enrichment", id: "ep-9", due_at: at(4) })],
      NOW,
    )!.items
    expect(item.href).toBe("/admin/episodes/ep-9")
  })

  it("routes a CRM task to its SUBJECT's record, per subject kind", () => {
    const kinds: [string, string][] = [
      ["guest", "/admin/casting/s1"],
      ["partner", "/admin/partnerships/s1"],
      ["community", "/admin/community/s1"],
    ]
    for (const [kind, href] of kinds) {
      const [item] = buildAgenda(
        [row({ kind: "task", id: "t1", due_at: at(4), subject_kind: kind, subject_id: "s1" })],
        NOW,
      )!.items
      expect(item.href).toBe(href)
    }
  })

  it("falls back to a real page for an unknown subject rather than a 404", () => {
    const [item] = buildAgenda(
      [row({ kind: "task", id: "t1", due_at: at(4), subject_kind: "sponsor", subject_id: "s1" })],
      NOW,
    )!.items
    expect(item.href).toBe("/admin/ops")
  })

  it("labels every kind in Arabic", () => {
    const agenda = buildAgenda(
      [
        row({ kind: "recording", id: "a", due_at: at(1) }),
        row({ kind: "enrichment", id: "b", due_at: at(2) }),
        row({ kind: "task", id: "c", due_at: at(3) }),
      ],
      NOW,
    )!
    for (const item of agenda.items) {
      expect(item.kindLabel).toMatch(/[؀-ۿ]/)
    }
  })
})
