/**
 * The bulk-convert panel after a successful convert.
 *
 * A successful bulk convert empties the approved list and refreshes the page,
 * and the panel used to `return null` at approvedCount 0 — taking every job
 * card (and a dead job's «أعد المحاولة») with it. It now keeps the season's
 * in-flight / recently finished generation jobs, passed from the server.
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("@/app/admin/khat-brain/seasons/[seasonId]/bulk-convert-actions", () => ({
  bulkConvertApprovedAction: vi.fn(),
}))
vi.mock("@/app/admin/components/job-retry-actions", () => ({ retryJobAction: vi.fn() }))

import { BulkConvertButton } from "@/app/admin/khat-brain/seasons/[seasonId]/bulk-convert-button"
import type { JobSnapshot } from "@/lib/jobs/status-view"

const dead: JobSnapshot = {
  id: "job-dead",
  type: "prep.generate_v2",
  status: "dead",
  progress: null,
  result: null,
  error_message: "مزوّد الذكاء الاصطناعي أوقف الخدمة",
  attempts: 1,
  max_attempts: 1,
  created_at: "2026-09-28T08:00:00.000Z",
  started_at: "2026-09-28T08:00:01.000Z",
  completed_at: "2026-09-28T08:03:00.000Z",
  locked_by: null,
  lease_age_s: null,
}

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(BulkConvertButton, { seasonId: "s-1", ...props } as never))

describe("BulkConvertButton with nothing left to convert", () => {
  it("still renders the season's generation jobs — a dead one with its reason and «أعد المحاولة»", () => {
    const html = render({ approvedCount: 0, recentJobs: [{ title: "حلقة أولى", job: dead }] })
    expect(html).toContain("data-bulk-convert-jobs-only")
    expect(html).toContain('data-job-id="job-dead"')
    expect(html).toContain('data-job-status="dead"')
    expect(html).toContain("مزوّد الذكاء الاصطناعي أوقف الخدمة")
    expect(html).toContain("أعد المحاولة")
    // No convert button — there is nothing to convert.
    expect(html).not.toContain("data-bulk-convert-button")
  })

  it("renders nothing when there is nothing to convert and no job to show", () => {
    expect(render({ approvedCount: 0, recentJobs: [] })).toBe("")
  })

  it("with topics left to convert, shows the button AND the recent jobs", () => {
    const html = render({ approvedCount: 2, recentJobs: [{ title: "حلقة أولى", job: dead }] })
    expect(html).toContain("data-bulk-convert-button")
    expect(html).toContain('data-job-id="job-dead"')
  })
})
