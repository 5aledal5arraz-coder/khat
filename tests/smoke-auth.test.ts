/**
 * Smoke tests: Admin auth — password hashing, session tokens, password validation.
 * These test pure functions that don't need DB, plus DB-dependent flows via mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock DB before importing auth module
import { mockDb, mockSelectResult, resetMock } from "./db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
  validateAdminPassword,
  createAdminSession,
  verifyAdminSession,
  deleteAdminSession,
  SESSION_EXPIRY_MS,
  ROLE_LEVELS,
} from "@/lib/admin/auth"

describe("Admin Auth — Pure Functions", () => {
  it("hashPassword produces a bcrypt hash that verifyPassword accepts", async () => {
    const plain = "SecureP@ss123"
    const hash = await hashPassword(plain)

    expect(hash).toBeTruthy()
    expect(hash).not.toBe(plain)
    expect(await verifyPassword(plain, hash)).toBe(true)
    expect(await verifyPassword("wrong", hash)).toBe(false)
    // bcryptjs is pure-JS; one hash + two compares at 12 rounds can exceed
    // vitest's default 5s timeout under CPU contention. Give it headroom.
  }, 20000)

  it("generateSessionToken returns a 64-char hex string", () => {
    const token = generateSessionToken()
    expect(token).toMatch(/^[a-f0-9]{64}$/)
  })

  it("hashToken is deterministic SHA-256", () => {
    const token = "abc123"
    const h1 = hashToken(token)
    const h2 = hashToken(token)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[a-f0-9]{64}$/)
  })

  it("hashToken produces different hashes for different tokens", () => {
    expect(hashToken("aaa")).not.toBe(hashToken("bbb"))
  })

  it("SESSION_EXPIRY_MS is 12 hours", () => {
    expect(SESSION_EXPIRY_MS).toBe(12 * 60 * 60 * 1000)
  })

  it("ROLE_LEVELS hierarchy is OWNER > ADMIN > EDITOR > VIEWER", () => {
    expect(ROLE_LEVELS.OWNER).toBeGreaterThan(ROLE_LEVELS.ADMIN)
    expect(ROLE_LEVELS.ADMIN).toBeGreaterThan(ROLE_LEVELS.EDITOR)
    expect(ROLE_LEVELS.EDITOR).toBeGreaterThan(ROLE_LEVELS.VIEWER)
  })
})

describe("Admin Auth — Password Validation", () => {
  it("rejects short passwords (< 10 chars)", () => {
    const result = validateAdminPassword("Ab1234567")
    expect(result.valid).toBe(false)
  })

  it("rejects passwords without letters", () => {
    const result = validateAdminPassword("1234567890")
    expect(result.valid).toBe(false)
  })

  it("rejects passwords without numbers", () => {
    const result = validateAdminPassword("abcdefghij")
    expect(result.valid).toBe(false)
  })

  it("accepts a valid password", () => {
    const result = validateAdminPassword("SecurePass1")
    expect(result.valid).toBe(true)
  })
})

describe("Admin Auth — Session Flow (mocked DB)", () => {
  beforeEach(() => resetMock())

  it("createAdminSession inserts and returns a token", async () => {
    const token = await createAdminSession("user-1", "127.0.0.1", "Mozilla/5.0")

    expect(token).toBeTruthy()
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it("verifyAdminSession returns user when session is valid", async () => {
    const now = new Date()
    mockSelectResult([
      {
        id: "user-1",
        email: "admin@khat.com",
        role: "OWNER",
        is_active: true,
        last_login_at: null,
        created_at: now,
      },
    ])

    const user = await verifyAdminSession("some-token-hex")

    expect(user).not.toBeNull()
    expect(user!.id).toBe("user-1")
    expect(user!.email).toBe("admin@khat.com")
    expect(user!.role).toBe("OWNER")
  })

  it("verifyAdminSession returns null when no session found", async () => {
    mockSelectResult([])

    const user = await verifyAdminSession("expired-token")
    expect(user).toBeNull()
  })

  it("deleteAdminSession calls delete", async () => {
    await deleteAdminSession("some-token")
    expect(mockDb.delete).toHaveBeenCalled()
  })
})
