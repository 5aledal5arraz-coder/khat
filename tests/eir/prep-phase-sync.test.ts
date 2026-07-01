/**
 * Regression: prep-status → EIR-phase mapping must cover ALL five prep
 * statuses. The bug this guards: `prepStatusToPhase` only handled
 * draft/reviewed/approved, so once preparation finished generating every
 * section (status "prepared") the switch fell through to `undefined` and the
 * EIR stayed stuck at "researching" forever. See lib/khat-brain/phase-sync.ts.
 *
 * Pure: the mapper is a total function over the PreparationStatus union with
 * no I/O.
 */

import { describe, expect, it } from "vitest"
import { prepStatusToPhase } from "@/lib/khat-brain/phase-sync"
import { EPISODE_PHASES } from "@/lib/db/schema/eir"
import type { PreparationStatus } from "@/types/preparation"

const ALL_STATUSES: PreparationStatus[] = [
  "draft",
  "researched",
  "prepared",
  "reviewed",
  "approved",
]

describe("prepStatusToPhase", () => {
  it("maps every prep status to a real EIR phase (no undefined fall-through)", () => {
    for (const status of ALL_STATUSES) {
      const phase = prepStatusToPhase(status)
      expect(phase, `status "${status}" must map to a phase`).toBeTruthy()
      expect(EPISODE_PHASES).toContain(phase)
    }
  })

  it("keeps early statuses in the researching phase", () => {
    expect(prepStatusToPhase("draft")).toBe("researching")
    expect(prepStatusToPhase("researched")).toBe("researching")
  })

  it("advances to prepared once the artifact is complete (the fixed cases)", () => {
    expect(prepStatusToPhase("prepared")).toBe("prepared")
    expect(prepStatusToPhase("reviewed")).toBe("prepared")
    expect(prepStatusToPhase("approved")).toBe("prepared")
  })

  it("never maps backward: prep 'prepared' is at or after 'researching'", () => {
    const researchingIdx = EPISODE_PHASES.indexOf("researching")
    for (const status of ALL_STATUSES) {
      const idx = EPISODE_PHASES.indexOf(prepStatusToPhase(status))
      expect(idx).toBeGreaterThanOrEqual(researchingIdx)
    }
  })
})
