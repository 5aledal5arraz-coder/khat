/**
 * Tests for the admin Server Action wrapper.
 *
 * The contract this file defends:
 *   1. `runAction` NEVER rejects for an ordinary failure — so the surrounding
 *      `startTransition` always settles and `isPending` always clears. A
 *      button that fails must stop spinning.
 *   2. Next's control-flow exceptions (redirect/notFound) are NOT swallowed.
 *   3. Failures are classified narrowly — an unrecognised error stays
 *      "unknown" rather than being given a confident, wrong message.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error"

import {
  runAction,
  classifyActionFailure,
  ACTION_FAILURE_MESSAGES,
} from "@/app/admin/components/run-action"

/** Mirrors how Next tags its own errors. */
function withNextCode<E extends Error>(error: E, code: string): E {
  Object.defineProperty(error, "__NEXT_ERROR_CODE", {
    value: code,
    enumerable: false,
    configurable: true,
  })
  return error
}

/** A redirect error shaped exactly as `isRedirectError` expects. */
function makeRedirectError() {
  const error = new Error("NEXT_REDIRECT")
  ;(error as Error & { digest: string }).digest =
    "NEXT_REDIRECT;replace;/admin/ops;307;"
  return error
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("runAction — happy path", () => {
  it("returns the action's value", async () => {
    const outcome = await runAction(async () => ({ generated: 3 }))
    expect(outcome).toEqual({ ok: true, data: { generated: 3 } })
  })

  it("passes through an action's own {ok:false} result untouched", async () => {
    // Actions that fail *gracefully* return a result object. That is data,
    // not an exception, and must not be reclassified as an infra failure.
    const outcome = await runAction(async () => ({ ok: false, message: "لا توجد إشارات" }))
    expect(outcome.ok).toBe(true)
    expect(outcome.ok && outcome.data).toEqual({ ok: false, message: "لا توجد إشارات" })
  })
})

describe("runAction — never escapes as a rejection", () => {
  it.each([
    ["a plain Error", new Error("boom")],
    ["a string", "boom"],
    ["null", null],
    ["an object", { weird: true }],
  ])("settles instead of throwing for %s", async (_label, thrown) => {
    const outcome = await runAction(async () => {
      throw thrown
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message).toBeTruthy()
  })

  it("always carries an operator-facing Arabic message", async () => {
    const outcome = await runAction(async () => {
      throw new Error("boom")
    })
    expect(outcome.ok).toBe(false)
    // Arabic script present — the operator never sees a raw English stack.
    expect(outcome.ok === false && /[؀-ۿ]/.test(outcome.message)).toBe(true)
  })

  it("keeps the original error available for logging", async () => {
    const cause = new Error("boom")
    const outcome = await runAction(async () => {
      throw cause
    })
    expect(outcome.ok === false && outcome.cause).toBe(cause)
  })
})

describe("runAction — framework control flow is preserved", () => {
  it("rethrows redirect() errors instead of swallowing them", async () => {
    await expect(
      runAction(async () => {
        throw makeRedirectError()
      }),
    ).rejects.toThrow("NEXT_REDIRECT")
  })
})

describe("classifyActionFailure", () => {
  it("detects a stale deployment via Next's typed error", () => {
    const result = classifyActionFailure(
      new UnrecognizedActionError('Server Action "abc" was not found on the server.'),
    )
    expect(result.kind).toBe("stale_version")
    expect(result.message).toBe(ACTION_FAILURE_MESSAGES.stale_version)
  })

  it("detects a gateway timeout via Next's E394 error code", () => {
    // This is what the client sees when nginx's proxy_read_timeout fires and
    // returns its own HTML page instead of an RSC payload.
    const error = withNextCode(
      new Error("An unexpected response was received from the server."),
      "E394",
    )
    expect(classifyActionFailure(error).kind).toBe("gateway")
  })

  it("detects a gateway timeout from a 504 message", () => {
    expect(classifyActionFailure(new Error("504 Gateway Time-out")).kind).toBe("gateway")
  })

  it("detects a dropped connection", () => {
    expect(classifyActionFailure(new TypeError("Failed to fetch")).kind).toBe("offline")
  })

  it("detects rate limiting", () => {
    expect(classifyActionFailure(new Error("429 Too Many Requests")).kind).toBe("rate_limited")
  })

  it("does NOT mislabel an ordinary TypeError as a connection problem", () => {
    // Guards the narrowness of the offline rule: a real bug in our own code
    // must not tell the operator to check their internet.
    expect(
      classifyActionFailure(new TypeError("Cannot read properties of undefined")).kind,
    ).toBe("unknown")
  })

  it("falls back to unknown rather than guessing", () => {
    expect(classifyActionFailure(new Error("حدث خطأ داخلي")).kind).toBe("unknown")
    expect(classifyActionFailure(undefined).kind).toBe("unknown")
  })
})
