/**
 * A word from the guest needs a guest.
 *
 * The message renders inside the guest card, signed «— {الاسم}، قبل نزول
 * الحلقة». Save one with no guest attached and it was stored and never shown:
 * real words typed into a field that silently discarded them. Nothing errored,
 * which is precisely the failure shape this project keeps paying for — found on
 * the demo page, not by any test.
 *
 * The write itself is stubbed, so a REFUSED call is distinguishable from one
 * that ran: asserting only on the error string would pass even if the row were
 * written anyway.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AdminRole, AdminUser } from "@/lib/admin/auth"

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
// `unstable_cache` too: the query module this action touches wraps reads in it,
// and a partial mock of `next/cache` fails at import time rather than at assert
// time — which reads like a broken test instead of a missing export.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock("@/lib/admin/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/auth")>()
  return { ...actual, verifyAdminSession: vi.fn() }
})

const createUpcomingEpisode = vi.fn(async () => ({
  ok: true as const,
  row: { id: "up-1", slug: "حلقة-تجريبية" },
}))
// Partial mock via `importOriginal`: the action also reads `UPCOMING_STATUSES`
// to validate the status, and stubbing the whole module would delete it. Only
// the WRITE is replaced — everything else stays real, so the guard is measured
// against the actual validation path rather than a fiction of it.
vi.mock("@/lib/queries/upcoming-episodes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries/upcoming-episodes")>()
  return {
    ...actual,
    createUpcomingEpisode: (...a: unknown[]) => createUpcomingEpisode(...(a as [])),
  }
})

import { cookies } from "next/headers"
import { verifyAdminSession } from "@/lib/admin/auth"
import { saveUpcomingEpisodeAction } from "@/app/admin/upcoming/actions"

function makeUser(role: AdminRole): AdminUser {
  return {
    id: "user-1",
    email: "editor@khat.local",
    name: "محرر",
    role,
    is_active: true,
    display_name: "محرر",
    job_title: null,
    last_login_at: null,
    created_at: new Date().toISOString(),
  } as unknown as AdminUser
}

function form(over: Record<string, unknown> = {}) {
  return {
    id: null,
    eir_id: "eir-1",
    slug: "حلقة-تجريبية",
    title: "عنوان",
    summary: "موضوع",
    axes: [],
    guest_id: null,
    expected_date: null,
    guest_message: null,
    guest_message_audio_url: null,
    guest_message_audio_duration: null,
    status: "draft",
    ...over,
  } as unknown as Parameters<typeof saveUpcomingEpisodeAction>[0]
}

describe("upcoming episode — the guest message needs a guest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cookies).mockResolvedValue({
      get: () => ({ value: "session-token" }),
    } as never)
    vi.mocked(verifyAdminSession).mockResolvedValue(makeUser("EDITOR") as never)
  })

  it("refuses a WRITTEN message with no guest, and does not write", async () => {
    const res = await saveUpcomingEpisodeAction(
      form({ guest_message: "سجّلت مع خط حلقة أتمنى تسمعونها" }),
    )
    expect(res.success).toBe(false)
    expect(res.error).toContain("الضيف")
    // The point of the guard: nothing reached the database.
    expect(createUpcomingEpisode).not.toHaveBeenCalled()
  })

  it("refuses a VOICE message with no guest — audio is the likelier form", async () => {
    const res = await saveUpcomingEpisodeAction(
      form({ guest_message_audio_url: "/testimonials/0123456789abcdef.m4a" }),
    )
    expect(res.success).toBe(false)
    expect(createUpcomingEpisode).not.toHaveBeenCalled()
  })

  it("treats whitespace as no guest — a spaces-only id must not satisfy it", async () => {
    const res = await saveUpcomingEpisodeAction(
      form({ guest_message: "كلمة", guest_id: "   " }),
    )
    expect(res.success).toBe(false)
    expect(createUpcomingEpisode).not.toHaveBeenCalled()
  })

  it("allows a message once a guest is attached", async () => {
    const res = await saveUpcomingEpisodeAction(
      form({ guest_message: "كلمة", guest_id: "guest-1" }),
    )
    expect(res.success).toBe(true)
    expect(createUpcomingEpisode).toHaveBeenCalledTimes(1)
  })

  it("still allows a page with no message and no guest — both are optional", async () => {
    const res = await saveUpcomingEpisodeAction(form())
    expect(res.success).toBe(true)
    expect(createUpcomingEpisode).toHaveBeenCalledTimes(1)
  })

  it("treats a whitespace-only message as no message, not as a violation", async () => {
    const res = await saveUpcomingEpisodeAction(form({ guest_message: "   " }))
    expect(res.success).toBe(true)
    expect(createUpcomingEpisode).toHaveBeenCalledTimes(1)
  })
})
