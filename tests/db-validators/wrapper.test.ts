/**
 * Phase 1.3 — wrapper unit tests.
 *
 * Covers the three modes (off / report / enforce) without touching the
 * DB. The fire-and-forget audit insert is exercised through the public
 * `recordDriftFireAndForget` helper indirectly — it must not throw in
 * any path.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { z } from "zod"
import {
  validateJsonbWrite,
  getValidatorMode,
  JsonbValidationError,
  summarizeIssues,
  hashValue,
} from "@/lib/db/validators"

// A tiny schema used as the runtime contract for the wrapper tests.
// `.loose()` mirrors the real schemas; we only assert known fields.
const tinySchema = z.object({ name: z.string(), n: z.number() }).loose()

const goodValue = { name: "ok", n: 1 }
const badValue = { name: "ok", n: "not a number" }

describe("getValidatorMode", () => {
  const prev = process.env.KHAT_JSONB_VALIDATORS_MODE
  afterEach(() => {
    if (prev === undefined) delete process.env.KHAT_JSONB_VALIDATORS_MODE
    else process.env.KHAT_JSONB_VALIDATORS_MODE = prev
  })

  it("defaults to 'report' when env var is unset", () => {
    delete process.env.KHAT_JSONB_VALIDATORS_MODE
    expect(getValidatorMode()).toBe("report")
  })

  it("returns 'off' when env=off", () => {
    process.env.KHAT_JSONB_VALIDATORS_MODE = "off"
    expect(getValidatorMode()).toBe("off")
  })

  it("returns 'enforce' when env=enforce", () => {
    process.env.KHAT_JSONB_VALIDATORS_MODE = "enforce"
    expect(getValidatorMode()).toBe("enforce")
  })

  it("case-insensitive: ENFORCE → enforce", () => {
    process.env.KHAT_JSONB_VALIDATORS_MODE = "ENFORCE"
    expect(getValidatorMode()).toBe("enforce")
  })

  it("unknown value falls back to 'report' (conservative default)", () => {
    process.env.KHAT_JSONB_VALIDATORS_MODE = "looseish"
    expect(getValidatorMode()).toBe("report")
  })
})

describe("validateJsonbWrite — mode behavior", () => {
  const prev = process.env.KHAT_JSONB_VALIDATORS_MODE
  beforeEach(() => {
    delete process.env.KHAT_JSONB_VALIDATORS_MODE
  })
  afterEach(() => {
    if (prev === undefined) delete process.env.KHAT_JSONB_VALIDATORS_MODE
    else process.env.KHAT_JSONB_VALIDATORS_MODE = prev
  })

  it("OFF: returns input unchanged even when value is invalid", () => {
    process.env.KHAT_JSONB_VALIDATORS_MODE = "off"
    const out = validateJsonbWrite(
      { table: "t", column: "c", rowId: "r" },
      badValue,
      tinySchema,
    )
    expect(out).toBe(badValue)
  })

  it("REPORT: returns input unchanged on a successful validation", () => {
    process.env.KHAT_JSONB_VALIDATORS_MODE = "report"
    const out = validateJsonbWrite(
      { table: "t", column: "c", rowId: "r" },
      goodValue,
      tinySchema,
    )
    expect(out).toBe(goodValue)
  })

  it("REPORT: returns input unchanged on a failed validation (never throws)", () => {
    process.env.KHAT_JSONB_VALIDATORS_MODE = "report"
    let threw = false
    let out: unknown = undefined
    try {
      out = validateJsonbWrite(
        { table: "t", column: "c", rowId: "r" },
        badValue,
        tinySchema,
      )
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    expect(out).toBe(badValue)
  })

  it("ENFORCE: returns input unchanged on success", () => {
    process.env.KHAT_JSONB_VALIDATORS_MODE = "enforce"
    const out = validateJsonbWrite(
      { table: "t", column: "c", rowId: "r" },
      goodValue,
      tinySchema,
    )
    expect(out).toBe(goodValue)
  })

  it("ENFORCE: throws JsonbValidationError on failure", () => {
    process.env.KHAT_JSONB_VALIDATORS_MODE = "enforce"
    let thrown: unknown = null
    try {
      validateJsonbWrite(
        { table: "t", column: "c", rowId: "r" },
        badValue,
        tinySchema,
      )
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(JsonbValidationError)
    if (thrown instanceof JsonbValidationError) {
      expect(thrown.table).toBe("t")
      expect(thrown.column).toBe("c")
      expect(thrown.issues.length).toBeGreaterThan(0)
    }
  })
})

describe("summarizeIssues", () => {
  it("compresses multiple Zod issues into a single line", () => {
    const schema = z.object({ a: z.string(), b: z.number() })
    const r = schema.safeParse({ a: 1, b: "x" })
    expect(r.success).toBe(false)
    if (r.success) return
    const summary = summarizeIssues(r.error.issues)
    expect(summary.length).toBeGreaterThan(0)
    expect(summary).toMatch(/a:/)
    expect(summary).toMatch(/b:/)
  })

  it("caps the summary length", () => {
    // Synthesize many issues by validating an array of bad items.
    const schema = z.array(z.string())
    const r = schema.safeParse(new Array(50).fill(123))
    expect(r.success).toBe(false)
    if (r.success) return
    const summary = summarizeIssues(r.error.issues)
    expect(summary.length).toBeLessThanOrEqual(480)
  })
})

describe("hashValue", () => {
  it("produces stable 16-hex-char hash for identical values", () => {
    const a = hashValue({ x: 1, y: "two" })
    const b = hashValue({ x: 1, y: "two" })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })

  it("different values produce different hashes", () => {
    const a = hashValue({ x: 1 })
    const b = hashValue({ x: 2 })
    expect(a).not.toBe(b)
  })

  it("handles null and undefined", () => {
    expect(hashValue(null)).toMatch(/^[0-9a-f]{16}$/)
    expect(hashValue(undefined)).toMatch(/^[0-9a-f]{16}$/)
  })
})
