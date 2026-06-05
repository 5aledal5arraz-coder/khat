/**
 * Phase 1.1 — Sliding session window: pure-decision unit tests.
 *
 * The slide decision lives in `decideSessionSlide()` — pure, no I/O.
 * These tests exhaust the 3 boundary cases mandated by the P1.1 plan
 * plus the throttle + cap edge cases, so a future regression in the
 * helper fails the suite before it can ship.
 */

import { describe, expect, it } from "vitest"
import {
  decideSessionSlide,
  SLIDE_THRESHOLD_MS,
  SLIDE_INCREMENT_MS,
  SESSION_ABSOLUTE_CAP_MS,
  SLIDE_THROTTLE_MS,
  SESSION_EXPIRY_MS,
  isSlidingSessionEnabled,
} from "@/lib/admin/auth"

const MIN = 60 * 1000
const HOUR = 60 * MIN

/**
 * Build a self-consistent session anchor: a session that was created
 * `ageHours` ago with a fresh 12h lifetime. Lets each test name a
 * single number ("session is 11h old") and get sane timestamps back.
 */
function anchorSession(ageHours: number, opts: { lastSeenMinutesAgo?: number | null } = {}) {
  const now = new Date("2026-06-01T12:00:00Z")
  const sessionCreatedAt = new Date(now.getTime() - ageHours * HOUR)
  // Initial expiry was sessionCreatedAt + 12h. If we've slid since,
  // tests can override; default to the initial value.
  const expiresAt = new Date(sessionCreatedAt.getTime() + SESSION_EXPIRY_MS)
  const lastSeenAt =
    opts.lastSeenMinutesAgo === undefined
      ? null
      : opts.lastSeenMinutesAgo === null
        ? null
        : new Date(now.getTime() - opts.lastSeenMinutesAgo * MIN)
  return { now, sessionCreatedAt, expiresAt, lastSeenAt }
}

// ─── Constants sanity ────────────────────────────────────────────────

describe("sliding-session constants", () => {
  it("export sensible values", () => {
    expect(SLIDE_THRESHOLD_MS).toBe(2 * HOUR)
    expect(SLIDE_INCREMENT_MS).toBe(30 * MIN)
    expect(SESSION_ABSOLUTE_CAP_MS).toBe(24 * HOUR)
    expect(SLIDE_THROTTLE_MS).toBe(5 * MIN)
    expect(SESSION_EXPIRY_MS).toBe(12 * HOUR)
  })
})

// ─── Three required boundary cases (from the P1.1 plan) ──────────────

describe("decideSessionSlide — required boundary cases", () => {
  it("CASE 1 (well inside the 12h window): does NOT slide", () => {
    // Session is 0h 5m old → 11h 55m of life remaining → far above the 2h threshold.
    const anchor = anchorSession(5 / 60)
    const out = decideSessionSlide(anchor)
    expect(out.shouldSlide).toBe(false)
  })

  it("CASE 2 (1h-remaining: eligible by threshold, but slide would shrink): does NOT slide", () => {
    // 11h after login → 1h left until expiry. Inside the 2h slide
    // threshold, well under the 24h cap, last_seen_at null. BUT the
    // proposed new expiry is now + 30min, which is EARLIER than the
    // current expiry (now + 1h). The guard refuses to shrink a
    // session, so this is a no-slide outcome. Documents the guarantee.
    const anchor = anchorSession(11)
    const out = decideSessionSlide(anchor)
    expect(out.shouldSlide).toBe(false)
  })

  it("CASE 2b (tighter near-expiry, no recent activity): SLIDES and new expiry is now+30m", () => {
    // 11h 55m after login → 5m left. Below the slide threshold.
    // newExpiry should be now + 30min, comfortably later than the
    // old expiry (now + 5min). The slide should happen.
    const anchor = anchorSession(11 + 55 / 60)
    const out = decideSessionSlide(anchor)
    expect(out.shouldSlide).toBe(true)
    if (!out.shouldSlide) throw new Error("type narrowing")
    const newMs = out.newExpiresAt.getTime()
    const nowMs = anchor.now.getTime()
    // New expiry is now + 30min, capped at sessionCreatedAt + 24h.
    // 11h55m + 30min = 12h25m total, well under the 24h cap.
    expect(newMs - nowMs).toBe(SLIDE_INCREMENT_MS)
    expect(newMs).toBeGreaterThan(anchor.expiresAt.getTime())
  })

  it("CASE 3 (past 24h absolute cap): does NOT slide", () => {
    // Session was originally 12h. To express "past 24h cap" with a
    // current near-expiry, the session must have been slid many times.
    // Manually anchor: sessionCreatedAt = 25h ago, expiresAt = now+5m
    // (i.e. the session is currently valid but the user has been on it
    // for over a day).
    const now = new Date("2026-06-01T12:00:00Z")
    const sessionCreatedAt = new Date(now.getTime() - 25 * HOUR)
    const expiresAt = new Date(now.getTime() + 5 * MIN)
    const out = decideSessionSlide({
      now,
      sessionCreatedAt,
      expiresAt,
      lastSeenAt: null,
    })
    expect(out.shouldSlide).toBe(false)
  })
})

// ─── Throttle behaviour ──────────────────────────────────────────────

describe("decideSessionSlide — 5-minute throttle", () => {
  it("near expiry but last_seen_at was 1 minute ago: throttled (no slide)", () => {
    const anchor = anchorSession(11 + 55 / 60, { lastSeenMinutesAgo: 1 })
    const out = decideSessionSlide(anchor)
    expect(out.shouldSlide).toBe(false)
  })

  it("near expiry, last_seen_at was 10 minutes ago: SLIDES", () => {
    const anchor = anchorSession(11 + 55 / 60, { lastSeenMinutesAgo: 10 })
    const out = decideSessionSlide(anchor)
    expect(out.shouldSlide).toBe(true)
  })

  it("null last_seen_at is treated as 'never slid' → SLIDES", () => {
    const anchor = anchorSession(11 + 55 / 60, { lastSeenMinutesAgo: null })
    const out = decideSessionSlide(anchor)
    expect(out.shouldSlide).toBe(true)
  })
})

// ─── 24h absolute cap clamping ───────────────────────────────────────

describe("decideSessionSlide — 24h cap clamps the new expiry", () => {
  it("at 23h 45m old with 5m left, slide is clamped to created_at + 24h", () => {
    // sessionCreatedAt = 23h 45m ago; expires_at = now + 5m.
    // Cap = sessionCreatedAt + 24h = now + 15min, so there's 10min
    // of headroom over current expiry. Proposing now + 30min gets
    // clamped down to now + 15min, which still improves over the
    // current expiry by 10min. Slide goes through, new expiry sits
    // exactly at the cap.
    const now = new Date("2026-06-01T12:00:00Z")
    const sessionCreatedAt = new Date(now.getTime() - (23 * HOUR + 45 * MIN))
    const expiresAt = new Date(now.getTime() + 5 * MIN)
    const absoluteCap = new Date(sessionCreatedAt.getTime() + SESSION_ABSOLUTE_CAP_MS)
    const out = decideSessionSlide({
      now,
      sessionCreatedAt,
      expiresAt,
      lastSeenAt: null,
    })
    expect(out.shouldSlide).toBe(true)
    if (!out.shouldSlide) throw new Error("type narrowing")
    expect(out.newExpiresAt.getTime()).toBe(absoluteCap.getTime())
    // And the new expiry must still strictly improve on the current one.
    expect(out.newExpiresAt.getTime()).toBeGreaterThan(expiresAt.getTime())
  })

  it("at 23h 55m old with 5m left, cap == current expiry → no slide (no room to extend)", () => {
    // sessionCreatedAt = 23h 55m ago; expiresAt = now + 5m.
    // Cap = now + 5min, exactly equal to current expiry. The
    // strictly-improving guard refuses (newMs > expiresMs fails).
    // This is the documented "no room to slide" boundary.
    const now = new Date("2026-06-01T12:00:00Z")
    const sessionCreatedAt = new Date(now.getTime() - (23 * HOUR + 55 * MIN))
    const expiresAt = new Date(now.getTime() + 5 * MIN)
    const out = decideSessionSlide({
      now,
      sessionCreatedAt,
      expiresAt,
      lastSeenAt: null,
    })
    expect(out.shouldSlide).toBe(false)
  })

  it("at exactly 24h 00m old: 24h cap is reached → no slide regardless of remaining time", () => {
    const now = new Date("2026-06-01T12:00:00Z")
    const sessionCreatedAt = new Date(now.getTime() - 24 * HOUR)
    const expiresAt = new Date(now.getTime() + 30 * MIN)
    const out = decideSessionSlide({
      now,
      sessionCreatedAt,
      expiresAt,
      lastSeenAt: null,
    })
    expect(out.shouldSlide).toBe(false)
  })
})

// ─── Defensive: never extend an already-expired session ──────────────

describe("decideSessionSlide — defensive guards", () => {
  it("expired session (remaining ≤ 0): does NOT slide", () => {
    const now = new Date("2026-06-01T12:00:00Z")
    const sessionCreatedAt = new Date(now.getTime() - 13 * HOUR)
    const expiresAt = new Date(now.getTime() - 1 * MIN) // already expired
    const out = decideSessionSlide({
      now,
      sessionCreatedAt,
      expiresAt,
      lastSeenAt: null,
    })
    expect(out.shouldSlide).toBe(false)
  })
})

// ─── Env flag ────────────────────────────────────────────────────────

describe("isSlidingSessionEnabled", () => {
  it("defaults to true when env var unset", () => {
    const prev = process.env.KHAT_SLIDING_SESSION_ENABLED
    delete process.env.KHAT_SLIDING_SESSION_ENABLED
    expect(isSlidingSessionEnabled()).toBe(true)
    if (prev !== undefined) process.env.KHAT_SLIDING_SESSION_ENABLED = prev
  })

  it("is true for 'true'", () => {
    const prev = process.env.KHAT_SLIDING_SESSION_ENABLED
    process.env.KHAT_SLIDING_SESSION_ENABLED = "true"
    expect(isSlidingSessionEnabled()).toBe(true)
    if (prev !== undefined) process.env.KHAT_SLIDING_SESSION_ENABLED = prev
    else delete process.env.KHAT_SLIDING_SESSION_ENABLED
  })

  it("is false only for the explicit string 'false'", () => {
    const prev = process.env.KHAT_SLIDING_SESSION_ENABLED
    process.env.KHAT_SLIDING_SESSION_ENABLED = "false"
    expect(isSlidingSessionEnabled()).toBe(false)
    if (prev !== undefined) process.env.KHAT_SLIDING_SESSION_ENABLED = prev
    else delete process.env.KHAT_SLIDING_SESSION_ENABLED
  })
})
