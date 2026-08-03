/**
 * ص-٩ — the per-ITEM review gate on «ما لم يُقال».
 *
 * This is the one enrichment field that does NOT publish by default, because
 * it states what a named real person did not say and its sharpest generated
 * item was also its least reproducible one. So the property under test is not
 * "approved items render" — it is "everything else does not".
 *
 * The gate is tested at BOTH levels on purpose:
 *   • `publicUnsaidReflections` — the pure decision;
 *   • `getPublicEpisodeEnrichment` — the read every public surface actually
 *     calls, because a correct pure function that nobody applies is exactly
 *     how an unreviewed item would still reach the page.
 *
 * The db mock is faithful here: `getEpisodeEnrichment` does a bare
 * `db.select()` (whole row, no Drizzle projection), so the row the mock hands
 * back is the row the mapper sees.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "../db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import {
  publicUnsaidReflections,
  getPublicEpisodeEnrichment,
  setEpisodeEnrichment,
} from "@/lib/episodes/enrichments"

const ITEM_A = "سؤال لم يُطرح عن التمويل"
const ITEM_B = "ظل الحدّ الفاصل بين ذكاء تحريك السوق والتلاعب به بلا مساءلة"

/** A full enrichment row as `db.select()` returns it. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    episode_id: "ep-1",
    hero_summary: null,
    full_summary: null,
    takeaways: [],
    resources: [],
    timestamps: [],
    why_this_conversation: null,
    before_you_watch: null,
    conversation_map: null,
    central_question: null,
    exclusive_clip: null,
    unsaid_reflections: [ITEM_A, ITEM_B],
    unsaid_reflections_approved: null,
    publish_status: "published",
    scheduled_for: null,
    updated_at: "2026-08-01T12:00:00Z",
    ...overrides,
  }
}

describe("publicUnsaidReflections — default deny", () => {
  it("publishes nothing when there is no approval record at all", () => {
    expect(publicUnsaidReflections({ unsaid_reflections: [ITEM_A, ITEM_B] })).toEqual([])
  })

  it("publishes nothing for an empty approval list", () => {
    expect(
      publicUnsaidReflections({
        unsaid_reflections: [ITEM_A, ITEM_B],
        unsaid_reflections_approved: [],
      }),
    ).toEqual([])
  })

  it("publishes nothing for null/undefined enrichment", () => {
    expect(publicUnsaidReflections(null)).toEqual([])
    expect(publicUnsaidReflections(undefined)).toEqual([])
  })

  it("publishes ONLY the approved item, leaving its sibling hidden", () => {
    expect(
      publicUnsaidReflections({
        unsaid_reflections: [ITEM_A, ITEM_B],
        unsaid_reflections_approved: [ITEM_A],
      }),
    ).toEqual([ITEM_A])
  })

  it("keeps the author's order, not the approval order", () => {
    expect(
      publicUnsaidReflections({
        unsaid_reflections: [ITEM_A, ITEM_B],
        unsaid_reflections_approved: [ITEM_B, ITEM_A],
      }),
    ).toEqual([ITEM_A, ITEM_B])
  })
})

describe("publicUnsaidReflections — approval is keyed by text, not position", () => {
  it("a re-worded item loses its approval instead of inheriting it", () => {
    // Khaled approved ITEM_B, then someone edited the sentence. The edited
    // sentence is NOT what he read, so it must not be public.
    expect(
      publicUnsaidReflections({
        unsaid_reflections: [`${ITEM_B} أخلاقية واضحة`],
        unsaid_reflections_approved: [ITEM_B],
      }),
    ).toEqual([])
  })

  it("deleting an earlier item cannot shift approval onto a different sentence", () => {
    // Index-keyed approval would publish ITEM_B here (index 0 approved).
    expect(
      publicUnsaidReflections({
        unsaid_reflections: [ITEM_B],
        unsaid_reflections_approved: [ITEM_A],
      }),
    ).toEqual([])
  })

  it("ignores surrounding whitespace on both sides of the comparison", () => {
    expect(
      publicUnsaidReflections({
        unsaid_reflections: [`  ${ITEM_A}  `],
        unsaid_reflections_approved: [ITEM_A],
      }),
    ).toEqual([`  ${ITEM_A}  `])
  })

  it("a blank approval entry approves nothing", () => {
    expect(
      publicUnsaidReflections({
        unsaid_reflections: ["", ITEM_A],
        unsaid_reflections_approved: ["   "],
      }),
    ).toEqual([])
  })
})

describe("getPublicEpisodeEnrichment — the gate is applied at the public read", () => {
  beforeEach(() => resetMock())

  it("strips unapproved reflections to undefined so the section disappears", async () => {
    mockSelectResult([row()])

    const result = await getPublicEpisodeEnrichment("ep-1")

    expect(result).not.toBeNull()
    // The section renders nothing for undefined — no empty heading.
    expect(result!.unsaid_reflections).toBeUndefined()
  })

  it("returns only the approved subset when one item is approved", async () => {
    mockSelectResult([row({ unsaid_reflections_approved: [ITEM_A] })])

    const result = await getPublicEpisodeEnrichment("ep-1")

    expect(result!.unsaid_reflections).toEqual([ITEM_A])
  })

  it("leaves the other enrichment fields untouched", async () => {
    mockSelectResult([row({ hero_summary: "ملخص", central_question: "السؤال" })])

    const result = await getPublicEpisodeEnrichment("ep-1")

    expect(result!.hero_summary).toBe("ملخص")
    expect(result!.central_question).toBe("السؤال")
  })

  it("still respects the OUTER publish gate — an unpublished row returns null", async () => {
    mockSelectResult([row({ publish_status: "draft", unsaid_reflections_approved: [ITEM_A] })])

    expect(await getPublicEpisodeEnrichment("ep-1")).toBeNull()
  })
})

describe("setEpisodeEnrichment — approvals persist, and generation cannot grant them", () => {
  beforeEach(() => {
    resetMock()
    // `resetMock()` clears the QUEUED RESULTS, not the vi.fn call history, and
    // `mockDb` is shared module state — so without this every test in this
    // block would inspect the FIRST insert of the file. (Found the hard way:
    // the assertion below failed against correct code.)
    mockDb.insert.mockClear()
  })

  /** The row object handed to `db.insert(...).values(...)`. */
  function insertedRow(): Record<string, unknown> {
    const chain = mockDb.insert.mock.results[0].value as {
      values: { mock: { calls: unknown[][] } }
    }
    return chain.values.mock.calls[0][0] as Record<string, unknown>
  }

  it("writes an explicit empty array so un-approving everything takes effect", async () => {
    mockSelectResult([row({ unsaid_reflections_approved: [ITEM_A] })])

    await setEpisodeEnrichment({
      episodeId: "ep-1",
      unsaid_reflections: [ITEM_A, ITEM_B],
      unsaid_reflections_approved: [],
      updatedAt: new Date().toISOString(),
    })

    expect(insertedRow().unsaid_reflections_approved).toEqual([])
  })

  it("preserves existing approvals when the caller omits the field", async () => {
    // This is the AI generator's shape: it patches content, never approval.
    mockSelectResult([row({ unsaid_reflections_approved: [ITEM_A] })])

    await setEpisodeEnrichment({
      episodeId: "ep-1",
      why_this_conversation: "نص مولَّد",
      updatedAt: new Date().toISOString(),
    })

    expect(insertedRow().unsaid_reflections_approved).toEqual([ITEM_A])
  })

  it("a generated reflection lands with no approval at all", async () => {
    mockSelectResult([row({ unsaid_reflections: null, unsaid_reflections_approved: null })])

    await setEpisodeEnrichment({
      episodeId: "ep-1",
      unsaid_reflections: [ITEM_A, ITEM_B],
      updatedAt: new Date().toISOString(),
    })

    const written = insertedRow()
    expect(written.unsaid_reflections).toEqual([ITEM_A, ITEM_B])
    expect(written.unsaid_reflections_approved).toEqual([])
    // …and therefore nothing is public.
    expect(
      publicUnsaidReflections({
        unsaid_reflections: written.unsaid_reflections as string[],
        unsaid_reflections_approved: written.unsaid_reflections_approved as string[],
      }),
    ).toEqual([])
  })
})
