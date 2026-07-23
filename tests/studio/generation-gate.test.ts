/**
 * Studio 3-phase journey — Step 2: the Phase-3 approval gate.
 *
 * Pure-function unit tests for evaluateGenerationGate — no DB, no SSE.
 * The gate's scoping (which sessions are project-linked at all) lives in
 * the route's getProjectByEditedSession lookup and is covered in
 * projects.test.ts; here we prove the DECISION over every project state
 * plus the null (no-project) backward-compat contract.
 */
import { describe, it, expect } from "vitest"

import {
  evaluateGenerationGate,
  GENERATION_ALLOWED_STATES,
} from "@/lib/studio/generation-gate"
import type { StudioProject } from "@/lib/studio/projects"
import {
  STUDIO_PROJECT_STATES,
  type StudioProjectState,
} from "@/lib/db/schema/studio-projects"

function makeProject(state: StudioProjectState): StudioProject {
  return {
    id: "proj-1",
    eir_id: null,
    raw_session_id: "11111111-1111-1111-1111-111111111111",
    edited_session_id: "22222222-2222-2222-2222-222222222222",
    state,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

describe("evaluateGenerationGate — project-linked sessions", () => {
  it("ALLOWS a project-linked session once the review is approved (reviewed)", () => {
    const d = evaluateGenerationGate(makeProject("reviewed"))
    expect(d).toEqual({ allowed: true, reason: "review_approved" })
  })

  it("ALLOWS later states (finalized, published) — already past the gate", () => {
    expect(evaluateGenerationGate(makeProject("finalized")).allowed).toBe(true)
    expect(evaluateGenerationGate(makeProject("published")).allowed).toBe(true)
  })

  it("BLOCKS a project-linked session while the review is pending (mapped)", () => {
    const d = evaluateGenerationGate(makeProject("mapped"))
    expect(d).toEqual({ allowed: false, reason: "review_pending", state: "mapped" })
  })

  it("BLOCKS every pre-review state (draft, raw_uploaded, mapped)", () => {
    for (const state of ["draft", "raw_uploaded", "mapped"] as StudioProjectState[]) {
      const d = evaluateGenerationGate(makeProject(state))
      expect(d.allowed).toBe(false)
      if (!d.allowed) expect(d.state).toBe(state)
    }
  })

  it("agrees with GENERATION_ALLOWED_STATES for every declared project state", () => {
    for (const state of STUDIO_PROJECT_STATES) {
      const expected = GENERATION_ALLOWED_STATES.includes(state)
      expect(evaluateGenerationGate(makeProject(state)).allowed).toBe(expected)
    }
  })
})

describe("evaluateGenerationGate — backward-compat (no project → ungated)", () => {
  it("ALLOWS when the session is not part of any project (null)", () => {
    // getProjectByEditedSession returns null for standalone/legacy edited
    // sessions — they stay ungated exactly as before.
    const d = evaluateGenerationGate(null)
    expect(d).toEqual({ allowed: true, reason: "no_project" })
  })

  it("ALLOWS a YouTube session — it is never an edited_session_id, so resolves to null", () => {
    // A YouTube session (journey أ) has no studio_projects row; the route's
    // getProjectByEditedSession lookup yields null, which the gate allows.
    const d = evaluateGenerationGate(null)
    expect(d.allowed).toBe(true)
    expect(d.reason).toBe("no_project")
  })
})
