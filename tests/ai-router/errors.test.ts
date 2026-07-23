/**
 * Provider-error classification — the quota/billing signal that must fail FAST.
 * OpenAI returns 429 for BOTH a transient rate-limit (retry) and a terminal
 * out-of-credit failure (don't retry). Getting this wrong is exactly the "spinner
 * for 8 minutes with no reason shown" bug this helper exists to prevent.
 */
import { describe, it, expect } from "vitest"
import { isQuotaExceededError, QUOTA_EXCEEDED_MESSAGE } from "@/lib/ai-router/errors"

describe("isQuotaExceededError", () => {
  it("recognizes OpenAI quota/billing exhaustion", () => {
    expect(
      isQuotaExceededError(
        new Error(
          "429 You exceeded your current quota, please check your plan and billing details",
        ),
      ),
    ).toBe(true)
    expect(isQuotaExceededError(new Error("insufficient_quota"))).toBe(true)
    expect(isQuotaExceededError("quota_exceeded")).toBe(true)
    expect(isQuotaExceededError(new Error("HTTP 429: quota reached"))).toBe(true)
  })

  it("does NOT flag a transient rate-limit or unrelated errors", () => {
    // 429 WITHOUT a quota signal is a transient rate-limit — must stay retryable.
    expect(isQuotaExceededError(new Error("429 Rate limit reached, slow down"))).toBe(false)
    expect(isQuotaExceededError(new Error("Provider timeout after 30000ms"))).toBe(false)
    expect(isQuotaExceededError(new Error("500 internal server error"))).toBe(false)
    expect(isQuotaExceededError(null)).toBe(false)
    expect(isQuotaExceededError(undefined)).toBe(false)
  })

  it("carries a clear, actionable Arabic message (cause + fix)", () => {
    expect(QUOTA_EXCEEDED_MESSAGE).toContain("OpenAI")
    expect(QUOTA_EXCEEDED_MESSAGE).toMatch(/رصيد|الفوترة/)
    expect(QUOTA_EXCEEDED_MESSAGE.length).toBeGreaterThan(20)
  })
})
