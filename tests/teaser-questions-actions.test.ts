/**
 * Role gate on the three teaser-question moderation actions.
 *
 * The real `requireActionRole` runs here (only the session lookup is stubbed),
 * so this covers the actual gate rather than a mock of it. A VIEWER must be
 * refused on ALL THREE actions — including «تراجع», which is easy to think of
 * as harmless and is still a write.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AdminRole, AdminUser } from "@/lib/admin/auth"

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

vi.mock("@/lib/admin/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/auth")>()
  return { ...actual, verifyAdminSession: vi.fn() }
})

// The DB write itself is covered in tests/teaser-questions.test.ts; here it is
// stubbed so a refused call can be distinguished from a call that never ran.
const updateQuestionStatus = vi.fn(async () => true)
vi.mock("@/lib/teaser", () => ({
  updateQuestionStatus: (...args: unknown[]) => updateQuestionStatus(...(args as [])),
}))

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { verifyAdminSession } from "@/lib/admin/auth"
import {
  approveQuestionAction,
  rejectQuestionAction,
  resetQuestionAction,
} from "@/app/admin/teaser-questions/actions"

function makeUser(role: AdminRole, is_active = true): AdminUser {
  return {
    id: "user-1",
    email: "u@khat.local",
    role,
    is_active,
    last_login_at: null,
    created_at: new Date(),
  }
}

function signedInAs(role: AdminRole | null, active = true) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      role && name === "__admin_session" ? { value: "tok" } : undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>)
  vi.mocked(verifyAdminSession).mockResolvedValue(role ? makeUser(role, active) : null)
}

const ACTIONS: Array<[string, (id: string) => Promise<{ success: boolean; error?: string }>]> = [
  ["قبول", approveQuestionAction],
  ["رفض", rejectQuestionAction],
  ["تراجع", resetQuestionAction],
]

beforeEach(() => {
  vi.clearAllMocks()
  updateQuestionStatus.mockResolvedValue(true)
})

describe("teaser-question actions — VIEWER is refused", () => {
  for (const [label, action] of ACTIONS) {
    it(`refuses a VIEWER on «${label}»`, async () => {
      signedInAs("VIEWER")
      const res = await action("q-1")
      expect(res.success).toBe(false)
      expect(res.error).toBe("ليس لديك صلاحية لهذا الإجراء")
    })

    it(`does not touch the DB when a VIEWER calls «${label}»`, async () => {
      signedInAs("VIEWER")
      await action("q-1")
      expect(updateQuestionStatus).not.toHaveBeenCalled()
    })
  }
})

describe("teaser-question actions — unauthenticated and deactivated", () => {
  for (const [label, action] of ACTIONS) {
    it(`refuses an anonymous caller on «${label}»`, async () => {
      signedInAs(null)
      const res = await action("q-1")
      expect(res.success).toBe(false)
      expect(updateQuestionStatus).not.toHaveBeenCalled()
    })

    it(`refuses a DEACTIVATED editor on «${label}»`, async () => {
      signedInAs("EDITOR", false)
      const res = await action("q-1")
      expect(res.success).toBe(false)
      expect(updateQuestionStatus).not.toHaveBeenCalled()
    })
  }
})

describe("teaser-question actions — EDITOR and above", () => {
  it("«قبول» writes approved", async () => {
    signedInAs("EDITOR")
    await expect(approveQuestionAction("q-1")).resolves.toEqual({ success: true })
    expect(updateQuestionStatus).toHaveBeenCalledWith("q-1", "approved")
  })

  it("«رفض» writes rejected", async () => {
    signedInAs("EDITOR")
    await expect(rejectQuestionAction("q-1")).resolves.toEqual({ success: true })
    expect(updateQuestionStatus).toHaveBeenCalledWith("q-1", "rejected")
  })

  it("«تراجع» writes pending", async () => {
    signedInAs("EDITOR")
    await expect(resetQuestionAction("q-1")).resolves.toEqual({ success: true })
    expect(updateQuestionStatus).toHaveBeenCalledWith("q-1", "pending")
  })

  it("an OWNER is allowed too (role hierarchy, not equality)", async () => {
    signedInAs("OWNER")
    await expect(approveQuestionAction("q-1")).resolves.toEqual({ success: true })
  })

  it("refreshes both the review page and the home inbox counter", async () => {
    signedInAs("EDITOR")
    await approveQuestionAction("q-1")
    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0])
    expect(paths).toContain("/admin/teaser-questions")
    expect(paths).toContain("/admin/ops")
  })

  it("reports failure (and does not claim success) when the row is gone", async () => {
    signedInAs("EDITOR")
    updateQuestionStatus.mockResolvedValue(false)
    const res = await approveQuestionAction("q-1")
    expect(res).toEqual({ success: false, error: "السؤال غير موجود" })
  })

  it("rejects an empty question id before hitting the DB", async () => {
    signedInAs("EDITOR")
    const res = await approveQuestionAction("")
    expect(res.success).toBe(false)
    expect(updateQuestionStatus).not.toHaveBeenCalled()
  })
})
