/**
 * `deleteGuest` is shared by the single and bulk routes. Its own DELETE
 * carries the "not linked" condition (NOT EXISTS), so when it deletes nothing
 * it must say WHY — a linked guest is a refusal with the links, a missing
 * guest is a no-op success.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockDb, mockDeleteResult, mockSelectResult, resetMock } from "../db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import { deleteGuest, findGuestLinks } from "@/lib/admin/queries"

beforeEach(() => {
  resetMock()
  vi.clearAllMocks()
})

describe("deleteGuest — linked guard", () => {
  it("refuses, with the links, when the guarded DELETE removed nothing and links exist", async () => {
    mockDeleteResult(0)
    // findGuestLinks: episodes, episode_guests, EIRs (in that order)
    mockSelectResult([{ guestId: "g1", id: "ep-1" }])
    mockSelectResult([{ guestId: "g1", id: "ep-1" }, { guestId: "g1", id: "ep-2" }])
    mockSelectResult([{ guestId: "g1", id: "eir-9" }])

    const res = await deleteGuest("g1")

    expect(res.success).toBe(false)
    expect(res.linked).toEqual({ episodeIds: ["ep-1", "ep-2"], eirIds: ["eir-9"] })
  })

  it("succeeds when a row was deleted", async () => {
    mockDeleteResult(1)
    const res = await deleteGuest("g1")
    expect(res).toEqual({ success: true })
  })

  it("is a no-op success when the guest was already gone and nothing links to it", async () => {
    mockDeleteResult(0)
    const res = await deleteGuest("gone")
    expect(res.success).toBe(true)
    expect(res.linked).toBeUndefined()
  })
})

describe("findGuestLinks", () => {
  it("returns only linked guests, de-duplicating an episode seen in both link tables", async () => {
    mockSelectResult([{ guestId: "a", id: "ep-1" }])
    mockSelectResult([{ guestId: "a", id: "ep-1" }])
    mockSelectResult([{ guestId: "b", id: "eir-1" }])
    const links = await findGuestLinks(["a", "b", "c"])
    expect(links.get("a")).toEqual({ episodeIds: ["ep-1"], eirIds: [] })
    expect(links.get("b")).toEqual({ episodeIds: [], eirIds: ["eir-1"] })
    expect(links.has("c")).toBe(false)
  })
})
