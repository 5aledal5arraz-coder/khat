/**
 * Regression coverage for the non-GET write-role gate (task 1-5) and the
 * middleware matcher that makes it unforgeable.
 *
 * Two layers are exercised:
 *   1. requireAdminAPI() — bare (no explicit minRole) must default write
 *      methods to EDITOR, keep reads open, and fail CLOSED when the method
 *      header is absent; an explicit minRole is unaffected by the method.
 *   2. middleware config.matcher — every /api/** path (INCLUDING dotted
 *      [id] segments like /api/admin/guests/a.b) must pass through the
 *      middleware, otherwise a VIEWER could smuggle a forged
 *      `x-request-method: GET` on a dotted path and skip the gate. A
 *      behavioural check confirms the middleware overwrites that forged
 *      header with the real method.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AdminRole, AdminUser } from "@/lib/admin/auth"

// Mock next/headers so we can drive cookies() (session token) and headers()
// (the x-request-method the middleware would have set).
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}))

// Keep the real ROLE_LEVELS (hasRole depends on it); stub only session verify.
vi.mock("@/lib/admin/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/auth")>()
  return { ...actual, verifyAdminSession: vi.fn() }
})

// requireAdmin() redirects via a dynamic import of next/navigation.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

// Mock the maintenance flag + rate limiter so middleware() runs without a DB.
vi.mock("@/lib/site-settings", () => ({ getMaintenanceFlag: vi.fn(async () => false) }))
vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, retry_after_seconds: 0 })),
  keyForRequest: vi.fn(() => "test-key"),
  policyForRequest: vi.fn(() => ({ max: 100, windowMs: 1000 })),
}))

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { verifyAdminSession } from "@/lib/admin/auth"
import { requireAdmin, requireAdminAPI } from "@/lib/api-utils"

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

/**
 * Simulate a request as the middleware would have prepared it: a session
 * cookie for `role` (or none), and the `x-request-method` header for
 * `method` (or none, to model a request that skipped the middleware).
 */
function arrange(opts: {
  role: AdminRole | null
  method: string | null
  active?: boolean
}) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      opts.role && name === "__admin_session" ? { value: "tok" } : undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>)

  vi.mocked(headers).mockResolvedValue({
    get: (name: string) =>
      name === "x-request-method" ? opts.method : null,
  } as unknown as Awaited<ReturnType<typeof headers>>)

  vi.mocked(verifyAdminSession).mockResolvedValue(
    opts.role ? makeUser(opts.role, opts.active ?? true) : null,
  )
}

describe("requireAdminAPI() write-role gate", () => {
  beforeEach(() => vi.clearAllMocks())

  it("(ج) allows a VIEWER on GET", async () => {
    arrange({ role: "VIEWER", method: "GET" })
    expect(await requireAdminAPI()).toBeNull()
  })

  it("allows a VIEWER on HEAD/OPTIONS (treated as reads)", async () => {
    arrange({ role: "VIEWER", method: "HEAD" })
    expect(await requireAdminAPI()).toBeNull()
    arrange({ role: "VIEWER", method: "OPTIONS" })
    expect(await requireAdminAPI()).toBeNull()
  })

  it("(أ) blocks a VIEWER on POST with 403", async () => {
    arrange({ role: "VIEWER", method: "POST" })
    const res = await requireAdminAPI()
    expect(res?.status).toBe(403)
  })

  it("blocks a VIEWER on PUT/PATCH/DELETE with 403", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      arrange({ role: "VIEWER", method })
      const res = await requireAdminAPI()
      expect(res?.status, `${method} should be 403`).toBe(403)
    }
  })

  it("(ب) fails CLOSED (403) for a VIEWER when the method header is absent", async () => {
    // Models a request that skipped the middleware: no x-request-method →
    // treated as a write → EDITOR required → VIEWER blocked.
    arrange({ role: "VIEWER", method: null })
    const res = await requireAdminAPI()
    expect(res?.status).toBe(403)
  })

  it("allows an EDITOR on a write (sufficient role)", async () => {
    arrange({ role: "EDITOR", method: "POST" })
    expect(await requireAdminAPI()).toBeNull()
  })

  it("(د) explicit minRole is unaffected by the method: VIEWER+GET+ADMIN → 403", async () => {
    arrange({ role: "VIEWER", method: "GET" })
    const res = await requireAdminAPI("ADMIN")
    expect(res?.status).toBe(403)
  })

  it("explicit minRole passes when the role is sufficient (ADMIN on GET)", async () => {
    arrange({ role: "ADMIN", method: "GET" })
    expect(await requireAdminAPI("ADMIN")).toBeNull()
  })

  it("returns 401 for an unauthenticated request", async () => {
    arrange({ role: null, method: "POST" })
    const res = await requireAdminAPI()
    expect(res?.status).toBe(401)
  })

  it("blocks a DEACTIVATED account on a bare GET with 403 — defense in depth", async () => {
    // A disabled account must not read via a bare GET either. verifyAdminSession
    // filters is_active in SQL today (→ null → 401), so this models the guard
    // still holding if that filter is ever relaxed. Mirrors requireAdmin.
    arrange({ role: "ADMIN", method: "GET", active: false })
    const res = await requireAdminAPI()
    expect(res?.status).toBe(403)
  })
})

describe("requireAdmin() read-path gate (is_active + loop-safe redirect)", () => {
  beforeEach(() => vi.clearAllMocks())

  // Drives cookie presence and the resolved session user independently, so we
  // can model a stale cookie (present) whose session no longer resolves.
  function arrangeAuth(opts: { cookie: boolean; user: AdminUser | null }) {
    vi.mocked(cookies).mockResolvedValue({
      get: (name: string) =>
        opts.cookie && name === "__admin_session" ? { value: "tok" } : undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)
    vi.mocked(verifyAdminSession).mockResolvedValue(opts.user)
  }

  it("lets an active VIEWER read (no redirect — unchanged behaviour)", async () => {
    arrangeAuth({ cookie: true, user: makeUser("VIEWER", true) })
    await requireAdmin()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("lets an active ADMIN read (no redirect)", async () => {
    arrangeAuth({ cookie: true, user: makeUser("ADMIN", true) })
    await requireAdmin()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("sends a truly unauthenticated request (no cookie) to /admin/login", async () => {
    arrangeAuth({ cookie: false, user: null })
    await requireAdmin()
    expect(redirect).toHaveBeenCalledWith("/admin/login")
  })

  it("sends a stale/expired session (cookie present, no user) through /admin/clear-session", async () => {
    // Straight-to-/admin/login would loop: middleware bounces /admin/login →
    // /admin while the cookie is present. clear-session deletes it first.
    arrangeAuth({ cookie: true, user: null })
    await requireAdmin()
    expect(redirect).toHaveBeenCalledWith("/admin/clear-session")
  })

  it("bounces a disabled account via clear-session — defense in depth", async () => {
    // verifyAdminSession() filters is_active in SQL today (→ null, covered
    // above); this models the guard still holding if that filter is relaxed.
    arrangeAuth({ cookie: true, user: makeUser("ADMIN", false) })
    await requireAdmin()
    expect(redirect).toHaveBeenCalledWith("/admin/clear-session")
  })
})

describe("middleware config.matcher coverage", () => {
  // Approximate how Next.js matches config entries: regex-style entries
  // (with a lookahead group) are full-path regexes; path-style entries
  // (/api/:path*) match on their static prefix.
  function isCovered(pathname: string): boolean {
    return config.matcher.some((entry) => {
      if (entry.includes("(?")) {
        return new RegExp(`^${entry}$`).test(pathname)
      }
      const prefix = entry.split("/:")[0]
      return pathname === prefix || pathname.startsWith(`${prefix}/`)
    })
  }

  // Imported lazily inside the describe so the file's top-level mocks are
  // already installed (middleware pulls in site-settings + rate-limit).
  let config: typeof import("@/proxy").config
  beforeEach(async () => {
    ;({ config } = await import("@/proxy"))
  })

  it("(هـ) covers dotted /api/admin [id] segments — the bypass fix", () => {
    expect(isCovered("/api/admin/guests/abc.def")).toBe(true)
    expect(isCovered("/api/admin/episodes/xy.z")).toBe(true)
    expect(isCovered("/api/admin/crm/leads/foo.bar")).toBe(true)
  })

  it("documents the original gap: the regex entry alone excludes dotted paths", () => {
    const regexEntry = config.matcher.find((e) => e.includes("(?"))!
    const onlyRegex = new RegExp(`^${regexEntry}$`)
    // The pre-fix matcher would have dropped these — proving the explicit
    // /api entry is what closes the hole (guards against a future revert).
    expect(onlyRegex.test("/api/admin/guests/abc.def")).toBe(false)
    const hasExplicitApiEntry = config.matcher.some(
      (e) => !e.includes("(?") && e.split("/:")[0] === "/api",
    )
    expect(hasExplicitApiEntry).toBe(true)
  })

  it("still covers ordinary admin + api paths", () => {
    expect(isCovered("/api/admin/guests/abc")).toBe(true)
    expect(isCovered("/api/episodes")).toBe(true)
    expect(isCovered("/admin/khat-brain/market")).toBe(true)
  })

  it("still excludes Next internals and static assets", () => {
    expect(isCovered("/_next/static/chunk.js")).toBe(false)
    expect(isCovered("/logo.png")).toBe(false)
  })
})

describe("middleware() overwrites a forged x-request-method", () => {
  it("(هـ end-to-end) a dotted write with a forged GET header is corrected to the real method", async () => {
    const { proxy } = await import("@/proxy")
    const { NextRequest } = await import("next/server")

    const req = new NextRequest("http://localhost/api/admin/guests/abc.def", {
      method: "PUT",
      headers: {
        "x-request-method": "GET", // forged by the client
        cookie: "__admin_session=tok", // authenticated so auth doesn't 401
      },
    })

    const res = await proxy(req)

    // Next encodes forwarded request headers on the response. The middleware
    // set x-request-method via .set(), so the real method (PUT) must win over
    // the client's forged GET — which is what makes the downstream gate safe.
    const forwarded = res.headers.get("x-middleware-request-x-request-method")
    expect(forwarded).toBe("PUT")
  })
})
