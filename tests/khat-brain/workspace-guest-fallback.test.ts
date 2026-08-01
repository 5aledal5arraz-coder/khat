/**
 * Episode workspace — the guest contradiction.
 *
 * `eir.guest_id` has exactly ONE writer: the manual «إسناد ضيف» button
 * (actions.ts). Nothing in the automated path ever sets it, so it is NULL on
 * 8 of 8 local EIRs — including episodes whose preparation names a guest and
 * carries a full extraction strategy for them.
 *
 * `loadEpisodeWorkspace` derived the guest EXCLUSIVELY from that column, so
 * one screen said two things at once: the guest tab offered a (paid)
 * discovery run under «لم يتم ربط ضيف», while the preparation tab beside it
 * displayed that guest's name and strategy.
 *
 * The fix is read-side only — no writer was added, no column, no migration.
 * What is pinned here:
 *   • the fallback appears when there is no canonical guest,
 *   • it NEVER masquerades as one (`guest` stays null, so no id/slug/href),
 *   • a real linked guest always wins and suppresses the fallback,
 *   • the INDEX behaves identically, at one extra query for the whole page.
 *
 * ── Known coverage limit (do not read these tests as more than they are) ──
 * `tests/db-mock.ts` ignores the projection object handed to `.select()` and
 * replays whatever rows the test queued. So nothing in this file can fail if
 * `guest_name` is dropped from either SELECT: the mock would keep supplying
 * the column and every assertion below would stay green while production
 * returned `undefined` and the feature died silently. Catching that needs a
 * real Postgres round-trip, which the suite does not have. Flagged rather
 * than papered over with an assertion that only looks like it covers it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockDb, mockSelectResult, resetMock } from "../db-mock"

vi.mock("@/lib/db", () => ({ db: mockDb }))

const EIR_ID = "eir-1"

/**
 * Queue the reads `loadEpisodeWorkspace` performs, in construction order.
 *
 * Two of them are CONDITIONAL and short-circuit to `Promise.resolve([])`
 * without touching the DB — the guest read (skipped when `guest_id` is null)
 * and the candidate read (skipped when `editorial_intent.source_id` is
 * absent, which it always is here). Queueing a row for a read that never
 * happens shifts the whole FIFO by one and silently feeds the NEXT query the
 * wrong rows — which is how an earlier draft of this file got green results
 * for the wrong reason.
 */
function queueReads(opts: {
  guestId: string | null
  prepGuestName: string | null
  hasPrep?: boolean
}) {
  const hasPrep = opts.hasPrep ?? true
  mockSelectResult([
    {
      id: EIR_ID,
      working_title: "حلقة الاختبار",
      final_title: null,
      phase: "researching",
      season_id: null,
      topic_domain: null,
      episode_type: null,
      topic_angle_code: null,
      risk_level: null,
      effort_level: null,
      recording_scheduled_at: null,
      editorial_intent: null,
      guest_id: opts.guestId,
      archived_at: null,
      created_by: null,
      created_at: new Date(),
      updated_at: new Date(),
      season_name: null,
    },
  ])
  mockSelectResult([]) // transitions
  if (opts.guestId) {
    mockSelectResult([
      {
        id: opts.guestId,
        name: "ضيف مربوط",
        slug: "linked-guest",
        bio: null,
        photo_url: null,
        external_links: null,
        identity: null,
      },
    ])
  }
  // NO candidate row queued: editorial_intent is null in this fixture, so
  // that read short-circuits and never reaches the mock.
  mockSelectResult(
    hasPrep ? [{ id: "prep-1", guest_name: opts.prepGuestName }] : [],
  )
  mockSelectResult([]) // studio
  mockSelectResult([]) // episode
}

describe("loadEpisodeWorkspace — guest fallback", () => {
  beforeEach(() => resetMock())

  it("surfaces the prep's guest name WITHOUT fabricating a canonical guest", async () => {
    // The two halves are asserted together on purpose. Split apart, the
    // "`guest` stays null" half passed on the pre-fix code — where the whole
    // feature did not exist — so it measured nothing. Together they fail both
    // ways: on the old code (no fallback surfaced) and on the tempting wrong
    // fix (folding the name into `guest`, which would render a profile link
    // to a `guests` row that does not exist).
    const { loadEpisodeWorkspace } = await import("@/lib/khat-brain/episode-workspace")
    queueReads({ guestId: null, prepGuestName: "الأستاذ علي دريساوي" })

    const snap = await loadEpisodeWorkspace(EIR_ID)

    expect(snap).not.toBeNull()
    expect(snap!.guest_fallback_name).toBe("الأستاذ علي دريساوي")
    expect(snap!.guest).toBeNull()
  })

  it("a linked canonical guest wins and suppresses the fallback", async () => {
    const { loadEpisodeWorkspace } = await import("@/lib/khat-brain/episode-workspace")
    queueReads({ guestId: "guest-9", prepGuestName: "اسم مختلف بالإعداد" })

    const snap = await loadEpisodeWorkspace(EIR_ID)

    expect(snap!.guest?.name).toBe("ضيف مربوط")
    // Showing both names at once would just be a second contradiction.
    expect(snap!.guest_fallback_name).toBeNull()
  })

  it("stays null when neither source names anyone", async () => {
    const { loadEpisodeWorkspace } = await import("@/lib/khat-brain/episode-workspace")
    queueReads({ guestId: null, prepGuestName: null })

    const snap = await loadEpisodeWorkspace(EIR_ID)

    expect(snap!.guest).toBeNull()
    expect(snap!.guest_fallback_name).toBeNull()
  })

  it("treats a whitespace-only guest_name as absent", async () => {
    const { loadEpisodeWorkspace } = await import("@/lib/khat-brain/episode-workspace")
    queueReads({ guestId: null, prepGuestName: "   " })

    const snap = await loadEpisodeWorkspace(EIR_ID)

    expect(snap!.guest_fallback_name).toBeNull()
  })

  it("stays null when the episode has no preparation at all", async () => {
    const { loadEpisodeWorkspace } = await import("@/lib/khat-brain/episode-workspace")
    queueReads({ guestId: null, prepGuestName: null, hasPrep: false })

    const snap = await loadEpisodeWorkspace(EIR_ID)

    expect(snap!.guest_fallback_name).toBeNull()
    expect(snap!.has_preparation).toBe(false)
  })
})

/**
 * The INDEX has to answer the same way the detail page does.
 *
 * Fixing only `loadEpisodeWorkspace` left the contradiction on the operator's
 * actual entry point: `/admin/khat-brain/episodes` read the name solely from
 * `guests` joined on `eir.guest_id`, so the النهضة العربية row printed «بلا
 * ضيف» and opened onto «الأستاذ علي دريساوي». Verified against the local DB
 * on 2026-07-31: 8/8 live EIRs have `guest_id IS NULL`, 3 of them carry a
 * preparation `guest_name`.
 */
describe("listEpisodeWorkspaceIndex — guest fallback", () => {
  beforeEach(() => {
    resetMock()
    // `resetMock()` only drains the queued rows; the call COUNTERS on
    // `mockDb.select` survive it, and two of the tests below assert on them.
    vi.clearAllMocks()
  })

  const eir = (id: string, guest_name: string | null) => ({
    id,
    working_title: `حلقة ${id}`,
    phase: "researching",
    season_id: null,
    guest_id: guest_name ? `g-${id}` : null,
    updated_at: new Date(),
    season_name: null,
    guest_name,
  })

  it("fills the fallback from the preparation for rows with no canonical guest", async () => {
    const { listEpisodeWorkspaceIndex } = await import(
      "@/lib/khat-brain/episode-workspace"
    )
    mockSelectResult([eir("a", null), eir("b", "ضيف مربوط"), eir("c", null)])
    mockSelectResult([
      { eir_id: "a", guest_name: "الأستاذ علي دريساوي" },
      { eir_id: "c", guest_name: "   " }, // whitespace-only → absent
    ])

    const rows = await listEpisodeWorkspaceIndex()

    expect(rows.map((r) => r.guest_fallback_name)).toEqual([
      "الأستاذ علي دريساوي",
      null, // a linked guest always wins — never two names on one row
      null, // whitespace is not a name
    ])
  })

  it("uses the NEWEST preparation even when its guest_name is empty", async () => {
    // The prep read is ordered `updated_at DESC`, and the first row per EIR is
    // the answer — including when that answer is "no name". Falling through to
    // an older prep would print a guest the detail page does not show, which
    // is the same contradiction in a new costume.
    const { listEpisodeWorkspaceIndex } = await import(
      "@/lib/khat-brain/episode-workspace"
    )
    mockSelectResult([eir("a", null)])
    mockSelectResult([
      { eir_id: "a", guest_name: null }, // newest
      { eir_id: "a", guest_name: "اسم قديم" }, // superseded
    ])

    const rows = await listEpisodeWorkspaceIndex()

    expect(rows[0].guest_fallback_name).toBeNull()
  })

  it("costs ONE extra query for the whole page, not one per row", async () => {
    // This is a list route. `listPreparations` already shows how one of these
    // degrades when it reads more per row than it needs; an N+1 here would be
    // strictly worse.
    const { listEpisodeWorkspaceIndex } = await import(
      "@/lib/khat-brain/episode-workspace"
    )
    const many = Array.from({ length: 25 }, (_, i) => eir(`e${i}`, null))
    mockSelectResult(many)
    mockSelectResult(many.map((r) => ({ eir_id: r.id, guest_name: "ضيف" })))

    const rows = await listEpisodeWorkspaceIndex()

    expect(rows).toHaveLength(25)
    expect(rows.every((r) => r.guest_fallback_name === "ضيف")).toBe(true)
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })

  it("skips the extra query entirely when every row has a linked guest", async () => {
    const { listEpisodeWorkspaceIndex } = await import(
      "@/lib/khat-brain/episode-workspace"
    )
    mockSelectResult([eir("a", "ضيف مربوط"), eir("b", "ضيف آخر")])

    const rows = await listEpisodeWorkspaceIndex()

    expect(rows.every((r) => r.guest_fallback_name === null)).toBe(true)
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })
})
