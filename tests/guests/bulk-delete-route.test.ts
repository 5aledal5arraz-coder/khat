/**
 * Guest bulk delete is a hard delete of up to 200 rows whose FKs cascade into
 * guest_identity / episode_graph and SET NULL on episodes.guest_id and the
 * EIR's guest_id. Three locks, all exercised through the real route with the
 * REAL `requireAdminAPI` role gate (only the session lookup is stubbed):
 *   1. OWNER only — an EDITOR/ADMIN gets 403 and nothing is touched.
 *   2. A guest linked to an episode or an EIR is skipped and reported.
 *   3. Every delete writes an admin_audit_logs row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AdminRole, AdminUser } from "@/lib/admin/auth"

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn() }))
vi.mock("fs/promises", () => ({ unlink: vi.fn(async () => undefined) }))

const logAuditEvent = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/admin/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/auth")>()
  return { ...actual, verifyAdminSession: vi.fn(), logAuditEvent }
})

const q = vi.hoisted(() => ({
  deleteGuest: vi.fn(),
  getGuestById: vi.fn(),
  findGuestLinks: vi.fn(),
}))
vi.mock("@/lib/admin/queries", () => q)

import { cookies, headers } from "next/headers"
import { verifyAdminSession } from "@/lib/admin/auth"
import { POST } from "@/app/api/admin/guests/bulk-delete/route"

function actAs(role: AdminRole) {
  vi.mocked(cookies).mockResolvedValue({
    get: (n: string) => (n === "__admin_session" ? { value: "tok" } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>)
  vi.mocked(headers).mockResolvedValue({
    get: (n: string) => (n === "x-request-method" ? "POST" : null),
  } as unknown as Awaited<ReturnType<typeof headers>>)
  vi.mocked(verifyAdminSession).mockResolvedValue({
    id: "owner-1",
    email: "o@khat.local",
    display_name: null,
    job_title: null,
    role,
    is_active: true,
    last_login_at: null,
    created_at: new Date(),
  } as AdminUser)
}

const req = (ids: string[]) =>
  new Request("http://localhost/api/admin/guests/bulk-delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  }) as unknown as Parameters<typeof POST>[0]

beforeEach(() => {
  vi.clearAllMocks()
  q.findGuestLinks.mockResolvedValue(new Map())
  q.getGuestById.mockImplementation(async (id: string) => ({ id, name: `ضيف ${id}`, photo_url: null }))
  q.deleteGuest.mockResolvedValue({ success: true })
})

describe("POST /api/admin/guests/bulk-delete — role gate", () => {
  for (const role of ["EDITOR", "ADMIN"] as AdminRole[]) {
    it(`refuses ${role} with 403 and deletes nothing`, async () => {
      actAs(role)
      const res = await POST(req(["g1", "g2"]))
      expect(res.status).toBe(403)
      expect(q.deleteGuest).not.toHaveBeenCalled()
      expect(logAuditEvent).not.toHaveBeenCalled()
    })
  }

  it("lets the OWNER through", async () => {
    actAs("OWNER")
    const res = await POST(req(["g1"]))
    expect(res.status).toBe(200)
    expect(q.deleteGuest).toHaveBeenCalledWith("g1")
  })
})

describe("POST /api/admin/guests/bulk-delete — linked guests", () => {
  it("skips a guest linked to an episode or an EIR and reports it", async () => {
    actAs("OWNER")
    q.findGuestLinks.mockResolvedValue(
      new Map([
        ["g-ep", { episodeIds: ["ZPeBeS87EeI"], eirIds: [] }],
        ["g-eir", { episodeIds: [], eirIds: ["eir-1"] }],
      ]),
    )

    const res = await POST(req(["g-ep", "g-free", "g-eir"]))
    const body = await res.json()

    expect(q.deleteGuest).toHaveBeenCalledTimes(1)
    expect(q.deleteGuest).toHaveBeenCalledWith("g-free")
    expect(body.deletedIds).toEqual(["g-free"])
    expect(body.skipped).toBe(2)
    expect(body.skippedLinked).toEqual([
      { id: "g-ep", episodeIds: ["ZPeBeS87EeI"], eirIds: [] },
      { id: "g-eir", episodeIds: [], eirIds: ["eir-1"] },
    ])
  })

  it("reports a guest that became linked mid-request as skipped, not failed", async () => {
    actAs("OWNER")
    q.deleteGuest.mockResolvedValue({
      success: false,
      error: "linked",
      linked: { episodeIds: ["ep-x"], eirIds: [] },
    })
    const body = await (await POST(req(["g1"]))).json()
    expect(body.deleted).toBe(0)
    expect(body.failed).toBe(0)
    expect(body.skippedLinked).toEqual([{ id: "g1", episodeIds: ["ep-x"], eirIds: [] }])
  })
})

describe("POST /api/admin/guests/bulk-delete — audit", () => {
  it("writes one audit row naming the actor, the deleted and the skipped", async () => {
    actAs("OWNER")
    q.findGuestLinks.mockResolvedValue(new Map([["g-ep", { episodeIds: ["e1"], eirIds: [] }]]))

    await POST(req(["g1", "g-ep"]))

    expect(logAuditEvent).toHaveBeenCalledTimes(1)
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "owner-1",
        action: "GUESTS_BULK_DELETED",
        metadata: expect.objectContaining({
          requested: 2,
          deleted_ids: ["g1"],
          deleted_names: ["ضيف g1"],
          skipped_linked: [{ id: "g-ep", episodeIds: ["e1"], eirIds: [] }],
        }),
      }),
    )
  })
})
