/**
 * The one section that gets its own time budget.
 *
 * REAL INCIDENT, 2026-08-13 (prep b1c03ea8, read from `ai_runs`): eight of the
 * nine prep sections generated in 15–65s. `question_system` exceeded the 280s
 * `editorial` timeout TWICE — 560,575ms — and landed in the row as `error`
 * with the section empty. It now runs as ONE attempt of 600s instead of two of
 * 280s, which still clears the droplet's 660s `proxy_read_timeout` on
 * `/api/admin`.
 *
 * This pins the wiring, because the wiring is the part that fails quietly:
 * `SECTION_BUDGET` is keyed by the `label` string each generator passes to
 * `jsonCall`. If that label and the section key ever drift apart, the override
 * silently stops applying and the section goes back to timing out — with
 * nothing in the type system to notice.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const runAiTask = vi.fn()
vi.mock("@/lib/ai-router", () => ({ runAiTask: (...a: unknown[]) => runAiTask(...a) }))

/** Minimal prep — only the fields the questions/summary prompts read. */
const prep = {
  id: "prep-1",
  title: "حلقة اختبار",
  guest_name: "ضيف",
  guest_description: null,
  short_description: null,
  episode_goal: null,
  key_questions: [],
  tone_type: "deep",
  focus_mode: "guest",
  expected_duration_min: 60,
  depth_level: 3,
  boldness_level: 3,
  content_focus: [],
  research_data: null,
  episode_flow: null,
  executive_summary: null,
} as never

const ctx = { prepId: "prep-1", eirId: null, actorId: "admin-1" } as never

/** The nginx `proxy_read_timeout` on /admin and /api/admin. */
const NGINX_ADMIN_WALL_MS = 660_000

beforeEach(() => {
  runAiTask.mockReset()
  runAiTask.mockResolvedValue({
    status: "succeeded",
    parsed: { buckets: [], must_ask: [] },
    rawText: "{}",
  })
})

describe("question_system's time budget", () => {
  it("asks the router for one 600s attempt, not two of 280s", async () => {
    const { generateSection } = await import("@/lib/ai/preparation/generate")
    await generateSection("question_system", prep, ctx)

    expect(runAiTask).toHaveBeenCalledTimes(1)
    const req = runAiTask.mock.calls[0][0]
    expect(req.timeoutMs).toBe(600_000)
    expect(req.maxRetries).toBe(0)
    // The label is the key the override is looked up by — if this drifts from
    // the section key, the budget stops applying and nothing else notices.
    expect(req.input.section).toBe("question_system")
  })

  it("keeps the worst case under the nginx admin wall", async () => {
    const { generateSection } = await import("@/lib/ai/preparation/generate")
    await generateSection("question_system", prep, ctx)

    const { timeoutMs, maxRetries } = runAiTask.mock.calls[0][0]
    expect(timeoutMs * (1 + maxRetries)).toBeLessThan(NGINX_ADMIN_WALL_MS)
    // And it must actually be an improvement on what timed out in production.
    expect(timeoutMs).toBeGreaterThan(280_000)
  })

  it("leaves every other section on the editorial defaults", async () => {
    const { generateSection } = await import("@/lib/ai/preparation/generate")
    for (const section of ["executive_summary", "knowledge_bank", "viral_moments"] as const) {
      runAiTask.mockClear()
      await generateSection(section, prep, ctx)
      const req = runAiTask.mock.calls[0][0]
      expect(req.timeoutMs, `${section} must not carry an override`).toBeUndefined()
      expect(req.maxRetries, `${section} must not carry an override`).toBeUndefined()
    }
  })
})
