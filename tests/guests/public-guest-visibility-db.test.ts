/**
 * Public guests = guests who have AIRED (Khaled, 2026-09-28) — against the
 * REAL local database.
 *
 * WHY NOT `tests/db-mock.ts`: the rule lives in which episodes count (hidden,
 * draft, future-dated) and which guest rows survive — a mock that returns the
 * queued rows regardless of filters would pass with the rule deleted.
 *
 * Seeds throwaway guests + episodes (+ one hidden row, one EIR, one upcoming
 * page), asserts, and deletes exactly what it created. Existing data is only
 * read. The HTTP 404 for a not-yet-aired guest is asserted separately, on a
 * production build (tests/http/not-found-status.test.ts).
 *
 * Mutation sight: drop the filter in `getGuests` and the unaired guest comes
 * back in the public list; drop the `aired` check in `getGuestBySlug` and his
 * page resolves — both assertions below fail.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Pool } from "pg"

import { loadEnvFiles } from "@/lib/env-file"

type EpisodesModule = typeof import("@/lib/queries/episodes")
type UpcomingModule = typeof import("@/lib/queries/upcoming-episodes")
type FeaturedModule = typeof import("@/lib/queries/homepage-featured")
type ThinkersModule = typeof import("@/lib/queries/homepage-thinkers")

const TAG = `vitest-pubguest-${Date.now()}`
const G = {
  unaired: `${TAG}-unaired`,
  aired: `${TAG}-aired`,
  hidden: `${TAG}-hidden`,
  future: `${TAG}-future`,
  draft: `${TAG}-draft`,
}

let eq: EpisodesModule
let up: UpcomingModule
let feat: FeaturedModule
let thinkers: ThinkersModule
let pool: Pool
let hasDb = false
const episodeIds: string[] = []
let eirId: string | null = null
const upcomingSlug = `${TAG}-upcoming`

async function seedGuest(id: string) {
  await pool.query("insert into guests (id, name, slug) values ($1, $2, $3)", [id, `ضيف ${id}`, id])
}

async function seedEpisode(guestId: string, opts: { status?: string; releaseDate?: string; suffix?: string } = {}) {
  const id = `${guestId}-ep${opts.suffix ?? ""}`
  await pool.query(
    `insert into episodes (id, title, slug, youtube_url, release_date, status, guest_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      `حلقة ${guestId}`,
      id,
      `https://www.youtube.com/watch?v=${id.slice(-11)}`,
      opts.releaseDate ?? "2024-01-01",
      opts.status ?? "published",
      guestId,
    ],
  )
  episodeIds.push(id)
  return id
}

beforeAll(async () => {
  loadEnvFiles()
  if (!process.env.DATABASE_URL) {
    console.warn("[public-guest-visibility-db] DATABASE_URL unset — skipping real-DB assertions")
    return
  }
  hasDb = true
  // DB-only archive: the YouTube merge would read the snapshot / network,
  // and the rule under test is the same on either source.
  delete process.env.YOUTUBE_API_KEY
  eq = await import("@/lib/queries/episodes")
  up = await import("@/lib/queries/upcoming-episodes")
  feat = await import("@/lib/queries/homepage-featured")
  thinkers = await import("@/lib/queries/homepage-thinkers")
  pool = new Pool({ connectionString: process.env.DATABASE_URL })

  for (const id of Object.values(G)) await seedGuest(id)
  await seedEpisode(G.aired)
  const hiddenEp = await seedEpisode(G.hidden)
  await pool.query("insert into hidden_episodes (id, episode_id) values (gen_random_uuid(), $1)", [hiddenEp])
  await seedEpisode(G.future, { releaseDate: "2099-01-01" })
  await seedEpisode(G.draft, { status: "draft" })
  // The aired guest also has a HIDDEN second episode with a quote on it —
  // the quote must not reach his public page.
  const hiddenSecond = await seedEpisode(G.aired, { suffix: "-hidden" })
  await pool.query("insert into hidden_episodes (id, episode_id) values (gen_random_uuid(), $1)", [hiddenSecond])
  await pool.query("insert into quotes (id, episode_id, guest_id, text) values ($1, $2, $3, $4), ($5, $6, $3, $7)", [
    `${TAG}-q-aired`, `${G.aired}-ep`, G.aired, "اقتباس من حلقة نزلت",
    `${TAG}-q-hidden`, hiddenSecond, "اقتباس من حلقة مخفية",
  ])

  // An upcoming («قريباً») page for the unaired guest — the deliberate
  // pre-episode feature. Its guest card must not link to a 404.
  const eir = await pool.query(
    "insert into episode_intelligence_records (id, working_title) values (gen_random_uuid(), $1) returning id",
    [TAG],
  )
  eirId = eir.rows[0].id
  await pool.query(
    `insert into upcoming_episodes (id, eir_id, slug, title, status, guest_id, axes)
     values (gen_random_uuid(), $1, $2, $3, 'published', $4, '[]'::jsonb)`,
    [eirId, upcomingSlug, "حلقة قادمة", G.unaired],
  )
}, 30_000)

afterAll(async () => {
  if (!hasDb) return
  await pool.query("delete from upcoming_episodes where slug = $1", [upcomingSlug])
  if (eirId) await pool.query("delete from episode_intelligence_records where id = $1", [eirId])
  if (episodeIds.length) {
    await pool.query("delete from hidden_episodes where episode_id = any($1)", [episodeIds])
    await pool.query("delete from episodes where id = any($1)", [episodeIds])
  }
  await pool.query("delete from guests where id = any($1)", [Object.values(G)])
  await pool.end()
})

describe("public guests are the guests who have aired", () => {
  it("the public list holds the aired guest and none of the others", async () => {
    if (!hasDb) return
    const ids = new Set((await eq.getGuests()).map((g) => g.id))
    expect(ids.has(G.aired)).toBe(true) // sight: the rule lets a real one through
    expect(ids.has(G.unaired)).toBe(false) // no episode at all (g-001's case)
    expect(ids.has(G.hidden)).toBe(false) // only episode is hidden
    expect(ids.has(G.future)).toBe(false) // only episode is future-dated
    expect(ids.has(G.draft)).toBe(false) // only episode is not published
  })

  it("the admin list (includeUnreleased) still has everyone", async () => {
    if (!hasDb) return
    const ids = new Set((await eq.getGuests({ includeUnreleased: true })).map((g) => g.id))
    for (const id of Object.values(G)) expect(ids.has(id)).toBe(true)
  })

  it("getGuestBySlug: null for every unaired guest, the page for the aired one", async () => {
    if (!hasDb) return
    for (const slug of [G.unaired, G.hidden, G.future, G.draft]) {
      expect(await eq.getGuestBySlug(slug)).toBeNull()
    }
    const aired = await eq.getGuestBySlug(G.aired)
    expect(aired?.id).toBe(G.aired)
    expect(aired?.episodes.map((e) => e.id)).toEqual([`${G.aired}-ep`])
  })

  it("guest page quotes come from aired episodes only", async () => {
    if (!hasDb) return
    const aired = await eq.getGuestBySlug(G.aired)
    expect(aired?.quotes.map((q) => q.text)).toEqual(["اقتباس من حلقة نزلت"])
  })

  it("the public archive drops draft and future-dated rows; the admin view keeps them", async () => {
    if (!hasDb) return
    const pub = new Set((await eq.getEpisodes({})).map((e) => e.id))
    expect(pub.has(`${G.aired}-ep`)).toBe(true) // sight
    expect(pub.has(`${G.future}-ep`)).toBe(false)
    expect(pub.has(`${G.draft}-ep`)).toBe(false)
    const admin = new Set((await eq.getEpisodes({ includeHidden: true })).map((e) => e.id))
    expect(admin.has(`${G.future}-ep`)).toBe(true)
    expect(admin.has(`${G.draft}-ep`)).toBe(true)
    // search goes through the same pipeline (/api/episodes?search=)
    const found = (await eq.getEpisodes({ search: `حلقة ${G.future}` })).map((e) => e.id)
    expect(found).not.toContain(`${G.future}-ep`)
  })

  it("/episodes/<slug> for a draft or future row resolves to nothing (the route then 404s or shows «قريباً»)", async () => {
    if (!hasDb) return
    expect(await eq.getEpisodeBySlug(`${G.future}-ep`)).toBeNull()
    expect(await eq.getEpisodeBySlug(`${G.draft}-ep`)).toBeNull()
    expect(await eq.getEpisodeBySlug(`${G.aired}-ep`)).not.toBeNull() // sight
  })

  it("homepage: the featured hero and the auto thinkers bench never pick an unaired row", async () => {
    if (!hasDb) return
    const hero = (await feat.getLatestEpisodesForHomepage()).map((e) => e.id)
    expect(hero).not.toContain(`${G.future}-ep`) // it would sort FIRST by date
    const bench = (await thinkers.getLatestGuestsForHomepage(50)).map((g) => g.id)
    expect(bench).not.toContain(G.future)
    expect(bench).not.toContain(G.draft)
  })

  it("an upcoming episode page keeps its unaired guest, but the card no longer links to the 404", async () => {
    if (!hasDb) return
    const page = await up.getPublishedUpcomingBySlug(upcomingSlug)
    expect(page?.guest?.name).toBe(`ضيف ${G.unaired}`)
    expect(page?.guest?.slug).toBeNull()
    // Sight: once the same guest HAS aired, the slug (the link) comes back.
    await pool.query("update upcoming_episodes set guest_id = $1 where slug = $2", [G.aired, upcomingSlug])
    expect((await up.getPublishedUpcomingBySlug(upcomingSlug))?.guest?.slug).toBe(G.aired)
  })
})
