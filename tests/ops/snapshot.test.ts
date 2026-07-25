/**
 * Phase 2.5 (P2.5.a) — ops snapshot pure-function tests.
 *
 * No DB. The DB roundtrip is exercised by `scripts/smoke-ops-dashboard.ts`.
 *
 * What this file locks down:
 *   1. `settledToSection` correctly maps `PromiseSettledResult<T>` into
 *      `SectionResult<T>` for both fulfilled and rejected promises.
 *   2. Rejection reasons NEVER reach the caller: the `error` field is a
 *      fixed Arabic sentence and the only technical value is a short,
 *      stable `errorRef`. This is the anti-leak contract — the raw
 *      reason carries DB hostnames, column names and server paths, and
 *      the result object is rendered as plain page data.
 *   3. The discriminated-union narrowing works: TypeScript should let
 *      callers access `.data` only after checking `ok === true`. We
 *      assert this at runtime via `ok` checks; type-narrowing itself is
 *      tested implicitly by compilation.
 */

import { beforeEach, afterAll, describe, expect, it, vi } from "vitest"
import {
  settledToSection,
  SECTION_ERROR_MESSAGE_AR,
  type SectionResult,
  type OpsSnapshot,
} from "@/lib/ops/snapshot"
import type { GuestIdentitySnapshot } from "@/lib/guest-identity/integrity"

// The rejected path logs the raw reason server-side by design; keep the
// test output readable without losing the assertion that it happens.
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
beforeEach(() => errorSpy.mockClear())
afterAll(() => errorSpy.mockRestore())

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
  it("Error reason → the generic message, never error.message", () => {
    const settled: PromiseSettledResult<never> = {
      status: "rejected",
      reason: new Error("boom"),
    }
    const out = settledToSection(settled)
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toBe(SECTION_ERROR_MESSAGE_AR)
      expect(out.error).not.toContain("boom")
      expect(out.errorRef).toMatch(/^[0-9a-f]{8}$/)
    }
  })

  it("string reason is replaced too — nothing passes through verbatim", () => {
    const out = settledToSection({
      status: "rejected",
      reason: "plain string failure",
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toBe(SECTION_ERROR_MESSAGE_AR)
      expect(out.error).not.toContain("plain string failure")
    }
  })

  it("object / undefined / null reasons produce the same generic shape", () => {
    for (const reason of [{ nested: "value" }, undefined, null]) {
      const out = settledToSection({ status: "rejected", reason })
      expect(out.ok).toBe(false)
      if (!out.ok) {
        expect(out.error).toBe(SECTION_ERROR_MESSAGE_AR)
        expect(out.errorRef).toMatch(/^[0-9a-f]{8}$/)
      }
    }
  })

  it("Error with no message still yields a non-empty errorRef", () => {
    const out = settledToSection({ status: "rejected", reason: new Error("") })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toBe(SECTION_ERROR_MESSAGE_AR)
      expect(out.errorRef).toMatch(/^[0-9a-f]{8}$/)
    }
  })
})

describe("settledToSection — infrastructure-leak contract (yousef's finding)", () => {
  // The three failure texts actually observed on /admin/ops: a prod DB
  // hostname, a schema error, and a server-side stack path.
  const SENSITIVE = [
    "getaddrinfo ENOTFOUND khat-db-do-user-32538860-0.d.db.ondigitalocean.com",
    'column "error" does not exist',
    "Cannot find module '/root/khat/.next/server/chunks/9821.js'",
  ]

  it.each(SENSITIVE)("leaks nothing from: %s", (raw) => {
    const out = settledToSection({ status: "rejected", reason: new Error(raw) })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toBe(SECTION_ERROR_MESSAGE_AR)
      for (const needle of [
        "ondigitalocean",
        "ENOTFOUND",
        "khat-db-do-user-32538860-0",
        "column",
        "/root/khat",
        ".next",
      ]) {
        expect(out.error).not.toContain(needle)
      }
      // Nothing from the raw message survives into any rendered field.
      expect(out.error + out.errorRef).not.toContain(raw)
      expect(out.errorRef).not.toMatch(/[^0-9a-f]/)
    }
  })

  it("errorRef is non-empty and STABLE for the same input", () => {
    const raw =
      "getaddrinfo ENOTFOUND khat-db-do-user-32538860-0.d.db.ondigitalocean.com"
    const a = settledToSection({ status: "rejected", reason: new Error(raw) })
    const b = settledToSection({ status: "rejected", reason: raw })
    expect(a.ok || b.ok).toBe(false)
    if (!a.ok && !b.ok) {
      expect(a.errorRef).not.toBe("")
      // Same underlying text ⇒ same ref, whether it arrived as an Error
      // or as a bare string. That's what makes the ref greppable.
      expect(a.errorRef).toBe(b.errorRef)
    }
  })

  it("different failures get different refs", () => {
    const a = settledToSection({ status: "rejected", reason: new Error("one") })
    const b = settledToSection({ status: "rejected", reason: new Error("two") })
    if (!a.ok && !b.ok) expect(a.errorRef).not.toBe(b.errorRef)
  })

  it("the raw message IS logged server-side, tagged with the same ref", () => {
    const raw = "getaddrinfo ENOTFOUND khat-db-internal.example.com"
    const out = settledToSection({ status: "rejected", reason: new Error(raw) })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = String(errorSpy.mock.calls[0]?.[0])
    expect(logged).toContain(raw)
    if (!out.ok) expect(logged).toContain(out.errorRef)
  })
})

describe("SectionResult discriminated-union shape", () => {
  it("ok=true branch contains exactly { ok, data }", () => {
    const r: SectionResult<number> = { ok: true, data: 42 }
    expect(Object.keys(r).sort()).toEqual(["data", "ok"])
  })

  it("ok=false branch contains exactly { ok, error, errorRef }", () => {
    const r: SectionResult<number> = { ok: false, error: "x", errorRef: "deadbeef" }
    expect(Object.keys(r).sort()).toEqual(["error", "errorRef", "ok"])
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
    expect(sections[1]).toMatchObject({ ok: false, error: SECTION_ERROR_MESSAGE_AR })
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
      queue: { ok: false, error: "stub", errorRef: "00000000" },
      systemEvents: { ok: false, error: "stub", errorRef: "00000000" },
      aiRouter: { ok: false, error: "stub", errorRef: "00000000" },
      eirPipeline: { ok: false, error: "stub", errorRef: "00000000" },
      recentActivity: { ok: false, error: "stub", errorRef: "00000000" },
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
      worker: {
        ok: true,
        data: { state: "working", ageMs: 1_000, workerId: "w-1", jobType: "demo.echo" },
      },
    }
    expect(sample.guestIdentity.ok).toBe(true)
    if (sample.guestIdentity.ok) {
      expect(sample.guestIdentity.data.staleDaysThreshold).toBe(90)
    }
    // The worker heartbeat is a first-class section: without it the home
    // band has no proof the system is alive, only that it is reachable.
    expect(sample.worker.ok).toBe(true)
    if (sample.worker.ok) {
      expect(sample.worker.data.state).toBe("working")
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
