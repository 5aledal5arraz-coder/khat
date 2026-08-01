/**
 * Provider-error classification — the quota/billing signal that must fail FAST.
 * OpenAI returns 429 for BOTH a transient rate-limit (retry) and a terminal
 * out-of-credit failure (don't retry). Getting this wrong is exactly the "spinner
 * for 8 minutes with no reason shown" bug this helper exists to prevent.
 */
import { describe, it, expect } from "vitest"
import {
  isQuotaExceededError,
  isRetriableProviderError,
  QUOTA_EXCEEDED_MESSAGE,
} from "@/lib/ai-router/errors"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

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

  // ── Gemini ────────────────────────────────────────────────────────────
  // Both texts below are the provider's REAL wording, not paraphrases. The
  // spend-cap one is copied verbatim from an `ai_runs` row (180 of them, every
  // single one previously recorded as error_class="rate_limited").

  it("recognizes Gemini's monthly spend-cap 429 as terminal", () => {
    const real = new Error(
      '{"error":{"code":429,"message":"Your project has exceeded its monthly ' +
        "spending cap. Please go to AI Studio at https://ai.studio/spend to manage " +
        "your project spend cap. Learn more at " +
        'https://ai.google.dev/gemini-api/docs/billing#project-spend-caps. ","status":"RESOURCE_EXHAUSTED"}}',
    )
    expect(isQuotaExceededError(real)).toBe(true)
  })

  it("does NOT flag Gemini's per-minute throttle, which IS worth retrying", () => {
    // Same HTTP code, same RESOURCE_EXHAUSTED status, opposite meaning: this one
    // clears on its own in ~60s. Classifying it terminal would kill a job that
    // would have succeeded AND raise a false "provider stopped serving us" alert.
    const throttle = new Error(
      '{"error":{"code":429,"message":"Quota exceeded for quota metric ' +
        "'Generate Content API requests per minute' and limit 'GenerateContent " +
        "request limit per minute per project' of service " +
        'generativelanguage.googleapis.com.","status":"RESOURCE_EXHAUSTED"}}',
    )
    expect(isQuotaExceededError(throttle)).toBe(false)
  })

  it("still flags Gemini's free-tier exhaustion (a day-long block, not a throttle)", () => {
    const freeTier = new Error(
      "[429 Too Many Requests] You exceeded your current quota, please check your " +
        "plan and billing details. quota_metric: generate_content_free_tier_requests",
    )
    expect(isQuotaExceededError(freeTier)).toBe(true)
  })

  it("does NOT flag OpenAI's TPM rate-limit message", () => {
    expect(
      isQuotaExceededError(
        new Error(
          "429 Rate limit reached for gpt-5.6-luna in organization org-abc on tokens " +
            "per min (TPM): Limit 30000, Used 29500. Please try again in 1.2s.",
        ),
      ),
    ).toBe(false)
  })

  it("carries a clear, actionable Arabic message (cause + fix) for BOTH providers", () => {
    expect(QUOTA_EXCEEDED_MESSAGE).toContain("OpenAI")
    // Gemini failures reach this same message now, so it must not send the
    // operator to the wrong billing page.
    expect(QUOTA_EXCEEDED_MESSAGE).toContain("ai.studio/spend")
    expect(QUOTA_EXCEEDED_MESSAGE).toMatch(/رصيد|الفوترة/)
    expect(QUOTA_EXCEEDED_MESSAGE.length).toBeGreaterThan(20)
  })
})

/**
 * `isRetriableProviderError` — the predicate the two hand-rolled
 * `callWithRetry` loops now share.
 *
 * Why this block exists: the `errors.ts` fix above reached the ROUTER and the
 * JOBS layer, and stopped there. `lib/ai/preparation/research/gemini.ts` and
 * `lib/ai/grounded-evidence.ts` each carried a private
 * `/\b(503|429|504|UNAVAILABLE|overloaded)\b/i` and never called
 * `isQuotaExceededError`. A spend-cap failure contains "429", so on that path
 * the old behaviour survived untouched: three doomed attempts per candidate.
 *
 * It went unnoticed because the day it was checked every call SUCCEEDED —
 * `attempt=1` was proof of a healthy provider, not of a working fix. Hence
 * these assertions, which do not need the provider to be broken.
 */
describe("isRetriableProviderError", () => {
  const SPEND_CAP = new Error(
    '{"error":{"code":429,"message":"Your project has exceeded its monthly ' +
      "spending cap. Please go to AI Studio at https://ai.studio/spend to manage " +
      "your project spend cap. Learn more at " +
      'https://ai.google.dev/gemini-api/docs/billing#project-spend-caps. ","status":"RESOURCE_EXHAUSTED"}}',
  )

  it("refuses to retry the spend-cap 429 even though it contains 429", () => {
    // The whole bug in one assertion: the status hint says "retry", the
    // billing signal says "never", and billing has to win.
    expect(/\b429\b/.test(SPEND_CAP.message)).toBe(true)
    expect(isQuotaExceededError(SPEND_CAP)).toBe(true)
    expect(isRetriableProviderError(SPEND_CAP)).toBe(false)
  })

  it.each([
    ["503 Service Unavailable", true],
    ["504 Gateway Timeout", true],
    ["UNAVAILABLE: backend overloaded", true],
    ["The model is overloaded. Please try again later.", true],
  ])("keeps retrying genuine transients: %s", (msg, expected) => {
    expect(isRetriableProviderError(new Error(msg))).toBe(expected)
  })

  it("still retries an ordinary per-minute throttle", () => {
    const throttle = new Error(
      '{"error":{"code":429,"message":"Quota exceeded for quota metric ' +
        "'Generate Content API requests per minute' and limit 'GenerateContent " +
        "request limit per minute per project' of service " +
        'generativelanguage.googleapis.com.","status":"RESOURCE_EXHAUSTED"}}',
    )
    expect(isRetriableProviderError(throttle)).toBe(true)
  })

  it("does not retry an error it cannot recognise", () => {
    // A 400 contract error retried three times is three times the cost and
    // the same failure.
    expect(isRetriableProviderError(new Error("400 invalid argument"))).toBe(false)
    expect(isRetriableProviderError(null)).toBe(false)
  })
})

describe("no retry loop keeps a private copy of the transient regex", () => {
  // Source-level, deliberately: the loops are closures inside large exported
  // functions with a live Gemini client, so the cheap honest guard is that the
  // duplicated pattern is gone and the shared predicate is what is called.
  const LOOPS = [
    "lib/ai/preparation/research/gemini.ts",
    "lib/ai/grounded-evidence.ts",
  ]

  it.each(LOOPS)("%s calls isRetriableProviderError", (rel) => {
    const src = readFileSync(resolve(__dirname, "..", "..", rel), "utf8")
    expect(src).toContain("isRetriableProviderError(err)")
  })

  it.each(LOOPS)("%s no longer inlines the status regex", (rel) => {
    const src = readFileSync(resolve(__dirname, "..", "..", rel), "utf8")
    expect(src).not.toMatch(/\/\\b\(503\|429\|504\|UNAVAILABLE\|overloaded\)\\b\/i/)
  })
})
