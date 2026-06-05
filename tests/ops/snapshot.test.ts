/**
 * Phase 2.5 (P2.5.a) — ops snapshot pure-function tests.
 *
 * No DB. The DB roundtrip is exercised by `scripts/smoke-ops-dashboard.ts`.
 *
 * What this file locks down:
 *   1. `settledToSection` correctly maps `PromiseSettledResult<T>` into
 *      `SectionResult<T>` for both fulfilled and rejected promises.
 *   2. Rejection reasons are normalized to a string `error` — never
 *      leaking objects, Errors with stack traces, or `undefined`.
 *   3. The discriminated-union narrowing works: TypeScript should let
 *      callers access `.data` only after checking `ok === true`. We
 *      assert this at runtime via `ok` checks; type-narrowing itself is
 *      tested implicitly by compilation.
 */

import { describe, expect, it } from "vitest"
import {
  settledToSection,
  type SectionResult,
  type OpsSnapshot,
} from "@/lib/ops/snapshot"
import type { GuestIdentitySnapshot } from "@/lib/guest-identity/integrity"

describe("settledToSection — fulfilled path", () => {
  it("wraps a fulfilled string into { ok: true, data }", () => {
    const settled: PromiseSettledResult<string> = {
      status: "fulfilled",
      value: "hello",
    }
    const out = settledToSection(settled)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.data).toBe("hello")
  })

  it("wraps a fulfilled object verbatim", () => {
    const value = { foo: 1, bar: "x" }
    const out = settledToSection({ status: "fulfilled", value })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.data).toBe(value)
  })

  it("wraps a fulfilled null without coercing", () => {
    const out = settledToSection<null>({ status: "fulfilled", value: null })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.data).toBeNull()
  })
})

describe("settledToSection — rejected path", () => {
  it("Error reason → error.message", () => {
    const settled: PromiseSettledResult<never> = {
      status: "rejected",
      reason: new Error("boom"),
    }
    const out = settledToSection(settled)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toBe("boom")
  })

  it("string reason passes through verbatim", () => {
    const out = settledToSection({
      status: "rejected",
      reason: "plain string failure",
    })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toBe("plain string failure")
  })

  it("object reason flattens to 'unknown error' (no JSON leak)", () => {
    const out = settledToSection({
      status: "rejected",
      reason: { nested: "value" },
    })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toBe("unknown error")
  })

  it("undefined/null reason → 'unknown error'", () => {
    const out1 = settledToSection({ status: "rejected", reason: undefined })
    const out2 = settledToSection({ status: "rejected", reason: null })
    expect(out1.ok).toBe(false)
    expect(out2.ok).toBe(false)
    if (!out1.ok) expect(out1.error).toBe("unknown error")
    if (!out2.ok) expect(out2.error).toBe("unknown error")
  })

  it("Error with no message → empty string (still a string, not undefined)", () => {
    const e = new Error("")
    const out = settledToSection({ status: "rejected", reason: e })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(typeof out.error).toBe("string")
  })
})

describe("SectionResult discriminated-union shape", () => {
  it("ok=true branch contains exactly { ok, data }", () => {
    const r: SectionResult<number> = { ok: true, data: 42 }
    expect(Object.keys(r).sort()).toEqual(["data", "ok"])
  })

  it("ok=false branch contains exactly { ok, error }", () => {
    const r: SectionResult<number> = { ok: false, error: "x" }
    expect(Object.keys(r).sort()).toEqual(["error", "ok"])
  })
})

describe("Promise.allSettled → settledToSection — integration of the adapter", () => {
  it("mixed-outcome batch wraps correctly per index", async () => {
    const settled = await Promise.allSettled([
      Promise.resolve("a"),
      Promise.reject(new Error("nope")),
      Promise.resolve(123),
    ])
    // Mixed fulfilled value types (string / never / number) mean the
    // array element type is a union of three distinct
    // `PromiseSettledResult<T>` instantiations, which the generic
    // `settledToSection` cannot infer a single `T` for when passed
    // directly to `.map`. Widening each entry to
    // `PromiseSettledResult<unknown>` inside an inline callback lets
    // the generic resolve to `unknown` uniformly. The runtime
    // semantics are unchanged.
    const sections = settled.map((s) =>
      settledToSection(s as PromiseSettledResult<unknown>),
    )
    expect(sections[0]).toEqual({ ok: true, data: "a" })
    expect(sections[1]).toEqual({ ok: false, error: "nope" })
    expect(sections[2]).toEqual({ ok: true, data: 123 })
  })

  // ─── P2.4.e.1 — guest-identity section presence ─────────────────────
  it("OpsSnapshot includes the guestIdentity section as a SectionResult<GuestIdentitySnapshot>", () => {
    // Compile-time assertion via a constructed value. If the
    // `guestIdentity` field is renamed / removed / retyped, this
    // shape no longer satisfies `OpsSnapshot` and the test file
    // fails to compile — catching the drift at static-gate time.
    const sample: OpsSnapshot = {
      taken_at: new Date(),
      duration_ms: 0,
      queue: { ok: false, error: "stub" },
      systemEvents: { ok: false, error: "stub" },
      aiRouter: { ok: false, error: "stub" },
      eirPipeline: { ok: false, error: "stub" },
      recentActivity: { ok: false, error: "stub" },
      guestIdentity: {
        ok: true,
        data: {
          canonicalCount: 0,
          unlinkedAcceptedCandidates: 0,
          unlinkedAcceptedApplications: 0,
          duplicateGroupCount: 0,
          duplicateGuestsTotal: 0,
          recentLinkedEvents24h: 0,
          recentLinkedEventsCreatedGuest24h: 0,
          staleProfileCount: 0,
          staleDaysThreshold: 90,
        } satisfies GuestIdentitySnapshot,
      },
    }
    expect(sample.guestIdentity.ok).toBe(true)
    if (sample.guestIdentity.ok) {
      expect(sample.guestIdentity.data.staleDaysThreshold).toBe(90)
    }
  })

  it("all-rejected batch produces no successful sections", async () => {
    const settled = await Promise.allSettled([
      Promise.reject(new Error("one")),
      Promise.reject(new Error("two")),
    ])
    // Same widening rationale as above — even with a homogeneous
    // rejected array, calling through an inline callback keeps the
    // pattern consistent and avoids relying on TS-version-specific
    // narrowing of `PromiseSettledResult<never>[]`.
    const sections = settled.map((s) =>
      settledToSection(s as PromiseSettledResult<unknown>),
    )
    expect(sections.every((s) => !s.ok)).toBe(true)
  })
})
