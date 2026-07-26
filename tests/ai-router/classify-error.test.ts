/**
 * `classifyError` — the function every AI alert, dashboard count and retry
 * decision is built on top of.
 *
 * The defect these tests pin: the fallback branch used to return `err.name`,
 * which for a plain `new Error("…")` is the literal string `"Error"`. That
 * value is worse than useless — it is INDISTINGUISHABLE from a genuine
 * class name, so a failure nobody classified looked exactly like a failure
 * somebody did, and every `error_class`-based condition was silently blind
 * to it. It now collapses to `unclassified`, which is honest, greppable,
 * and drives an alert of its own.
 *
 * The recognized classes are asserted too: `quota_exceeded` and
 * `auth_failed` are what alert (أ) branches on, so a regression in either
 * turns the highest-priority alert into a no-op.
 */

import { describe, expect, it, vi } from "vitest"
import { mockDb } from "../db-mock"

vi.mock("@/lib/db", () => ({ db: mockDb }))

import { classifyError } from "@/lib/ai-router/router"
import {
  PROVIDER_BLOCKED_ERROR_CLASSES,
  UNCLASSIFIED_ERROR_CLASS,
} from "@/lib/ai-router/errors"

/** An SDK-style error carrying a numeric HTTP status. */
function withStatus(message: string, status: number): Error {
  const e = new Error(message) as Error & { status: number }
  e.status = status
  return e
}

describe("classifyError — recognized classes (unchanged behaviour)", () => {
  it("classifies our own abort message as a retryable timeout", () => {
    expect(classifyError(new Error("Provider timeout after 120000ms")).name).toBe(
      "timeout",
    )
    expect(classifyError(withStatus("request aborted", 408)).name).toBe("timeout")
  })

  it("separates terminal quota exhaustion from a transient rate-limit", () => {
    // This exact string is what all four failed rows in the local DB carry.
    expect(
      classifyError(
        new Error(
          "429 You exceeded your current quota, please check your plan and billing details.",
        ),
      ).name,
    ).toBe("quota_exceeded")
    expect(classifyError(withStatus("Rate limit reached", 429)).name).toBe(
      "rate_limited",
    )
  })

  it("classifies a rejected key as auth_failed", () => {
    expect(classifyError(withStatus("Incorrect API key provided", 401)).name).toBe(
      "auth_failed",
    )
    expect(classifyError(withStatus("forbidden", 403)).name).toBe("auth_failed")
  })

  it("classifies provider 5xx and network blips as server_error", () => {
    expect(classifyError(withStatus("Bad gateway", 502)).name).toBe("server_error")
    expect(classifyError(new Error("ECONNRESET")).name).toBe("server_error")
    expect(classifyError(new Error("fetch failed")).name).toBe("server_error")
  })
})

describe("classifyError — the unclassified fallback", () => {
  it("a plain Error no longer reports the meaningless class 'Error'", () => {
    const c = classifyError(new Error("yt-dlp غير مثبّت"))
    expect(c.name).not.toBe("Error")
    expect(c.name).toBe(UNCLASSIFIED_ERROR_CLASS)
    // The message is preserved verbatim — the class is what was useless,
    // not the detail. Diagnosing the gap later depends on this text.
    expect(c.message).toBe("yt-dlp غير مثبّت")
  })

  it("keeps a NAMED error's own name — those actually carry information", () => {
    class GroundingContractError extends Error {
      constructor(msg: string) {
        super(msg)
        this.name = "GroundingContractError"
      }
    }
    expect(classifyError(new GroundingContractError("no sources")).name).toBe(
      "GroundingContractError",
    )

    // The OpenAI SDK throws named subclasses; a 400 that matches no rule
    // above must surface as its class, not be flattened away.
    class BadRequestError extends Error {
      constructor(msg: string) {
        super(msg)
        this.name = "BadRequestError"
      }
    }
    expect(
      classifyError(new BadRequestError("context_length_exceeded")).name,
    ).toBe("BadRequestError")
  })

  it("reports thrown non-Errors under the same class, so alerts need one condition", () => {
    expect(classifyError("something broke").name).toBe(UNCLASSIFIED_ERROR_CLASS)
    expect(classifyError({ weird: true }).name).toBe(UNCLASSIFIED_ERROR_CLASS)
    expect(classifyError(null).name).toBe(UNCLASSIFIED_ERROR_CLASS)
  })

  it("an Error with an empty name still classifies, never returning ''", () => {
    const e = new Error("boom")
    e.name = ""
    expect(classifyError(e).name).toBe(UNCLASSIFIED_ERROR_CLASS)
  })
})

describe("PROVIDER_BLOCKED_ERROR_CLASSES", () => {
  it("is exactly the two account-level classes alert (أ) branches on", () => {
    expect([...PROVIDER_BLOCKED_ERROR_CLASSES].sort()).toEqual([
      "auth_failed",
      "quota_exceeded",
    ])
  })

  it("the classifier really does produce both of those strings", () => {
    // Guards the seam: the alert queries these literals against ai_runs, so
    // a rename on either side would silently stop matching any row.
    const quota = classifyError(new Error("insufficient_quota")).name
    const auth = classifyError(withStatus("invalid api key", 401)).name
    expect(PROVIDER_BLOCKED_ERROR_CLASSES.has(quota)).toBe(true)
    expect(PROVIDER_BLOCKED_ERROR_CLASSES.has(auth)).toBe(true)
  })

  it("does NOT include the transient classes — those recover on their own", () => {
    for (const cls of ["rate_limited", "timeout", "server_error"]) {
      expect(PROVIDER_BLOCKED_ERROR_CLASSES.has(cls), cls).toBe(false)
    }
  })
})
