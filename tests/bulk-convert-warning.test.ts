/**
 * Wave 2 §5 — coverage for the wave-1 `to-preparation` warning.
 *
 * Wave 1 stopped `convertEpisodeToPreparation` from discarding the prep_v2
 * pipeline's outcome: the preparation row landed, its structure did not, and
 * the operator was shown "إعداد جديد" with nothing anywhere saying why. The
 * plumbing shipped (`ConversionResult.warning` → `BulkConvertResult.per_card`
 * → the amber row in `bulk-convert-button.tsx`) with **no test at all**, which
 * is how the previous round of "done" items turned out to be half-done.
 *
 * Scope, stated plainly: this is a UNIT test of the operator sentence and of
 * the warning/error separation. It is **NOT live-proven** — reaching the real
 * failure means running the prep_v2 pipeline against a paid provider, and this
 * round is explicitly zero-spend. What a live run would still add: proof that
 * `runPrepV2Pipeline` actually returns `ok:false` (rather than throwing) for a
 * real validation failure, and that the amber row renders as designed.
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  prepV2WarningAr,
  PREP_V2_VALIDATION_LABELS_AR,
  type ValidationFailure,
  type ValidationCode,
} from "@/lib/preparation/v2/validation"

const ROOT = resolve(__dirname, "..")
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8")

const fail = (code: ValidationCode): ValidationFailure => ({
  code,
  message: "developer-facing text that must never ship to the operator",
})

describe("prepV2WarningAr — what the operator actually reads", () => {
  it("confirms the record EXISTS before mentioning the failure", () => {
    // The single most important property. The conversion succeeded; a warning
    // that opens with "فشل" sends the operator hunting for a preparation that
    // is in fact sitting there waiting for them.
    const msg = prepV2WarningAr({
      kind: "not_ok",
      reason: "validation_failed_after_retry",
      failures: [fail("duration_out_of_range")],
    })
    expect(msg.startsWith("أُنشئ سجلّ الإعداد")).toBe(true)
  })

  it("names the failed checks in Arabic, not their enum codes", () => {
    const msg = prepV2WarningAr({
      kind: "not_ok",
      reason: "validation_failed_after_retry",
      failures: [fail("duration_out_of_range"), fail("missing_host_guidance")],
    })
    expect(msg).toContain(PREP_V2_VALIDATION_LABELS_AR.duration_out_of_range)
    expect(msg).toContain(PREP_V2_VALIDATION_LABELS_AR.missing_host_guidance)
    // The raw code is developer vocabulary and must not reach the screen.
    expect(msg).not.toContain("duration_out_of_range")
    expect(msg).not.toContain("missing_host_guidance")
  })

  it("never leaks the developer `message` field of a failure", () => {
    const msg = prepV2WarningAr({
      kind: "not_ok",
      reason: "validation_failed_after_retry",
      failures: [fail("missing_axes_of_tension")],
    })
    expect(msg).not.toContain("developer-facing text")
  })

  it("still tells the operator what to do when there are no failures", () => {
    // `validation.failures` is `[]` for every non-validation reason (six such
    // returns in pipeline.ts), so this is the COMMON shape, not an edge case.
    const msg = prepV2WarningAr({ kind: "not_ok", reason: "pass3_failed", failures: [] })
    expect(msg).toContain("pass3_failed")
    expect(msg).toContain("إعادة توليد الإعداد")
    // No dangling separator left behind by the empty clause.
    expect(msg).not.toContain(": .")
    expect(msg).not.toMatch(/:\s*\./)
  })

  it("does not print the word undefined when the reason is missing", () => {
    const msg = prepV2WarningAr({ kind: "not_ok", failures: [] })
    expect(msg).not.toContain("undefined")
    expect(msg).toContain("سبب غير معروف")
  })

  it("keeps the thrown error's detail, and still confirms the record", () => {
    const msg = prepV2WarningAr({
      kind: "threw",
      error: new Error("ECONNRESET"),
    })
    expect(msg.startsWith("أُنشئ سجلّ الإعداد")).toBe(true)
    expect(msg).toContain("ECONNRESET")
    expect(msg).toContain("إعادة توليد الإعداد")
  })

  it("survives a non-Error throw without printing [object Object]", () => {
    expect(prepV2WarningAr({ kind: "threw", error: "boom" })).toContain("boom")
    expect(
      prepV2WarningAr({ kind: "threw", error: { code: 500 } }),
    ).not.toContain("[object Object]")
  })

  it("always ends with the recovery instruction", () => {
    const all = [
      prepV2WarningAr({ kind: "not_ok", reason: "x", failures: [] }),
      prepV2WarningAr({ kind: "not_ok", failures: [fail("vague_emotional_hook")] }),
      prepV2WarningAr({ kind: "threw", error: new Error("x") }),
    ]
    for (const msg of all) {
      expect(msg.endsWith("استخدم «إعادة توليد الإعداد» من صفحة الحلقة.")).toBe(true)
    }
  })
})

/**
 * The warning is only useful if it survives the trip to the screen. These are
 * source-level, for the same reason as `action-buttons-unblock.test.ts`: the
 * defect lives in the wiring between three files, and each file in isolation
 * is correct.
 */
describe("the warning reaches the operator without being downgraded", () => {
  it("to-preparation returns the warning on the SUCCESS result", () => {
    const src = read("lib/khat-map/conversion/to-preparation.ts")
    // Attached to `ok: true` — a partial failure must not be reported as a
    // conversion that produced nothing.
    expect(src).toMatch(/ok:\s*true[\s\S]{0,200}warning:\s*prepV2Warning/)
    expect(src).toContain("prepV2WarningAr")
  })

  it("to-preparation cannot abort a conversion over a prep_v2 failure", () => {
    // Both the not-ok branch and the throw branch must only ASSIGN. A `throw`
    // or a re-raise inside that block would lose the preparation row.
    const src = read("lib/khat-map/conversion/to-preparation.ts")
    const block = src.slice(
      src.indexOf("let prepV2Warning"),
      src.indexOf("ok: true", src.indexOf("let prepV2Warning")),
    )
    expect(block.length).toBeGreaterThan(0)
    expect(block).not.toMatch(/\bthrow\b/)
    // The composer must be reachable without a dynamic import in the catch —
    // an import that rejects there would escape and abort the conversion.
    expect(src).toMatch(
      /^import \{ prepV2WarningAr \} from "@\/lib\/preparation\/v2\/validation"$/m,
    )
  })

  it("bulk convert keeps a warned card as converted, not failed", () => {
    const src = read("app/admin/khat-brain/seasons/[seasonId]/bulk-convert-actions.ts")
    // `warning` rides alongside the success status; it is NOT folded into
    // `reason`, which is the failure channel and renders in error red.
    expect(src).toContain("warning: result.warning")
    expect(src).toMatch(/status:\s*result\.was_existing\s*\?\s*"skipped_existing"\s*:\s*"converted"/)
    expect(src).not.toContain("reason: result.warning")
  })

  it("the bulk-convert row actually renders the warning", () => {
    // Without this the whole chain is dead plumbing — which is exactly the
    // failure mode this project keeps hitting: built, wired, never surfaced.
    const src = read("app/admin/khat-brain/seasons/[seasonId]/bulk-convert-button.tsx")
    expect(src).toContain("c.warning")
    expect(src).toContain("data-bulk-convert-warning")
  })
})
