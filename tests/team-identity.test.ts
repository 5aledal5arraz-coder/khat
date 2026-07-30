/**
 * Team identity — the member's name and his صفحة (job_title).
 *
 * Three things are pinned here, and the third is the important one:
 *
 *   1. the room SCREEN comes from `job_title` when the member has one;
 *   2. it falls back to deriving from the permission role when he doesn't, so
 *      every account that predates the column behaves exactly as before;
 *   3. `job_title` grants NO permission. It is a descriptive field edited from
 *      /admin/team, so if an action gate ever read it, renaming someone's صفحة
 *      would hand out the "ابدأ التسجيل" button. `requireActionRole` must keep
 *      reading `admin_users.role` and nothing else.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AdminRole, AdminUser } from "@/lib/admin/auth"
import {
  EXPORT_ANONYMOUS_NAME,
  JOB_TITLES,
  JOB_TITLE_META,
  exportSafeMemberName,
  isJobTitle,
  jobTitleLabel,
  resolveMemberName,
  type JobTitle,
} from "@/lib/admin/team-identity"
import {
  adminRoleToRoomRole,
  jobTitleToRoomRole,
  resolveRoomRole,
} from "@/lib/collaboration/room-roles"

// ── Mocks for the permission-gate half (mirrors api-utils-role-gate.test.ts) ──

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }))

vi.mock("@/lib/admin/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/auth")>()
  return { ...actual, verifyAdminSession: vi.fn() }
})

vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

import { cookies, headers } from "next/headers"
import { verifyAdminSession } from "@/lib/admin/auth"
import { requireActionRole } from "@/lib/api-utils"

function makeUser(over: Partial<AdminUser> & { role: AdminRole }): AdminUser {
  return {
    id: "user-1",
    email: "fahad.alx@khat.local",
    display_name: null,
    job_title: null,
    is_active: true,
    last_login_at: null,
    created_at: new Date(),
    ...over,
  }
}

function arrange(user: AdminUser | null, method = "POST") {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      user && name === "__admin_session" ? { value: "tok" } : undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>)
  vi.mocked(headers).mockResolvedValue({
    get: (name: string) => (name === "x-request-method" ? method : null),
  } as unknown as Awaited<ReturnType<typeof headers>>)
  vi.mocked(verifyAdminSession).mockResolvedValue(user)
}

// ── 1. Catalog ────────────────────────────────────────────────────────

describe("job title catalog", () => {
  it("holds the seven titles Khaled approved, each with an Arabic label", () => {
    expect(JOB_TITLES).toEqual([
      "host",
      "director",
      "photographer",
      "sound",
      "producer",
      "editor",
      "viewer",
    ])
    for (const t of JOB_TITLES) {
      expect(JOB_TITLE_META[t].label.trim()).not.toBe("")
      expect(JOB_TITLE_META[t].title).toBe(t)
      // Arabic labels — no Latin letters leaking into user-facing text.
      expect(JOB_TITLE_META[t].label).not.toMatch(/[A-Za-z]/)
    }
  })

  it("rejects anything outside the catalog", () => {
    expect(isJobTitle("host")).toBe(true)
    expect(isJobTitle("HOST")).toBe(false)
    expect(isJobTitle("owner")).toBe(false)
    expect(isJobTitle("")).toBe(false)
    expect(isJobTitle(null)).toBe(false)
    expect(isJobTitle(undefined)).toBe(false)
    expect(jobTitleLabel("sound")).toBe("مهندس صوت")
    expect(jobTitleLabel(null)).toBeNull()
    expect(jobTitleLabel("nonsense")).toBeNull()
  })
})

// ── 2. Name resolution ────────────────────────────────────────────────

describe("resolveMemberName()", () => {
  it("uses the Arabic name when it is set", () => {
    expect(resolveMemberName({ display_name: "فهد", email: "fahad.alx@khat.local" }))
      .toBe("فهد")
  })

  it("falls back to the email local part — byte-identical to the old inline rule", () => {
    const email = "fahad.alx@khat.local"
    expect(resolveMemberName({ display_name: null, email })).toBe(email.split("@")[0])
    expect(resolveMemberName({ display_name: "   ", email })).toBe("fahad.alx")
  })

  it("never returns an empty label", () => {
    expect(resolveMemberName({ display_name: null, email: null })).toBe("operator")
    expect(resolveMemberName({})).toBe("operator")
  })
})

describe("exportSafeMemberName() — files that leave the team", () => {
  it("never falls back to the email, unlike the in-panel resolver", () => {
    // The whole point: `display_name` is nullable with no backfill, so the
    // in-panel fallback would ship a staff email local part to the external
    // editor in the marker CSV.
    const anon = exportSafeMemberName({ display_name: null, job_title: null })
    expect(anon).toBe(EXPORT_ANONYMOUS_NAME)
    expect(anon).not.toContain("@")
    expect(anon).not.toContain("fahad")
  })

  it("prefers the real name, then the صفحة, then the placeholder", () => {
    expect(exportSafeMemberName({ display_name: "فهد", job_title: "director" })).toBe("فهد")
    expect(exportSafeMemberName({ display_name: null, job_title: "director" })).toBe("مخرج")
    expect(exportSafeMemberName({ display_name: "  ", job_title: "sound" })).toBe("مهندس صوت")
    expect(exportSafeMemberName({ display_name: null, job_title: "junk" }))
      .toBe(EXPORT_ANONYMOUS_NAME)
    expect(exportSafeMemberName({})).toBe(EXPORT_ANONYMOUS_NAME)
  })

  it("cannot be handed an email at all — it takes no email field", () => {
    // Type-level guarantee restated as a runtime one: passing an email through
    // an object literal must not leak it.
    const out = exportSafeMemberName({ display_name: null } as { display_name: string | null })
    expect(out).toBe(EXPORT_ANONYMOUS_NAME)
  })
})

// ── 3. Room role: صفحة first, permission role as fallback ─────────────

describe("resolveRoomRole()", () => {
  it("uses the stored job_title when present", () => {
    // The case that motivated the whole change: OWNER *and* the مقدم.
    expect(resolveRoomRole({ jobTitle: "host", adminRole: "OWNER" })).toBe("host")
    // ...and a director who is NOT an ADMIN.
    expect(resolveRoomRole({ jobTitle: "director", adminRole: "EDITOR" })).toBe("director")
    expect(resolveRoomRole({ jobTitle: "photographer", adminRole: "VIEWER" }))
      .toBe("photographer")
    expect(resolveRoomRole({ jobTitle: "editor", adminRole: "VIEWER" })).toBe("editor")
  })

  it("overrides the old derivation — an OWNER can be something other than host", () => {
    expect(adminRoleToRoomRole("OWNER")).toBe("host")
    expect(resolveRoomRole({ jobTitle: "director", adminRole: "OWNER" })).toBe("director")
  })

  it("falls back to the admin role when there is no job_title", () => {
    for (const [adminRole, expected] of [
      ["OWNER", "host"],
      ["ADMIN", "director"],
      ["EDITOR", "editor"],
      ["VIEWER", "viewer"],
    ] as const) {
      expect(resolveRoomRole({ jobTitle: null, adminRole })).toBe(expected)
      expect(resolveRoomRole({ adminRole })).toBe(expected)
      expect(resolveRoomRole({ jobTitle: "", adminRole })).toBe(expected)
    }
  })

  it("treats an unrecognised stored value as absent, never as a better screen", () => {
    expect(resolveRoomRole({ jobTitle: "grand_wizard", adminRole: "VIEWER" })).toBe("viewer")
    expect(resolveRoomRole({ jobTitle: "OWNER", adminRole: "VIEWER" })).toBe("viewer")
  })

  it("maps sound + producer onto the neutral viewer screen, not the camera one", () => {
    // Seven titles, five room screens. They must not land on `photographer`:
    // that surface is literal camera copy (دليل التصوير / لقطات أولوية).
    expect(jobTitleToRoomRole("sound")).toBe("viewer")
    expect(jobTitleToRoomRole("producer")).toBe("viewer")
    // They are still NAMED correctly — the label comes from the catalog.
    expect(jobTitleLabel("sound")).toBe("مهندس صوت")
    expect(jobTitleLabel("producer")).toBe("منتج")
  })

  it("only ever yields a valid ParticipantRole for every catalog entry", () => {
    const allowed = ["host", "director", "photographer", "editor", "viewer"]
    for (const t of JOB_TITLES) {
      // Must stay inside chk_room_participants_role (scripts/post-schema.sql).
      expect(allowed).toContain(jobTitleToRoomRole(t))
    }
  })

  it("every ParticipantRole is also a JobTitle — the room badge depends on it", () => {
    // `roomRoleLabel()` in recording-room-shell.tsx labels BOTH the صفحة path
    // and the room-role fallback from this one catalog, which only works while
    // the five room screens are a subset of the seven صفحات. If a room role is
    // ever renamed or added without a matching صفحة, the badge silently falls
    // back to printing the raw English key — so pin it here.
    for (const role of ["host", "director", "photographer", "editor", "viewer"]) {
      expect(isJobTitle(role), `room role "${role}" has no صفحة label`).toBe(true)
      expect(jobTitleLabel(role)).not.toBeNull()
    }
  })
})

// ── 4. `requireActionRole` is blind to the صفحة ────────────────────────
//
// ⚠️ SCOPE — this section is NECESSARY BUT NOT SUFFICIENT, and on its own it
// was misleading. `requireActionRole` reads `admin_users.role` and never looks
// at a participant row, so these assertions cannot fail by construction; they
// pin the contract, they do not prove the boundary holds.
//
// The guard that DOES consume the صفحة projection is `requireRoomRole`
// (lib/collaboration/permissions.ts), and it was genuinely broken until the
// projection was removed from it. Its coverage lives in
// tests/room-role-authorization.test.ts — that is the file that fails if a
// descriptive field ever grants a permission again.

describe("requireActionRole() ignores job_title (contract, not proof)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("denies an EDITOR-gated action to a VIEWER whose صفحة is host", async () => {
    arrange(makeUser({ role: "VIEWER", job_title: "host", display_name: "فهد" }))
    const gate = await requireActionRole("EDITOR")
    expect(gate.ok).toBe(false)
  })

  it("denies it for every صفحة in the catalog while the role stays VIEWER", async () => {
    for (const title of JOB_TITLES) {
      vi.clearAllMocks()
      arrange(makeUser({ role: "VIEWER", job_title: title }))
      const gate = await requireActionRole("EDITOR")
      expect(gate.ok, `job_title=${title} must not unlock an EDITOR action`).toBe(false)
    }
  })

  it("still allows the action on role alone, with no صفحة at all", async () => {
    arrange(makeUser({ role: "EDITOR", job_title: null }))
    const gate = await requireActionRole("EDITOR")
    expect(gate.ok).toBe(true)
  })

  it("does not restrict an EDITOR whose صفحة is the lowliest one", async () => {
    // The inverse leak: a descriptive field must not TAKE permissions away
    // either, or the gate would silently depend on it.
    arrange(makeUser({ role: "EDITOR", job_title: "viewer" satisfies JobTitle }))
    const gate = await requireActionRole("EDITOR")
    expect(gate.ok).toBe(true)
  })
})
