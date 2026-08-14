/**
 * «٩/٩ قسم جاهز» — the badge that told the host a preparation was complete
 * while one of its nine sections was empty.
 *
 * REAL INCIDENT, 2026-08-13. Khalid generated a prep on production. Sixteen AI
 * calls ran, fifteen succeeded, and `question_system` timed out twice
 * (`Provider timeout after 280000ms`, 560s of wall clock). The row's
 * `sections_status` came out of it with ten keys: `research` ready, eight
 * sections ready, `question_system` in `error`. The badge counted every
 * `ready` in the object and printed the total over nine — so nine readies
 * became «٩/٩», the surplus from `research` cancelling the failure exactly.
 * «الأسئلة» was empty in the database and the screen said the prep was done.
 *
 * The fixture below is that row's real `sections_status`, keys and all.
 *
 * It calls the SAME functions the screen calls (`lib/preparation/sections.ts`),
 * not a copy of the rule. That distinction is the point: a test that
 * re-implemented the counting would have stayed green through a revert of the
 * component, which is the failure mode this codebase keeps hitting.
 */

import { describe, it, expect } from "vitest"
import {
  EDITORIAL_SECTION_KEYS,
  type PreparationSectionsStatus,
} from "@/types/preparation"
// The real functions the screen calls — NOT a re-implementation of the rule.
// A copy of the logic here would stay green through a revert of the component.
import {
  allSectionsReady,
  countReadySections,
  failedSectionKeys,
} from "@/lib/preparation/sections"

/** Verbatim from episode_preparations on production, row b1c03ea8. */
const REAL_INCIDENT: PreparationSectionsStatus = {
  research: { status: "ready", updated_at: "2026-08-13T18:58:45.602Z" },
  executive_summary: { status: "ready", updated_at: "2026-08-13T18:59:37.006Z" },
  knowledge_bank: { status: "ready", updated_at: "2026-08-13T19:00:42.559Z" },
  guest_intelligence: { status: "ready", updated_at: "2026-08-13T19:01:30.918Z" },
  conversation_axes: { status: "ready", updated_at: "2026-08-13T19:02:22.868Z" },
  episode_flow: { status: "ready", updated_at: "2026-08-13T19:03:15.074Z" },
  question_system: {
    status: "error",
    error: "Provider timeout after 280000ms",
    updated_at: "2026-08-13T19:12:35.725Z",
  },
  host_instructions: { status: "ready", updated_at: "2026-08-13T19:13:30.690Z" },
  quotes_references: { status: "ready", updated_at: "2026-08-13T19:14:11.855Z" },
  viral_moments: { status: "ready", updated_at: "2026-08-13T19:14:57.045Z" },
}

const readyCount = countReadySections
const failed = failedSectionKeys

/** What shipped before the fix, kept here so the difference stays visible. */
const oldBuggyCount = (s: PreparationSectionsStatus) =>
  Object.values(s).filter((v) => v?.status === "ready").length

describe("the sections-ready badge", () => {
  it("counts nine keys, not the ten that sections_status holds", () => {
    expect(EDITORIAL_SECTION_KEYS).toHaveLength(9)
    expect(EDITORIAL_SECTION_KEYS).not.toContain("research")
    expect(Object.keys(REAL_INCIDENT)).toHaveLength(10)
  })

  it("reports 8/9 on the row that used to report 9/9", () => {
    expect(readyCount(REAL_INCIDENT)).toBe(8)
    // The exact lie, pinned: the old rule scored a perfect nine on this row.
    expect(oldBuggyCount(REAL_INCIDENT)).toBe(9)
  })

  it("names the section that failed", () => {
    expect(failed(REAL_INCIDENT)).toEqual(["question_system"])
  })

  it("never exceeds nine when everything succeeded", () => {
    const allReady: PreparationSectionsStatus = { research: { status: "ready" } }
    for (const k of EDITORIAL_SECTION_KEYS) allReady[k] = { status: "ready" }
    expect(readyCount(allReady)).toBe(9)
    // The same bug in the other direction — this row used to print «10/9».
    expect(oldBuggyCount(allReady)).toBe(10)
    expect(failed(allReady)).toEqual([])
  })

  it("does not count a section that is still generating", () => {
    const midRun: PreparationSectionsStatus = {
      ...REAL_INCIDENT,
      question_system: { status: "generating" },
    }
    expect(readyCount(midRun)).toBe(8)
    expect(failed(midRun)).toEqual([])
  })

  it("refuses to call a preparation complete while one section failed", () => {
    expect(allSectionsReady(REAL_INCIDENT)).toBe(false)
  })

  it("counts a research-only row as zero sections ready", () => {
    expect(readyCount({ research: { status: "ready" } })).toBe(0)
    // This is the one the old rule got most obviously wrong: «1/9» for a
    // preparation with no generated section at all.
    expect(oldBuggyCount({ research: { status: "ready" } })).toBe(1)
  })
})
