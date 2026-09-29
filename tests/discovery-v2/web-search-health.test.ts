/**
 * web-search-health — the pure classifier + threshold behind the run-level
 * «البحث في الويب تعطّل جزئياً» warning (2026-09-29).
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import {
  WEB_DEGRADED_SHARE,
  canRetryDegradedRun,
  classifyWebSearchFailure,
  dominantFailureKind,
  runWarnings,
  webSearchWarning,
} from "@/lib/discovery-v2/web-search-health"
import { GroundedEvidenceDeadlineError } from "@/lib/ai/grounded-evidence"
import { RetrievalBudgetExceededError } from "@/lib/ai-router/retrieval-budget"
import { RetrievalSearchNotRunError } from "@/lib/ai/retrieval-guard"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("@/app/admin/discovery-v2/actions", () => ({ nominateV2CandidateForEirAction: vi.fn() }))

const GENAI_503 = JSON.stringify({
  error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" },
})

describe("classifyWebSearchFailure", () => {
  it("the live 503 «high demand» is an overload", () => {
    expect(classifyWebSearchFailure(Object.assign(new Error(GENAI_503), { name: "ApiError" }))).toBe("overloaded")
  })
  it("an abort / our own deadline is the clock, not the provider", () => {
    const abort = Object.assign(new Error("This operation was aborted"), { name: "AbortError" })
    expect(classifyWebSearchFailure(abort)).toBe("deadline")
    expect(classifyWebSearchFailure(new GroundedEvidenceDeadlineError(90_000))).toBe("deadline")
  })
  it("the daily budget is named as the budget", () => {
    expect(classifyWebSearchFailure(new RetrievalBudgetExceededError(25, 25))).toBe("budget")
  })
  it("a search that never ran is «other»", () => {
    expect(classifyWebSearchFailure(new RetrievalSearchNotRunError("m", 2))).toBe("other")
  })
})

describe("overload precedence", () => {
  it("a 503 / UNAVAILABLE / high-demand body is an overload even when its text mentions a timeout", () => {
    const e = Object.assign(new Error(`${GENAI_503} (upstream timeout)`), { name: "ApiError" })
    expect(classifyWebSearchFailure(e)).toBe("overloaded")
    expect(classifyWebSearchFailure(new Error("UNAVAILABLE: deadline exceeded upstream"))).toBe("overloaded")
    // sight: a plain abort is still the clock
    expect(classifyWebSearchFailure(new Error("The operation was aborted due to timeout"))).toBe("deadline")
  })
})

describe("canRetryDegradedRun — no retry into a spent budget", () => {
  const degraded = { harvest_failed: 3, story_check_failed: 3 }
  const now = new Date("2026-09-29T20:00:00.000Z")
  it("overload-degraded: retry offered", () => {
    expect(canRetryDegradedRun({ ...degraded, web_failure_reason: "overloaded", provider_overloaded: true }, "2026-09-29T10:00:00Z", now)).toBe(true)
  })
  it("budget-degraded: refused the same UTC day, allowed once the cap has reset", () => {
    const b = { ...degraded, web_failure_reason: "budget" }
    expect(canRetryDegradedRun(b, "2026-09-29T00:05:00Z", now)).toBe(false)
    expect(canRetryDegradedRun(b, "2026-09-28T23:55:00Z", now)).toBe(true)
  })
  it("a healthy run is not a degraded run", () => {
    expect(canRetryDegradedRun({ harvest_queries: 3 }, "2026-09-29T10:00:00Z", now)).toBe(false)
  })
})

describe("dominantFailureKind", () => {
  it("majority wins; overload wins a tie; none → null", () => {
    expect(dominantFailureKind(["deadline", "deadline", "overloaded"])).toBe("deadline")
    expect(dominantFailureKind(["deadline", "overloaded"])).toBe("overloaded")
    expect(dominantFailureKind([])).toBeNull()
  })
})

describe("webSearchWarning — only a meaningful share", () => {
  it(`fires at ${WEB_DEGRADED_SHARE * 100}% failed and not below`, () => {
    const at = { harvest_queries: 2, harvest_failed: 1, story_searched: 5, story_check_failed: 2, provider_overloaded: true }
    expect(webSearchWarning(at)).not.toBeNull() // 3 / 10
    const below = { ...at, story_searched: 6 } // 3 / 11
    expect(webSearchWarning(below)).toBeNull()
  })
  it("older runs (no fields) and running runs say nothing", () => {
    expect(webSearchWarning({ proposed: 4 } as never)).toBeNull()
    expect(webSearchWarning(null)).toBeNull()
    expect(runWarnings({ harvest_failed: 3, provider_overloaded: true }, "searching")).toEqual([])
  })
  it("a failed run still gets the web warning (its failure copy does not mention the web)", () => {
    const w = runWarnings({ harvest_failed: 3, provider_overloaded: true, proposed_by_model: 0 }, "failed")
    expect(w).toHaveLength(1)
    expect(w[0]).toContain("ضغط عند مزوّد البحث")
  })
})

// ─── The EIR guest tab shows it (SSR, no jsdom) ─────────────────────────────


describe("EIR guest tab — run-level warning", () => {
  it("renders the warning with a way back to the run page, and nothing for a healthy run", async () => {
    const { EirDiscoveryResults } = await import("@/app/admin/khat-brain/episodes/[eirId]/discovery-results")
    const run = (warnings: string[]) => ({
      id: "run-1",
      status: "completed",
      created_at: "2026-09-29T10:00:00.000Z",
      candidates: [],
      warnings,
    })
    const w = runWarnings({ harvest_failed: 3, story_check_failed: 4, provider_overloaded: true }, "completed")
    const html = renderToStaticMarkup(createElement(EirDiscoveryResults, { eirId: "eir-1", runs: [run(w)] }))
    expect(html).toContain("ضغط عند مزوّد البحث")
    expect(html).toContain("أعد التشغيل من صفحة التفاصيل")
    expect(html).toContain('href="/admin/discovery-v2/run-1"')
    expect(html).not.toMatch(/\b(ml|mr|pl|pr|left|right)-/)

    const healthy = renderToStaticMarkup(createElement(EirDiscoveryResults, { eirId: "eir-1", runs: [run([])] }))
    expect(healthy).not.toContain("data-run-warning")
  })
})
