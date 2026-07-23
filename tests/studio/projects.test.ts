/**
 * Studio Wave 2, Step 1 — the episode-project linking foundation.
 *
 * Two layers:
 *   1. The state machine as PURE functions (no DB): legal edges pass,
 *      illegal jumps throw, same-state is an idempotent no-op.
 *   2. The repository round-trips over the shared db-mock: create / attach /
 *      get, transitionState enforcement, and the orphan-fix composition
 *      (an edited upload carrying a raw ref attaches to the SAME project).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import {
  mockDb,
  mockSelectResult,
  mockInsertReturning,
  mockUpdateReturning,
  resetMock,
} from "../db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import {
  isLegalStudioProjectTransition,
  assertLegalStudioProjectTransition,
  LEGAL_STUDIO_PROJECT_TRANSITIONS,
  createProject,
  attachEditedSession,
  getProject,
  getProjectByRawSession,
  getProjectByEditedSession,
  listProjects,
  transitionState,
} from "@/lib/studio/projects"
import { STUDIO_PROJECT_STATES } from "@/lib/db/schema/studio-projects"

const RAW_ID = "11111111-1111-1111-1111-111111111111"
const EDITED_ID = "22222222-2222-2222-2222-222222222222"

function projectRow(overrides: Record<string, unknown> = {}) {
  const now = new Date()
  return {
    id: "proj-1",
    eir_id: null,
    raw_session_id: RAW_ID,
    edited_session_id: null,
    state: "raw_uploaded",
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

// ── 1. State machine (pure, no DB) ───────────────────────────────────────────

describe("studio project state machine — legal transitions", () => {
  const forward: Array<[string, string]> = [
    ["draft", "raw_uploaded"],
    ["raw_uploaded", "mapped"],
    ["mapped", "reviewed"],
    ["reviewed", "finalized"],
    ["finalized", "published"],
  ]

  it("accepts every forward edge", () => {
    for (const [from, to] of forward) {
      expect(isLegalStudioProjectTransition(from as never, to as never)).toBe(true)
    }
  })

  it("treats a same-state transition as legal (idempotent no-op)", () => {
    for (const s of STUDIO_PROJECT_STATES) {
      expect(isLegalStudioProjectTransition(s, s)).toBe(true)
    }
  })

  it("rejects skips, backward moves, and steps past the terminal state", () => {
    expect(isLegalStudioProjectTransition("draft", "mapped")).toBe(false) // skip
    expect(isLegalStudioProjectTransition("raw_uploaded", "reviewed")).toBe(false) // skip
    expect(isLegalStudioProjectTransition("mapped", "raw_uploaded")).toBe(false) // backward
    expect(isLegalStudioProjectTransition("finalized", "mapped")).toBe(false) // backward
    expect(isLegalStudioProjectTransition("published", "finalized")).toBe(false) // terminal
    expect(LEGAL_STUDIO_PROJECT_TRANSITIONS.published).toEqual([]) // terminal has no exit
  })

  it("assert throws on an illegal jump and on an unknown target, passes on legal", () => {
    expect(() => assertLegalStudioProjectTransition("raw_uploaded", "reviewed")).toThrow(
      /illegal state transition/,
    )
    expect(() =>
      assertLegalStudioProjectTransition("mapped", "nonsense" as never),
    ).toThrow(/unknown target state/)
    expect(() => assertLegalStudioProjectTransition("raw_uploaded", "mapped")).not.toThrow()
    expect(() => assertLegalStudioProjectTransition("mapped", "mapped")).not.toThrow()
  })
})

// ── 2. Repository round-trips (mock db) ──────────────────────────────────────

describe("createProject", () => {
  // resetMock() clears queued query results; clearAllMocks() clears the
  // vi.fn call history (so `not.toHaveBeenCalled()` isn't polluted by an
  // earlier test) while keeping the mock implementations intact.
  beforeEach(() => {
    resetMock()
    vi.clearAllMocks()
  })

  it("inserts a raw_uploaded project and maps the row", async () => {
    mockInsertReturning([projectRow()])
    const p = await createProject({ rawSessionId: RAW_ID })
    expect(mockDb.insert).toHaveBeenCalled()
    expect(p.id).toBe("proj-1")
    expect(p.raw_session_id).toBe(RAW_ID)
    expect(p.edited_session_id).toBeNull()
    expect(p.state).toBe("raw_uploaded")
    expect(typeof p.created_at).toBe("string") // Date → ISO string
  })

  it("throws when rawSessionId is missing", async () => {
    await expect(createProject({ rawSessionId: "" })).rejects.toThrow(/rawSessionId is required/)
  })
})

describe("attachEditedSession", () => {
  // resetMock() clears queued query results; clearAllMocks() clears the
  // vi.fn call history (so `not.toHaveBeenCalled()` isn't polluted by an
  // earlier test) while keeping the mock implementations intact.
  beforeEach(() => {
    resetMock()
    vi.clearAllMocks()
  })

  it("sets edited_session_id and returns the updated project", async () => {
    mockUpdateReturning([projectRow({ edited_session_id: EDITED_ID, state: "mapped" })])
    const p = await attachEditedSession("proj-1", EDITED_ID)
    expect(mockDb.update).toHaveBeenCalled()
    expect(p.id).toBe("proj-1")
    expect(p.edited_session_id).toBe(EDITED_ID)
  })

  it("throws when the project does not exist", async () => {
    mockUpdateReturning([]) // no row matched
    await expect(attachEditedSession("ghost", EDITED_ID)).rejects.toThrow(/not found/)
  })
})

describe("get* lookups", () => {
  // resetMock() clears queued query results; clearAllMocks() clears the
  // vi.fn call history (so `not.toHaveBeenCalled()` isn't polluted by an
  // earlier test) while keeping the mock implementations intact.
  beforeEach(() => {
    resetMock()
    vi.clearAllMocks()
  })

  it("getProject returns the mapped row or null", async () => {
    mockSelectResult([projectRow()])
    expect((await getProject("proj-1"))?.id).toBe("proj-1")
    mockSelectResult([])
    expect(await getProject("nope")).toBeNull()
  })

  it("getProjectByRawSession / getProjectByEditedSession resolve the project", async () => {
    mockSelectResult([projectRow()])
    expect((await getProjectByRawSession(RAW_ID))?.raw_session_id).toBe(RAW_ID)
    mockSelectResult([projectRow({ edited_session_id: EDITED_ID })])
    expect((await getProjectByEditedSession(EDITED_ID))?.edited_session_id).toBe(EDITED_ID)
  })

  it("listProjects maps every row", async () => {
    mockSelectResult([projectRow({ id: "proj-1" }), projectRow({ id: "proj-2" })])
    const all = await listProjects()
    expect(all.map((p) => p.id)).toEqual(["proj-1", "proj-2"])
  })
})

describe("transitionState — enforcement", () => {
  // resetMock() clears queued query results; clearAllMocks() clears the
  // vi.fn call history (so `not.toHaveBeenCalled()` isn't polluted by an
  // earlier test) while keeping the mock implementations intact.
  beforeEach(() => {
    resetMock()
    vi.clearAllMocks()
  })

  it("performs a legal transition (raw_uploaded → mapped)", async () => {
    mockSelectResult([projectRow({ state: "raw_uploaded" })]) // current
    mockUpdateReturning([projectRow({ state: "mapped" })]) // after update
    const p = await transitionState("proj-1", "mapped")
    expect(p.state).toBe("mapped")
    expect(mockDb.update).toHaveBeenCalled()
  })

  it("throws on an illegal jump WITHOUT writing (raw_uploaded → reviewed)", async () => {
    mockSelectResult([projectRow({ state: "raw_uploaded" })])
    await expect(transitionState("proj-1", "reviewed")).rejects.toThrow(
      /illegal state transition/,
    )
    expect(mockDb.update).not.toHaveBeenCalled() // the quality gate stops before the write
  })

  it("is an idempotent no-op on a same-state transition (no write)", async () => {
    mockSelectResult([projectRow({ state: "mapped" })])
    const p = await transitionState("proj-1", "mapped")
    expect(p.state).toBe("mapped")
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("throws when the project is not found", async () => {
    mockSelectResult([]) // getProject → null
    await expect(transitionState("ghost", "mapped")).rejects.toThrow(/not found/)
  })
})

// ── 3. Orphan fix — the edited cut attaches to the SAME project ──────────────

describe("orphan fix — edited upload attaches to the existing project", () => {
  // resetMock() clears queued query results; clearAllMocks() clears the
  // vi.fn call history (so `not.toHaveBeenCalled()` isn't polluted by an
  // earlier test) while keeping the mock implementations intact.
  beforeEach(() => {
    resetMock()
    vi.clearAllMocks()
  })

  it("resolves the raw session's project, then attaches the edited session to that SAME project", async () => {
    // The upload route's edited branch: getProjectByRawSession(raw) → attach.
    mockSelectResult([projectRow({ id: "proj-1", state: "mapped" })])
    const project = await getProjectByRawSession(RAW_ID)
    expect(project?.id).toBe("proj-1")

    mockUpdateReturning([
      projectRow({ id: "proj-1", edited_session_id: EDITED_ID, state: "mapped" }),
    ])
    const attached = await attachEditedSession(project!.id, EDITED_ID)

    // Same project id — NOT a new orphan — now carries the edited session.
    expect(attached.id).toBe("proj-1")
    expect(attached.edited_session_id).toBe(EDITED_ID)
    // No project was inserted in this flow — the edited cut reused the parent.
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})
