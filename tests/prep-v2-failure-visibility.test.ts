/**
 * Wave 1 "كسر الصمت" — the prep_v2 failures that reached nobody.
 *
 * Two distinct silences are pinned here:
 *
 *  1. `regeneratePrepV2Action` said "فشل التحقق من بنية الإعداد بعد محاولتين"
 *     and stopped there, while `result.validation.failures` — the list naming
 *     every check that failed — sat unused in the same object. The operator
 *     was told something was wrong and given no way to learn what.
 *
 *  2. Every failure label was English (`PREP_V2_VALIDATION_RULES` is written
 *     for developers), so even reading them out verbatim would have violated
 *     the Arabic-UI rule.
 *
 * The most likely failure in practice is `duration_out_of_range`, because
 * `rebalanceMinutes` (critique.ts) clamps each section to [3,30] and can land
 * a 6-section total outside [60,90]. That bug is NOT fixed here — this file
 * only proves its reason now reaches the screen.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockDb, mockSelectResult, resetMock } from "./db-mock"

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api-utils", () => ({
  requireActionRole: vi.fn(async () => ({
    ok: true as const,
    user: { id: "admin-1" },
  })),
}))
vi.mock("@/lib/preparation/v2/pipeline", () => ({
  runPrepV2Pipeline: vi.fn(),
}))
vi.mock("@/lib/khat-brain/performance-learning", () => ({
  analyzeEirPerformance: vi.fn(),
}))
vi.mock("@/lib/jobs", () => ({ enqueueJob: vi.fn() }))

import {
  describeValidationFailuresAr,
  PREP_V2_VALIDATION_LABELS_AR,
  PREP_V2_VALIDATION_RULES,
  type ValidationFailure,
  type ValidationCode,
} from "@/lib/preparation/v2/validation"
import { runPrepV2Pipeline } from "@/lib/preparation/v2/pipeline"
import { regeneratePrepV2Action } from "@/app/admin/khat-brain/episodes/[eirId]/job-actions"

const fail = (code: ValidationCode): ValidationFailure => ({
  code,
  message: "irrelevant — the Arabic label is what ships",
})

describe("describeValidationFailuresAr", () => {
  it("returns an empty string when nothing failed", () => {
    expect(describeValidationFailuresAr([])).toBe("")
  })

  it("names the failing check in Arabic, not the English rule text", () => {
    const out = describeValidationFailuresAr([fail("duration_out_of_range")])
    expect(out).toBe(PREP_V2_VALIDATION_LABELS_AR.duration_out_of_range)
    // The bounds must survive into the label — "خارج النطاق" alone does not
    // tell an operator whether the prep was too short or too long.
    expect(out).toContain("60")
    expect(out).toContain("90")
    expect(out).not.toMatch(/[a-z]{4,}/) // no leaked English rule text
  })

  it("caps the list and still reports how many were hidden", () => {
    const out = describeValidationFailuresAr([
      fail("missing_thesis"),
      fail("wrong_section_count"),
      fail("duration_out_of_range"),
      fail("missing_host_guidance"),
      fail("missing_closing_options"),
    ])
    expect(out).toContain(PREP_V2_VALIDATION_LABELS_AR.missing_thesis)
    expect(out).toContain("+2 أخرى")
    // The two cut labels must NOT be in the string — that is the point of a cap.
    expect(out).not.toContain(PREP_V2_VALIDATION_LABELS_AR.missing_closing_options)
  })

  it("has a non-empty Arabic label for every ValidationCode", () => {
    // The code list is taken from PREP_V2_VALIDATION_RULES — the map the guard
    // itself indexes — and NOT from the label map under test. Iterating the
    // labels was vacuous: deleting one shortened the loop and stayed green
    // while the toast fell back to the raw English enum string. Proven by
    // deleting `missing_thesis` from the labels: green before, red now.
    const codes = Object.keys(PREP_V2_VALIDATION_RULES) as ValidationCode[]
    expect(codes.length).toBeGreaterThan(0)
    for (const code of codes) {
      const label = PREP_V2_VALIDATION_LABELS_AR[code]
      expect(label, `no Arabic label for "${code}"`).toBeTruthy()
      expect(label.trim().length, code).toBeGreaterThan(0)
      expect(label, code).toMatch(/[ء-ي]/)
    }
  })

  it("has no orphan label without a matching rule", () => {
    // The other direction: a label left behind after its code was removed is
    // dead copy that nothing can ever render.
    const ruleCodes = new Set(Object.keys(PREP_V2_VALIDATION_RULES))
    for (const code of Object.keys(PREP_V2_VALIDATION_LABELS_AR)) {
      expect(ruleCodes.has(code), `orphan label "${code}"`).toBe(true)
    }
  })
})

describe("regeneratePrepV2Action — the message carries the actual reason", () => {
  beforeEach(() => {
    resetMock()
    vi.clearAllMocks()
  })

  it("names the failed checks instead of only saying validation failed", async () => {
    mockSelectResult([{ id: "prep-1" }])
    vi.mocked(runPrepV2Pipeline).mockResolvedValue({
      ok: false,
      preparation_id: "prep-1",
      payload: null,
      validation: {
        ok: false,
        failures: [fail("duration_out_of_range"), fail("missing_thesis")],
      },
      ai_run_ids: {
        pass1_research: null,
        pass2_structure: null,
        pass3_questions: null,
        pass4_critique: null,
        pass5_insights: null,
      },
      reason: "validation_failed_after_retry",
    })

    const r = await regeneratePrepV2Action("eir-1")

    expect(r.ok).toBe(false)
    expect(r.message).toContain("فشل التحقق من بنية الإعداد بعد محاولتين")
    expect(r.message).toContain(
      PREP_V2_VALIDATION_LABELS_AR.duration_out_of_range,
    )
    expect(r.message).toContain(PREP_V2_VALIDATION_LABELS_AR.missing_thesis)
  })

  it("falls back to the bare sentence when the failure list is empty", async () => {
    // Defensive: an empty list must not render a dangling ": ." tail.
    mockSelectResult([{ id: "prep-1" }])
    vi.mocked(runPrepV2Pipeline).mockResolvedValue({
      ok: false,
      preparation_id: "prep-1",
      payload: null,
      validation: { ok: false, failures: [] },
      ai_run_ids: {
        pass1_research: null,
        pass2_structure: null,
        pass3_questions: null,
        pass4_critique: null,
        pass5_insights: null,
      },
      reason: "validation_failed_after_retry",
    })

    const r = await regeneratePrepV2Action("eir-1")
    expect(r.message).toBe("فشل التحقق من بنية الإعداد بعد محاولتين.")
  })

  it("still reports a non-validation reason (e.g. an early pass dying)", async () => {
    mockSelectResult([{ id: "prep-1" }])
    vi.mocked(runPrepV2Pipeline).mockResolvedValue({
      ok: false,
      preparation_id: "prep-1",
      payload: null,
      validation: { ok: false, failures: [] },
      ai_run_ids: {
        pass1_research: null,
        pass2_structure: null,
        pass3_questions: null,
        pass4_critique: null,
        pass5_insights: null,
      },
      reason: "pass3_failed",
    })

    const r = await regeneratePrepV2Action("eir-1")
    expect(r.ok).toBe(false)
    expect(r.message).toContain("pass3_failed")
  })
})
