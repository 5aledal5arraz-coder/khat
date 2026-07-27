/**
 * ص-٢ — deleting a studio session must delete the SESSION only.
 *
 * It used to hard-delete `episode_enrichments`, `episode_overrides` and
 * `episode_quotes_config` for the linked episode — outside the
 * transaction, behind an empty catch that returned `true` on partial
 * failure. Combined with ص-٣ (the link inferred from video_id) that
 * meant deleting a FAILED session wiped the published content pushed by
 * the GOOD session on the same video.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "../db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

// `vi.hoisted` so these survive vi.mock hoisting — the point of this
// file is that the episode-side deletes are NOT called, which only
// means something if the spies exist however the module imports them.
const episodeSpies = vi.hoisted(() => ({
  deleteEpisodeEnrichment: vi.fn(),
  deleteEpisodeOverride: vi.fn(),
  deleteEpisodeQuotesEntry: vi.fn(),
  getWebsitePackageForSession: vi.fn(),
}))
const {
  deleteEpisodeEnrichment,
  deleteEpisodeOverride,
  deleteEpisodeQuotesEntry,
  getWebsitePackageForSession,
} = episodeSpies

vi.mock("@/lib/episodes/enrichments", () => ({
  deleteEpisodeEnrichment: episodeSpies.deleteEpisodeEnrichment,
}))
vi.mock("@/lib/episodes/overrides", () => ({
  deleteEpisodeOverride: episodeSpies.deleteEpisodeOverride,
}))
vi.mock("@/lib/episodes/quotes", () => ({
  deleteEpisodeQuotesEntry: episodeSpies.deleteEpisodeQuotesEntry,
}))
vi.mock("@/lib/studio/website-packages", () => ({
  getWebsitePackageForSession: episodeSpies.getWebsitePackageForSession,
}))

vi.mock("fs/promises", () => ({ default: { rm: vi.fn().mockResolvedValue(undefined) } }))
vi.mock("@/lib/khat-brain/studio-resolver", () => ({
  resolveEirForStudioSession: vi.fn(),
}))

import { deleteStudioSession } from "@/lib/studio/sessions"

const SESSION = { id: "s-1", video_id: "ZPeBeS87EeI", video_title: "حلقة" }

beforeEach(() => {
  resetMock()
  vi.clearAllMocks()
  getWebsitePackageForSession.mockResolvedValue({
    linked_episode_id: "ZPeBeS87EeI",
  })
})

describe("deleteStudioSession", () => {
  it("never touches the linked episode's published content", async () => {
    mockSelectResult([SESSION]) // the existence check

    const result = await deleteStudioSession("s-1")

    expect(result.success).toBe(true)
    expect(deleteEpisodeEnrichment).not.toHaveBeenCalled()
    expect(deleteEpisodeOverride).not.toHaveBeenCalled()
    expect(deleteEpisodeQuotesEntry).not.toHaveBeenCalled()
  })

  it("deletes the session and its outputs inside one transaction", async () => {
    mockSelectResult([SESSION])

    await deleteStudioSession("s-1")

    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
  })

  it("reports a missing session as not_found without opening a transaction", async () => {
    mockSelectResult([])

    const result = await deleteStudioSession("s-missing")

    expect(result).toEqual({ success: false, reason: "not_found" })
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it("reports a DB failure as failed — not as a missing session", async () => {
    mockSelectResult([SESSION])
    mockDb.transaction.mockRejectedValueOnce(new Error("deadlock detected"))

    const result = await deleteStudioSession("s-1")

    expect(result).toMatchObject({ success: false, reason: "failed" })
  })
})
