/**
 * Teaser question review — the data layer behind `/admin/teaser-questions`.
 *
 * The load-bearing assertion in this file is the PII one: `ip_hash` and
 * `user_agent` are abuse-tracking columns written by the public POST route,
 * and an admin page is a serialized RSC payload — a bare `select()` would ship
 * a visitor's fingerprint into the HTML. Every reader is checked twice: that
 * its SQL projection does not ASK for the two columns, and that its mapper
 * drops them even if a row somehow arrives carrying them.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

import { mockDb, mockSelectResult, mockUpdateReturning, resetMock } from "./db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import {
  TEASER_QUESTION_PUBLIC_COLUMNS,
  normalizeQuestionStatus,
  parseQuestionFilter,
  getAllQuestions,
  getPendingQuestions,
  getApprovedQuestions,
  getTeaserQuestionGroups,
  getTeaserForEpisode,
  updateQuestionStatus,
} from "@/lib/teaser"

const PII_FIELDS = ["ip_hash", "user_agent"] as const

/** A row as the DB would hand it back IF someone reverted to `select()`. */
function rawRow(over: Record<string, unknown> = {}) {
  return {
    id: "q-1",
    teaser_id: "teaser-1",
    display_name: "أحمد",
    question_text: "شنو أصعب قرار اتخذته؟",
    status: "pending",
    created_at: new Date("2026-07-20T10:00:00Z"),
    ip_hash: "deadbeefdeadbeef",
    user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5)",
    ...over,
  }
}

beforeEach(() => {
  resetMock()
  mockDb.select.mockClear()
  mockDb.update.mockClear()
})

// ─── The projection itself ───────────────────────────────────────────────────

describe("TEASER_QUESTION_PUBLIC_COLUMNS", () => {
  it("names exactly the six public columns", () => {
    expect(Object.keys(TEASER_QUESTION_PUBLIC_COLUMNS).sort()).toEqual([
      "created_at",
      "display_name",
      "id",
      "question_text",
      "status",
      "teaser_id",
    ])
  })

  it("does not include ip_hash or user_agent", () => {
    for (const f of PII_FIELDS) {
      expect(Object.keys(TEASER_QUESTION_PUBLIC_COLUMNS)).not.toContain(f)
    }
  })
})

// ─── No PII in any reader ────────────────────────────────────────────────────

describe("question readers never expose ip_hash / user_agent", () => {
  const readers: Array<[string, () => Promise<unknown[]>]> = [
    ["getAllQuestions", () => getAllQuestions("teaser-1")],
    ["getPendingQuestions", () => getPendingQuestions("teaser-1")],
    ["getApprovedQuestions", () => getApprovedQuestions("teaser-1")],
  ]

  for (const [name, run] of readers) {
    it(`${name} asks the DB for public columns only`, async () => {
      mockSelectResult([rawRow()])
      await run()
      const projection = mockDb.select.mock.calls[0][0] as Record<string, unknown>
      expect(projection).toBeDefined()
      for (const f of PII_FIELDS) {
        expect(Object.keys(projection)).not.toContain(f)
      }
    })

    it(`${name} strips ip_hash / user_agent from rows that carry them`, async () => {
      mockSelectResult([rawRow()])
      const out = (await run()) as Array<Record<string, unknown>>
      expect(out).toHaveLength(1)
      for (const f of PII_FIELDS) {
        expect(out[0]).not.toHaveProperty(f)
      }
      // And the serialized payload — what actually reaches the browser.
      expect(JSON.stringify(out)).not.toContain("deadbeefdeadbeef")
      expect(JSON.stringify(out)).not.toContain("Mozilla")
    })
  }

  it("getTeaserQuestionGroups keeps ip_hash / user_agent out of the payload", async () => {
    mockSelectResult([
      {
        ...rawRow(),
        t_id: "teaser-1",
        t_title: "تيزر الحلقة",
        t_guest_name: "سارة",
        t_eir_id: "eir-1",
        t_is_active: true,
        t_publish_at: null,
        t_expire_at: null,
        eir_working_title: "عنوان مبدئي",
        eir_final_title: null,
      },
    ])
    const groups = await getTeaserQuestionGroups("pending")
    expect(groups).toHaveLength(1)
    for (const f of PII_FIELDS) {
      expect(groups[0].questions[0]).not.toHaveProperty(f)
    }
    const payload = JSON.stringify(groups)
    expect(payload).not.toContain("deadbeefdeadbeef")
    expect(payload).not.toContain("Mozilla")
  })
})

// ─── NULL-safe status ────────────────────────────────────────────────────────

describe("normalizeQuestionStatus", () => {
  it("passes through the three real states", () => {
    expect(normalizeQuestionStatus("pending")).toBe("pending")
    expect(normalizeQuestionStatus("approved")).toBe("approved")
    expect(normalizeQuestionStatus("rejected")).toBe("rejected")
  })

  it("reads NULL as pending — a NULL status must not hide a question", () => {
    // The column is nullable and its CHECK passes on NULL (`NULL IN (…)` is
    // NULL, not FALSE), so this case is reachable via a raw insert.
    expect(normalizeQuestionStatus(null)).toBe("pending")
    expect(normalizeQuestionStatus(undefined)).toBe("pending")
  })

  it("reads any unknown value as pending rather than dropping it", () => {
    expect(normalizeQuestionStatus("archived")).toBe("pending")
  })
})

// ─── Filter parsing ──────────────────────────────────────────────────────────

describe("parseQuestionFilter", () => {
  it("accepts the four slices", () => {
    for (const f of ["pending", "approved", "rejected", "all"]) {
      expect(parseQuestionFilter(f)).toBe(f)
    }
  })

  it("defaults to pending for anything else", () => {
    expect(parseQuestionFilter(undefined)).toBe("pending")
    expect(parseQuestionFilter("")).toBe("pending")
    expect(parseQuestionFilter("deleted")).toBe("pending")
    expect(parseQuestionFilter("' OR 1=1--")).toBe("pending")
  })
})

// ─── Grouping / ordering / live flag ─────────────────────────────────────────

function joinedRow(over: Record<string, unknown> = {}) {
  return {
    ...rawRow(),
    t_id: "teaser-1",
    t_title: "تيزر الحلقة",
    t_guest_name: "سارة",
    t_eir_id: "eir-1",
    t_is_active: true,
    t_publish_at: null,
    t_expire_at: null,
    eir_working_title: "عنوان مبدئي",
    eir_final_title: "العنوان النهائي",
    ...over,
  }
}

describe("getTeaserQuestionGroups", () => {
  it("groups questions under their teaser and keeps the DB order", async () => {
    mockSelectResult([
      joinedRow({ id: "q-1", created_at: new Date("2026-07-01T00:00:00Z") }),
      joinedRow({ id: "q-2", created_at: new Date("2026-07-05T00:00:00Z") }),
      joinedRow({ id: "q-3", t_id: "teaser-2", t_title: "تيزر ثاني" }),
    ])
    const groups = await getTeaserQuestionGroups("all")
    expect(groups.map((g) => g.teaserId)).toEqual(["teaser-1", "teaser-2"])
    // Oldest-waiting first inside the group (the query orders ASC; the mapper
    // must not reshuffle it).
    expect(groups[0].questions.map((q) => q.id)).toEqual(["q-1", "q-2"])
  })

  it("prefers the EIR final title, falling back to the working title", async () => {
    mockSelectResult([joinedRow({ eir_final_title: null })])
    const [g] = await getTeaserQuestionGroups("all")
    expect(g.episodeTitle).toBe("عنوان مبدئي")
  })

  it("marks an active, in-window teaser as live", async () => {
    mockSelectResult([joinedRow({ t_is_active: true })])
    const [g] = await getTeaserQuestionGroups("all")
    expect(g.isLive).toBe(true)
  })

  it("marks an inactive teaser as not live", async () => {
    mockSelectResult([joinedRow({ t_is_active: false })])
    const [g] = await getTeaserQuestionGroups("all")
    expect(g.isLive).toBe(false)
  })

  it("marks an expired teaser as not live even while is_active is true", async () => {
    mockSelectResult([
      joinedRow({ t_is_active: true, t_expire_at: "2000-01-01T00:00:00Z" }),
    ])
    const [g] = await getTeaserQuestionGroups("all")
    expect(g.isLive).toBe(false)
  })

  it("returns an empty list — not a throw — when the query fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { mockSelectRejection } = await import("./db-mock")
    mockSelectRejection(new Error("ETIMEDOUT"))
    await expect(getTeaserQuestionGroups("pending")).resolves.toEqual([])
    spy.mockRestore()
  })
})

// ─── The public form's gate ──────────────────────────────────────────────────

/**
 * `acceptsQuestions` decides whether the public «اسأل الضيف» form renders. The
 * episode/guest pages show a teaser as an ARCHIVE block regardless of its
 * state, so without this flag a finished teaser would keep collecting
 * questions into a queue that has already been closed.
 */
function teaserRow(over: Record<string, unknown> = {}) {
  return {
    id: "teaser-1",
    eir_id: "eir-1",
    guest_id: "guest-1",
    guest_name: "سارة",
    title: "تيزر الحلقة",
    prompt: "شنو تبي تسأل الضيف؟",
    video_filename: "abcdef0123456789.mp4",
    poster_image: null,
    is_active: true,
    publish_at: null,
    expire_at: null,
    created_at: new Date("2026-07-01T00:00:00Z"),
    updated_at: new Date("2026-07-01T00:00:00Z"),
    ...over,
  }
}

describe("ActiveTeaserView — the public question form gate", () => {
  it("exposes the existing `prompt` column to the public view", async () => {
    mockSelectResult([teaserRow()])
    const view = await getTeaserForEpisode("eir-1")
    expect(view?.prompt).toBe("شنو تبي تسأل الضيف؟")
  })

  it("accepts questions while the teaser is active and in window", async () => {
    mockSelectResult([teaserRow()])
    const view = await getTeaserForEpisode("eir-1")
    expect(view?.acceptsQuestions).toBe(true)
  })

  it("refuses questions once the teaser is deactivated", async () => {
    mockSelectResult([teaserRow({ is_active: false })])
    const view = await getTeaserForEpisode("eir-1")
    expect(view?.acceptsQuestions).toBe(false)
  })

  it("refuses questions after the expiry date, even while still active", async () => {
    mockSelectResult([teaserRow({ expire_at: "2000-01-01T00:00:00Z" })])
    const view = await getTeaserForEpisode("eir-1")
    expect(view?.acceptsQuestions).toBe(false)
  })

  it("refuses questions before the publish date opens", async () => {
    mockSelectResult([teaserRow({ publish_at: "2999-01-01T00:00:00Z" })])
    const view = await getTeaserForEpisode("eir-1")
    expect(view?.acceptsQuestions).toBe(false)
  })
})

// ─── The three status transitions ────────────────────────────────────────────

describe("updateQuestionStatus — the three transitions", () => {
  it("approves a pending question", async () => {
    mockUpdateReturning([{ id: "q-1" }])
    await expect(updateQuestionStatus("q-1", "approved")).resolves.toBe(true)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    const setArg = mockDb.update.mock.results[0].value.set.mock.calls[0][0]
    expect(setArg).toEqual({ status: "approved" })
  })

  it("rejects a pending question", async () => {
    mockUpdateReturning([{ id: "q-1" }])
    await expect(updateQuestionStatus("q-1", "rejected")).resolves.toBe(true)
    const setArg = mockDb.update.mock.results[0].value.set.mock.calls[0][0]
    expect(setArg).toEqual({ status: "rejected" })
  })

  it("undoes back to pending — a mis-click is never final", async () => {
    mockUpdateReturning([{ id: "q-1" }])
    await expect(updateQuestionStatus("q-1", "pending")).resolves.toBe(true)
    const setArg = mockDb.update.mock.results[0].value.set.mock.calls[0][0]
    expect(setArg).toEqual({ status: "pending" })
  })

  it("writes ONLY the status column — no audit fields exist to write", async () => {
    mockUpdateReturning([{ id: "q-1" }])
    await updateQuestionStatus("q-1", "approved")
    const setArg = mockDb.update.mock.results[0].value.set.mock.calls[0][0]
    expect(Object.keys(setArg)).toEqual(["status"])
  })

  it("reports failure when the question no longer exists", async () => {
    mockUpdateReturning([])
    await expect(updateQuestionStatus("gone", "approved")).resolves.toBe(false)
  })
})
