/**
 * Studio push → episode: the publish gate + the episode-title fallback.
 *
 * These two behaviours are the reason a generated quote could reach the
 * public site attributed to a real guest, and the reason a raw YouTube
 * id could land in a published episode title. Both are asserted here on
 * the RPC payload `runStudioPushToEpisode` builds, because that payload
 * IS the write — `push_episode_data()` just applies it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, resetMock } from "../db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

const getWebsitePackageForSession = vi.fn()
vi.mock("@/lib/studio", () => ({
  getWebsitePackageForSession: (id: string) => getWebsitePackageForSession(id),
}))

vi.mock("@/lib/episodes/overrides", () => ({
  getEpisodeOverride: vi.fn().mockResolvedValue(null),
}))

const fetchAllEpisodes = vi.fn()
vi.mock("@/lib/youtube/queries", () => ({
  fetchAllEpisodes: () => fetchAllEpisodes(),
}))

vi.mock("@/lib/khat-brain", () => ({
  getEirIdForStudioSession: vi.fn().mockResolvedValue(null),
  syncEirOnStudioPushed: vi.fn().mockResolvedValue(undefined),
  syncEirOnEpisodePublish: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/guests/canonical", () => ({
  ensureGuest: vi.fn(),
  updateGuestIdentityProfile: vi.fn(),
}))
vi.mock("@/lib/episodes/guests", () => ({ assignGuestToEpisode: vi.fn() }))

vi.mock("@/lib/cache", () => ({ invalidate: vi.fn() }))
vi.mock("@/lib/cache/episode-cache", () => ({
  invalidateEpisodeCache: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/teaser", () => ({ TEASER_CACHE_TAG: "teaser" }))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { runStudioPushToEpisode, StudioPushError } from "@/lib/studio/push-to-episode"

/** Pull the JSON string params out of the `push_episode_data(...)` sql call. */
function rpcPayloads(): {
  override: Record<string, unknown> | null
  quotes: Record<string, unknown> | null
} {
  const call = mockDb.execute.mock.calls.at(-1)
  const chunks = (call?.[0] as { queryChunks?: unknown[] })?.queryChunks ?? []
  // Everything that isn't a literal SQL fragment is an interpolated value.
  const params = chunks
    .filter((c) => (c as { constructor?: { name?: string } })?.constructor?.name !== "StringChunk")
    .map((c) =>
      (c as { constructor?: { name?: string } })?.constructor?.name === "Param"
        ? (c as { value: unknown }).value
        : c,
    )
  // Param order in the template: episodeId, override, quotes, enrichment, log
  const parse = (v: unknown) =>
    typeof v === "string" ? (JSON.parse(v) as Record<string, unknown>) : null
  return { override: parse(params[1]), quotes: parse(params[2]) }
}

function pkg(overrides: Record<string, unknown> = {}) {
  return {
    status: "ready",
    linked_episode_id: "ZPeBeS87EeI",
    custom_title: "عنوان مولّد",
    hero_summary: null,
    full_summary: null,
    takeaways: [],
    quotes: [
      { text: "اقتباس منسوب للضيف", theme: "تاريخ", speaker: "guest" },
    ],
    resources: [],
    timestamps: [],
    selected_quote_indices: null,
    selected_takeaway_indices: null,
    guest_package: null,
    raw_openai_response: null,
    ...overrides,
  }
}

beforeEach(() => {
  resetMock()
  vi.clearAllMocks()
  mockDb.execute.mockImplementation(() => Promise.resolve({ rows: [] }))
  fetchAllEpisodes.mockResolvedValue([
    { id: "ZPeBeS87EeI", title: "نور الدين زنكي" },
  ])
})

describe("Studio push — quote publish gate", () => {
  it("never writes quotes straight to published", async () => {
    getWebsitePackageForSession.mockResolvedValue(pkg())

    await runStudioPushToEpisode({
      sessionId: "s-1",
      fields: { quotes: true },
    })

    const { quotes } = rpcPayloads()
    expect(quotes).not.toBeNull()
    expect(quotes!.status).toBe("draft")
    expect(quotes!.published_at).toBeNull()
  })

  it("keeps the quote payload otherwise intact", async () => {
    getWebsitePackageForSession.mockResolvedValue(pkg())

    const result = await runStudioPushToEpisode({
      sessionId: "s-1",
      fields: { quotes: true },
    })

    const { quotes } = rpcPayloads()
    expect((quotes!.quotes as unknown[])).toHaveLength(1)
    expect(result.pushedFields).toContain("quotes")
  })
})

describe("Studio push — episode title resolution", () => {
  it("uses the resolved YouTube title when available", async () => {
    getWebsitePackageForSession.mockResolvedValue(pkg())

    await runStudioPushToEpisode({
      sessionId: "s-1",
      fields: { title: true },
    })

    const { override } = rpcPayloads()
    expect(override!.original_title).toBe("نور الدين زنكي")
    expect(override!.custom_title).toBe("عنوان مولّد")
  })

  it("fails loudly instead of writing the video id as a title", async () => {
    getWebsitePackageForSession.mockResolvedValue(pkg())
    fetchAllEpisodes.mockRejectedValue(new Error("quota exceeded"))

    await expect(
      runStudioPushToEpisode({ sessionId: "s-1", fields: { title: true } }),
    ).rejects.toMatchObject({ code: "title_unresolved" })
    expect(mockDb.execute).not.toHaveBeenCalled()
  })

  it("still pushes non-title fields when the title cannot be resolved", async () => {
    getWebsitePackageForSession.mockResolvedValue(
      pkg({ custom_title: null, hero_summary: "ملخّص" }),
    )
    fetchAllEpisodes.mockRejectedValue(new Error("quota exceeded"))

    const result = await runStudioPushToEpisode({
      sessionId: "s-1",
      fields: { hero_summary: true },
    })

    expect(result.pushedFields).toEqual(["hero_summary"])
    const { override } = rpcPayloads()
    expect(override).toBeNull()
  })

  it("rejects a resolved title that is just the YouTube id", async () => {
    getWebsitePackageForSession.mockResolvedValue(pkg())
    fetchAllEpisodes.mockResolvedValue([
      { id: "ZPeBeS87EeI", title: "ZPeBeS87EeI" },
    ])

    await expect(
      runStudioPushToEpisode({ sessionId: "s-1", fields: { title: true } }),
    ).rejects.toBeInstanceOf(StudioPushError)
  })
})
