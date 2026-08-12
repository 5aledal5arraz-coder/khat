/**
 * The two-step slug resolution — PUBLISHED ALWAYS WINS.
 *
 * `/episodes/<slug>` is served by two tables, and the order between them is the
 * entire design: one permanent URL, no redirect, and a placeholder that stops
 * being reachable the moment a real episode takes its slug.
 *
 * The strongest assertion here is the negative one: when an episode exists, the
 * upcoming table must not even be QUERIED — so a reorder, or a "helpful" fetch
 * of both followed by a pick, fails the test instead of quietly passing.
 *
 * IT IS ASSERTED ON THE `select` SPY, NOT BY ARMING THE MOCK TO REJECT. The
 * first version of this file did the latter and was BLIND: every read in the
 * module ends in `catch { return null }`, so the planted rejection was swallowed
 * and the suite stayed green with the two steps deliberately reordered. Verified
 * by mutation in both directions before this file was committed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "./db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import { resolveEpisodeSlug, normalizeSlug } from "@/lib/queries/upcoming-episodes"

const EPISODE = { id: "yt-123", slug: "حلقة-منشورة", title: "حلقة منشورة" }

describe("resolveEpisodeSlug — published wins", () => {
  beforeEach(() => {
    resetMock()
    // `resetMock()` clears the QUEUED ROWS, not the spy's call history.
    mockDb.select.mockClear()
  })

  it("returns the episode when one exists at the slug", async () => {
    const result = await resolveEpisodeSlug("حلقة-منشورة", async () => EPISODE)

    expect(result).toEqual({ kind: "episode", episode: EPISODE })
  })

  it("does not touch `upcoming_episodes` at all when an episode exists", async () => {
    // The transition moment: the episode has just been created with the slug
    // the placeholder reserved, and both rows exist at once. The placeholder
    // must become unreachable — and unread.
    mockSelectResult([{ id: "u1", slug: "حلقة-منشورة", status: "published" }])

    const result = await resolveEpisodeSlug("حلقة-منشورة", async () => EPISODE)

    expect(result?.kind).toBe("episode")
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("falls through to a published upcoming page when no episode exists", async () => {
    mockSelectResult([
      {
        id: "u1",
        eir_id: "e1",
        slug: "حلقة-قادمة",
        guest_id: "g1",
        title: "حلقة قادمة",
        summary: null,
        axes: ["محور"],
        guest_message: null,
        guest_message_audio_url: null,
        guest_message_audio_duration: null,
        expected_date: null,
        status: "published",
        published_episode_id: null,
        needs_attention: false,
        created_at: null,
        updated_at: null,
        guest_name: "ضيف",
        guest_slug: "guest",
        guest_bio: null,
        guest_photo_url: null,
      },
    ])

    const result = await resolveEpisodeSlug("حلقة-قادمة", async () => null)

    expect(result?.kind).toBe("upcoming")
    if (result?.kind === "upcoming") {
      expect(result.upcoming.slug).toBe("حلقة-قادمة")
      expect(result.upcoming.axes).toEqual(["محور"])
      expect(result.upcoming.guest?.name).toBe("ضيف")
    }
  })

  it("returns null — a real 404 — when neither table answers", async () => {
    mockSelectResult([])

    const result = await resolveEpisodeSlug("ما-موجود", async () => null)

    expect(result).toBeNull()
  })

  it("never hands a page a non-array `axes`", async () => {
    // An older row can hold jsonb null; `.map()` on it is a render crash.
    mockSelectResult([
      {
        id: "u2",
        eir_id: "e2",
        slug: "بلا-محاور",
        guest_id: null,
        title: "بلا محاور",
        summary: null,
        axes: null,
        guest_message: null,
        guest_message_audio_url: null,
        guest_message_audio_duration: null,
        expected_date: null,
        status: "published",
        published_episode_id: null,
        needs_attention: false,
        created_at: null,
        updated_at: null,
        guest_name: null,
        guest_slug: null,
        guest_bio: null,
        guest_photo_url: null,
      },
    ])

    const result = await resolveEpisodeSlug("بلا-محاور", async () => null)

    expect(result?.kind).toBe("upcoming")
    if (result?.kind === "upcoming") expect(result.upcoming.axes).toEqual([])
  })
})

describe("normalizeSlug", () => {
  it("trims, collapses whitespace to dashes and drops wrapping slashes", () => {
    expect(normalizeSlug("  /حلقة قادمة/  ")).toBe("حلقة-قادمة")
  })

  it("leaves an already-clean Arabic slug untouched", () => {
    expect(normalizeSlug("حلقة-قادمة-مع-ضيف")).toBe("حلقة-قادمة-مع-ضيف")
  })
})
