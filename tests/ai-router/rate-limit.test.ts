/**
 * Phase 1.6 — AI rate-limit pure-policy unit tests.
 *
 * The DB-touching paths (audit-event insert, advisory locks, concurrency
 * counts) are exercised by `npm run smoke:rate-limit-burst` against the
 * local DB. This suite locks down the parts that should never need a
 * database:
 *
 *   • Tier mapping for every AiTaskKind
 *   • Mode resolution from `KHAT_RATE_LIMIT_MODE`
 *   • Env-var limit overrides + invalid-value fallback
 *   • Env-var actor allowlist parsing
 *   • Session-bypass counter (depth ≥ 0, release idempotent)
 *   • `RateLimitError` shape (name, decision, detail)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  DEFAULT_LIMITS,
  RateLimitError,
  TASK_TIER,
  enableSessionBypass,
  isSessionBypassActive,
  readActorAllowlist,
  readLimits,
  readMode,
} from "@/lib/ai-router/rate-limit"

const ENV_KEYS = [
  "KHAT_RATE_LIMIT_MODE",
  "KHAT_RATE_LIMIT_LIGHT_CONCURRENT",
  "KHAT_RATE_LIMIT_LIGHT_DAILY_USD",
  "KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT",
  "KHAT_RATE_LIMIT_EXPENSIVE_DAILY_USD",
  "KHAT_RATE_LIMIT_BYPASS_ACTORS",
] as const

function snapshotEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const k of ENV_KEYS) out[k] = process.env[k]
  return out
}

function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k]
    else process.env[k] = snap[k]
  }
}

describe("rate-limit — tier mapping", () => {
  it("classifies structural / verification / analysis as light", () => {
    expect(TASK_TIER.structural).toBe("light")
    expect(TASK_TIER.verification).toBe("light")
    expect(TASK_TIER.analysis).toBe("light")
  })
  it("classifies editorial / discovery / research as expensive", () => {
    expect(TASK_TIER.editorial).toBe("expensive")
    expect(TASK_TIER.discovery).toBe("expensive")
    expect(TASK_TIER.research).toBe("expensive")
  })
  it("covers every AiTaskKind in the registry (no silent gaps)", () => {
    const kinds = [
      "structural",
      "editorial",
      "discovery",
      "verification",
      "research",
      "analysis",
    ] as const
    for (const k of kinds) {
      expect(TASK_TIER[k]).toMatch(/^(light|expensive)$/)
    }
  })
})

describe("rate-limit — default limits", () => {
  it("light tier: 10 concurrent / $5 daily", () => {
    expect(DEFAULT_LIMITS.light.maxConcurrent).toBe(10)
    expect(DEFAULT_LIMITS.light.maxDailyCostUsd).toBe(5)
  })
  it("expensive tier: 3 concurrent / $25 daily", () => {
    expect(DEFAULT_LIMITS.expensive.maxConcurrent).toBe(3)
    expect(DEFAULT_LIMITS.expensive.maxDailyCostUsd).toBe(25)
  })
})

describe("rate-limit — readMode", () => {
  let snap: Record<string, string | undefined>
  beforeEach(() => {
    snap = snapshotEnv()
  })
  afterEach(() => restoreEnv(snap))

  it("defaults to 'report' when unset", () => {
    delete process.env.KHAT_RATE_LIMIT_MODE
    expect(readMode()).toBe("report")
  })
  it("recognises 'off'", () => {
    process.env.KHAT_RATE_LIMIT_MODE = "off"
    expect(readMode()).toBe("off")
  })
  it("recognises 'enforce'", () => {
    process.env.KHAT_RATE_LIMIT_MODE = "enforce"
    expect(readMode()).toBe("enforce")
  })
  it("is case-insensitive + trims whitespace", () => {
    process.env.KHAT_RATE_LIMIT_MODE = "  ENFORCE  "
    expect(readMode()).toBe("enforce")
  })
  it("garbage values fall back to 'report' (safe default)", () => {
    process.env.KHAT_RATE_LIMIT_MODE = "not-a-mode"
    expect(readMode()).toBe("report")
  })
})

describe("rate-limit — readLimits", () => {
  let snap: Record<string, string | undefined>
  beforeEach(() => {
    snap = snapshotEnv()
  })
  afterEach(() => restoreEnv(snap))

  it("returns defaults when no overrides set", () => {
    delete process.env.KHAT_RATE_LIMIT_LIGHT_CONCURRENT
    delete process.env.KHAT_RATE_LIMIT_LIGHT_DAILY_USD
    delete process.env.KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT
    delete process.env.KHAT_RATE_LIMIT_EXPENSIVE_DAILY_USD
    expect(readLimits()).toEqual(DEFAULT_LIMITS)
  })
  it("applies all four overrides when valid", () => {
    process.env.KHAT_RATE_LIMIT_LIGHT_CONCURRENT = "20"
    process.env.KHAT_RATE_LIMIT_LIGHT_DAILY_USD = "12.5"
    process.env.KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT = "1"
    process.env.KHAT_RATE_LIMIT_EXPENSIVE_DAILY_USD = "100"
    const out = readLimits()
    expect(out.light.maxConcurrent).toBe(20)
    expect(out.light.maxDailyCostUsd).toBe(12.5)
    expect(out.expensive.maxConcurrent).toBe(1)
    expect(out.expensive.maxDailyCostUsd).toBe(100)
  })
  it("floors fractional concurrency overrides", () => {
    process.env.KHAT_RATE_LIMIT_LIGHT_CONCURRENT = "7.9"
    expect(readLimits().light.maxConcurrent).toBe(7)
  })
  it("invalid (NaN / negative / zero) overrides fall back to defaults", () => {
    process.env.KHAT_RATE_LIMIT_LIGHT_CONCURRENT = "abc"
    process.env.KHAT_RATE_LIMIT_LIGHT_DAILY_USD = "-1"
    process.env.KHAT_RATE_LIMIT_EXPENSIVE_CONCURRENT = "0"
    process.env.KHAT_RATE_LIMIT_EXPENSIVE_DAILY_USD = ""
    const out = readLimits()
    expect(out.light.maxConcurrent).toBe(DEFAULT_LIMITS.light.maxConcurrent)
    expect(out.light.maxDailyCostUsd).toBe(DEFAULT_LIMITS.light.maxDailyCostUsd)
    expect(out.expensive.maxConcurrent).toBe(DEFAULT_LIMITS.expensive.maxConcurrent)
    expect(out.expensive.maxDailyCostUsd).toBe(DEFAULT_LIMITS.expensive.maxDailyCostUsd)
  })
})

describe("rate-limit — readActorAllowlist", () => {
  let snap: Record<string, string | undefined>
  beforeEach(() => {
    snap = snapshotEnv()
  })
  afterEach(() => restoreEnv(snap))

  it("returns empty set when unset", () => {
    delete process.env.KHAT_RATE_LIMIT_BYPASS_ACTORS
    expect(readActorAllowlist().size).toBe(0)
  })
  it("parses comma-separated actors", () => {
    process.env.KHAT_RATE_LIMIT_BYPASS_ACTORS = "retention,discovery-cron,eval-runner"
    const s = readActorAllowlist()
    expect(s.has("retention")).toBe(true)
    expect(s.has("discovery-cron")).toBe(true)
    expect(s.has("eval-runner")).toBe(true)
    expect(s.size).toBe(3)
  })
  it("trims whitespace + drops empty segments", () => {
    process.env.KHAT_RATE_LIMIT_BYPASS_ACTORS = " retention , , discovery-cron "
    const s = readActorAllowlist()
    expect(s.size).toBe(2)
    expect(s.has("retention")).toBe(true)
    expect(s.has("discovery-cron")).toBe(true)
  })
})

describe("rate-limit — session bypass counter", () => {
  // Each test releases everything it acquires; failures here are real
  // leaks since other tests share the module state.
  it("starts inactive", () => {
    expect(isSessionBypassActive().active).toBe(false)
  })
  it("activates on enableSessionBypass and deactivates on release", () => {
    const release = enableSessionBypass("test-1")
    expect(isSessionBypassActive().active).toBe(true)
    expect(isSessionBypassActive().reason).toBe("test-1")
    release()
    expect(isSessionBypassActive().active).toBe(false)
  })
  it("stacks correctly — release of inner does not end outer", () => {
    const r1 = enableSessionBypass("outer")
    const r2 = enableSessionBypass("inner")
    expect(isSessionBypassActive().active).toBe(true)
    r2()
    expect(isSessionBypassActive().active).toBe(true)
    r1()
    expect(isSessionBypassActive().active).toBe(false)
  })
  it("double release is idempotent (no negative depth)", () => {
    const r = enableSessionBypass("idem")
    r()
    r()
    r()
    expect(isSessionBypassActive().active).toBe(false)
    // And a fresh one still works.
    const r2 = enableSessionBypass("after-idem")
    expect(isSessionBypassActive().active).toBe(true)
    r2()
  })
})

describe("rate-limit — RateLimitError shape", () => {
  it("has name='RateLimitError' for instanceof + name checks", () => {
    const e = new RateLimitError("blocked_concurrency", "tier full")
    expect(e.name).toBe("RateLimitError")
  })
  it("exposes decision + detail fields", () => {
    const e = new RateLimitError("blocked_daily_cost", "ledger maxed")
    expect(e.decision).toBe("blocked_daily_cost")
    expect(e.detail).toBe("ledger maxed")
  })
  it("message includes the decision", () => {
    const e = new RateLimitError("blocked_subject_lock", "subject busy")
    expect(e.message).toContain("blocked_subject_lock")
    expect(e.message).toContain("subject busy")
  })
  it("is an Error subclass (instanceof works)", () => {
    const e = new RateLimitError("blocked_concurrency", "x")
    expect(e instanceof Error).toBe(true)
    expect(e instanceof RateLimitError).toBe(true)
  })
})
