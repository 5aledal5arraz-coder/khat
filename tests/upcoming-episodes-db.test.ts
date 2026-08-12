/**
 * `upcoming_episodes` — against the REAL local database.
 *
 * WHY NOT `tests/db-mock.ts`. Everything worth asserting here lives in a WHERE
 * clause, and the mock ignores WHERE entirely: it returns whatever rows were
 * queued, regardless of the filter. A mocked "draft is not public" test would
 * pass with `status` deleted from the query — the exact shape of the prep-journey
 * failure, where 2142 green tests survived a dead feature.
 *
 * So this file talks to Postgres. It seeds three throwaway EIRs and three
 * upcoming rows, asserts the SQL, and deletes exactly what it created (upcoming
 * rows first — the EIR FK is RESTRICT). It never touches existing data: the one
 * pre-existing row it reads is an episode slug, read-only.
 *
 * Skipped only when DATABASE_URL is unset. An UNREACHABLE database fails loudly
 * rather than silently — a guard that turns a broken query into a green run is
 * worse than no guard.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Pool } from "pg"

import { loadEnvFiles } from "@/lib/env-file"

type QueryModule = typeof import("@/lib/queries/upcoming-episodes")

const TAG = `vitest-upcoming-${Date.now()}`
const SLUG = {
  published: `${TAG}-published`,
  draft: `${TAG}-draft`,
  withdrawn: `${TAG}-withdrawn`,
  free: `${TAG}-free`,
}
/** The guest-card fixture: two published pages on ONE guest, one dated one not. */
const MULTI = {
  dated: `${TAG}-multi-dated`,
  undated: `${TAG}-multi-undated`,
}

let q: QueryModule
let pool: Pool
let hasDb = false
/** ids we created, for teardown. */
const eirIds: string[] = []
const upcomingIds: Record<string, string> = {}
/** Episodes that already exist — read-only. Two, because two suites each need
 * their own "an episode already holds this slug" collision and the slug column
 * is UNIQUE, so they cannot share one. */
let existingEpisodeSlug = ""
let secondEpisodeSlug = ""
/**
 * THREE DIFFERENT existing guests, one per status — read-only.
 *
 * A DISTINCT guest per row is what gives the strip-link test its sight. The
 * first version of this file gave the guest to the published row ONLY and left
 * draft/withdrawn on `guest_id = null`, so `inArray` never matched them
 * whatever their status was: deleting the `status` filter from
 * `getPublishedUpcomingSlugsByGuestIds` broke nothing, and the requirement at
 * the heart of the feature — «a قريباً face links only when its page is
 * published» — was covered by nothing at all. Caught by Noura.
 *
 * Sharing ONE guest across the three would not fix it either: the map is keyed
 * by guest, so a lost filter could still return the published slug by accident
 * and the test would pass on luck. Distinct guests make the assertion total —
 * if the filter goes, B and C appear in the map, always.
 */
let guestPublished: string | null = null
let guestDraft: string | null = null
let guestWithdrawn: string | null = null
/**
 * Two MORE distinct guests, for `listPublishedUpcomingForGuest`. The same
 * reasoning: that query filters by `guest_id` AND `status`, so a guest shared
 * with the rows above would let a lost `status` filter still return the right
 * slug by accident.
 *  · `guestMulti`  — owns TWO published pages, one dated, one not.
 *  · `guestCollide` — owns one published page whose slug an EPISODE already
 *    holds, with `published_episode_id` still NULL.
 */
let guestMulti: string | null = null
let guestCollide: string | null = null

beforeAll(async () => {
  loadEnvFiles()
  if (!process.env.DATABASE_URL) {
    console.warn("[upcoming-episodes-db] DATABASE_URL unset — skipping real-DB assertions")
    return
  }
  hasDb = true

  // Imported AFTER loadEnvFiles(): `lib/db` reads DATABASE_URL at module
  // evaluation, and a static import would have run before this line.
  q = await import("@/lib/queries/upcoming-episodes")
  pool = new Pool({ connectionString: process.env.DATABASE_URL })

  const ep = await pool.query(
    "select slug from episodes where slug is not null order by slug limit 2",
  )
  existingEpisodeSlug = ep.rows[0]?.slug ?? ""
  secondEpisodeSlug = ep.rows[1]?.slug ?? ""

  const g = await pool.query("select id from guests order by id limit 5")
  guestPublished = g.rows[0]?.id ?? null
  guestDraft = g.rows[1]?.id ?? null
  guestWithdrawn = g.rows[2]?.id ?? null
  guestMulti = g.rows[3]?.id ?? null
  guestCollide = g.rows[4]?.id ?? null

  for (const [key, slug] of Object.entries(SLUG)) {
    if (key === "free") continue
    const eir = await pool.query(
      "insert into episode_intelligence_records (id, working_title) values (gen_random_uuid(), $1) returning id",
      [`${TAG}-${key}`],
    )
    const eirId = eir.rows[0].id
    eirIds.push(eirId)

    const row = await pool.query(
      `insert into upcoming_episodes (id, eir_id, slug, title, status, guest_id, axes)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb) returning id`,
      [
        eirId,
        slug,
        `عنوان ${key}`,
        key,
        // EVERY row carries a guest, and a DIFFERENT one — see the note on
        // `guestPublished` above. Status must be the only thing that decides
        // which of them the strip may link.
        key === "published" ? guestPublished : key === "draft" ? guestDraft : guestWithdrawn,
        JSON.stringify(["محور أول", "محور ثاني"]),
      ],
    )
    upcomingIds[key] = row.rows[0].id
  }

  // ── The guest-card fixture ────────────────────────────────────────────────
  // Seeded here rather than inside the suite so the rows are torn down by the
  // one `afterAll` that already knows how to do it in FK order.
  const seedUpcoming = async (
    key: string,
    slug: string,
    guestId: string | null,
    status: string,
    fields: { summary?: string | null; expected_date?: string | null } = {},
  ) => {
    const eir = await pool.query(
      "insert into episode_intelligence_records (id, working_title) values (gen_random_uuid(), $1) returning id",
      [`${TAG}-${key}`],
    )
    eirIds.push(eir.rows[0].id)
    const row = await pool.query(
      `insert into upcoming_episodes (id, eir_id, slug, title, status, guest_id, summary, expected_date)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::date) returning id`,
      [
        eir.rows[0].id,
        slug,
        `عنوان ${key}`,
        status,
        guestId,
        fields.summary ?? null,
        fields.expected_date ?? null,
      ],
    )
    upcomingIds[key] = row.rows[0].id
  }

  await seedUpcoming("multiDated", MULTI.dated, guestMulti, "published", {
    summary: "موضوع الحلقة المؤرّخة",
    expected_date: "2026-09-15",
  })
  await seedUpcoming("multiUndated", MULTI.undated, guestMulti, "published")

  // An episode ALREADY holds this slug while `published_episode_id` is still
  // NULL — the drift `needs_attention` exists to record. Inserted directly:
  // the reservation is exactly what refuses this in normal use.
  if (secondEpisodeSlug) {
    await seedUpcoming("guestCollide", secondEpisodeSlug, guestCollide, "published")
  }
})

afterAll(async () => {
  if (!hasDb) return
  const ids = Object.values(upcomingIds)
  if (ids.length) {
    await pool.query("delete from upcoming_episodes where id = any($1::text[])", [ids])
  }
  if (eirIds.length) {
    await pool.query("delete from episode_intelligence_records where id = any($1::text[])", [
      eirIds,
    ])
  }
  await pool.end()
})

describe("getPublishedUpcomingBySlug — only `published` is public", () => {
  it("serves a published page", async () => {
    if (!hasDb) return
    const row = await q.getPublishedUpcomingBySlug(SLUG.published)
    expect(row).not.toBeNull()
    expect(row?.slug).toBe(SLUG.published)
    expect(row?.axes).toEqual(["محور أول", "محور ثاني"])
  })

  it("returns null for a DRAFT — it must not be reachable at its URL", async () => {
    if (!hasDb) return
    // Proof the row is really there and the filter is what withholds it.
    const raw = await pool.query("select status from upcoming_episodes where slug = $1", [
      SLUG.draft,
    ])
    expect(raw.rows[0]?.status).toBe("draft")

    expect(await q.getPublishedUpcomingBySlug(SLUG.draft)).toBeNull()
  })

  it("returns null for a WITHDRAWN page", async () => {
    if (!hasDb) return
    const raw = await pool.query("select status from upcoming_episodes where slug = $1", [
      SLUG.withdrawn,
    ])
    expect(raw.rows[0]?.status).toBe("withdrawn")

    expect(await q.getPublishedUpcomingBySlug(SLUG.withdrawn)).toBeNull()
  })
})

describe("listPublishedUpcomingForSitemap", () => {
  it("lists the published page and neither of the others", async () => {
    if (!hasDb) return
    const slugs = (await q.listPublishedUpcomingForSitemap()).map((r) => r.slug)
    expect(slugs).toContain(SLUG.published)
    expect(slugs).not.toContain(SLUG.draft)
    expect(slugs).not.toContain(SLUG.withdrawn)
  })

  it("never emits a slug an EPISODE already holds — even with `published_episode_id` still NULL", async () => {
    if (!hasDb) return

    // The drift the `needs_attention` column exists to record: the episode
    // aired at this slug, but the transition did not finish, so the
    // bookkeeping column is still NULL. Seeded by direct INSERT because the
    // reservation is precisely what would refuse this in normal use.
    const eir = await pool.query(
      "insert into episode_intelligence_records (id, working_title) values (gen_random_uuid(), $1) returning id",
      [`${TAG}-collide`],
    )
    eirIds.push(eir.rows[0].id)
    const row = await pool.query(
      `insert into upcoming_episodes (id, eir_id, slug, title, status, published_episode_id)
       values (gen_random_uuid(), $1, $2, 'صفحة على رابط حلقة موجودة', 'published', NULL)
       returning id`,
      [eir.rows[0].id, existingEpisodeSlug],
    )
    upcomingIds.collide = row.rows[0].id

    const slugs = (await q.listPublishedUpcomingForSitemap()).map((r) => r.slug)

    expect(slugs).not.toContain(existingEpisodeSlug)
    // And the document still lists each remaining slug exactly once.
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe("getPublishedUpcomingSlugsByGuestIds — the guest strip's link decision", () => {
  it("maps the guest whose page is PUBLISHED", async () => {
    if (!hasDb || !guestPublished) return
    const map = await q.getPublishedUpcomingSlugsByGuestIds([guestPublished])
    expect(map.get(guestPublished)).toBe(SLUG.published)
  })

  it("does NOT map a guest whose page is a draft or withdrawn", async () => {
    if (!hasDb || !guestPublished || !guestDraft || !guestWithdrawn) return

    // All three rows exist and all three carry a guest — proven here, so the
    // only thing that can withhold B and C is the `status` filter.
    const seeded = await pool.query(
      "select status, guest_id from upcoming_episodes where slug = any($1::text[]) order by status",
      [[SLUG.published, SLUG.draft, SLUG.withdrawn]],
    )
    expect(seeded.rows.map((r) => r.status)).toEqual(["draft", "published", "withdrawn"])
    expect(seeded.rows.every((r) => r.guest_id)).toBe(true)

    const map = await q.getPublishedUpcomingSlugsByGuestIds([
      guestPublished,
      guestDraft,
      guestWithdrawn,
    ])

    expect(map.get(guestPublished)).toBe(SLUG.published)
    expect(map.has(guestDraft)).toBe(false)
    expect(map.has(guestWithdrawn)).toBe(false)
    // Total: exactly one of the three guests may be linked.
    expect(map.size).toBe(1)
  })

  it("returns an empty map for an unknown guest", async () => {
    if (!hasDb) return
    const map = await q.getPublishedUpcomingSlugsByGuestIds(["no-such-guest-id"])
    expect(map.size).toBe(0)
  })
})

describe("listPublishedUpcomingForGuest — the card on /guests/[slug]", () => {
  it("returns the guest's PUBLISHED page", async () => {
    if (!hasDb || !guestPublished) return
    const rows = await q.listPublishedUpcomingForGuest(guestPublished)
    expect(rows.map((r) => r.slug)).toContain(SLUG.published)
  })

  it("returns NOTHING for a guest whose only page is a draft, and nothing for withdrawn", async () => {
    if (!hasDb || !guestDraft || !guestWithdrawn) return

    // The rows exist and they carry THESE guests — proven against the table,
    // so the only thing that can withhold them is the `status` filter. Delete
    // `eq(status,'published')` from the query and both of these come back.
    const seeded = await pool.query(
      "select status, guest_id from upcoming_episodes where slug = any($1::text[]) order by status",
      [[SLUG.draft, SLUG.withdrawn]],
    )
    expect(seeded.rows.map((r) => r.status)).toEqual(["draft", "withdrawn"])
    expect(seeded.rows.map((r) => r.guest_id)).toEqual([guestDraft, guestWithdrawn])

    const draftRows = await q.listPublishedUpcomingForGuest(guestDraft)
    const withdrawnRows = await q.listPublishedUpcomingForGuest(guestWithdrawn)

    // TOTAL, not "does not contain": these guests are distinct and each owns
    // exactly one seeded row, so an empty list is the whole assertion.
    expect(draftRows).toEqual([])
    expect(withdrawnRows).toEqual([])
  })

  it("returns ALL of a guest's published pages — dated first, «قريباً» last", async () => {
    if (!hasDb || !guestMulti) return
    const rows = await q.listPublishedUpcomingForGuest(guestMulti)

    // Both, not just the first: hiding the second would hide a URL already
    // distributed.
    expect(rows.map((r) => r.slug)).toEqual([MULTI.dated, MULTI.undated])
    // A `date` column must come back as the bare day — a Date here would shift
    // the day backwards in any timezone behind UTC, which `formatArabicDate`
    // would then print as the wrong day.
    expect(rows[0].expected_date).toBe("2026-09-15")
    expect(rows[0].summary).toBe("موضوع الحلقة المؤرّخة")
    expect(rows[1].expected_date).toBeNull()
  })

  it("never advertises a page whose slug an EPISODE already holds", async () => {
    if (!hasDb || !guestCollide || !secondEpisodeSlug) return

    // Published, guest-linked, and `published_episode_id` still NULL — so the
    // only thing that can withhold it is the NOT EXISTS. Without it this card
    // badges an aired episode «حلقة قادمة» and links to it, while that same
    // episode sits in the «الحلقات» list further down the same page.
    const seeded = await pool.query(
      "select status, guest_id, published_episode_id from upcoming_episodes where slug = $1",
      [secondEpisodeSlug],
    )
    expect(seeded.rows[0]?.status).toBe("published")
    expect(seeded.rows[0]?.guest_id).toBe(guestCollide)
    expect(seeded.rows[0]?.published_episode_id).toBeNull()

    expect(await q.listPublishedUpcomingForGuest(guestCollide)).toEqual([])
  })

  it("returns an empty list for an unknown guest and for an empty id", async () => {
    if (!hasDb) return
    expect(await q.listPublishedUpcomingForGuest("no-such-guest-id")).toEqual([])
    expect(await q.listPublishedUpcomingForGuest("")).toEqual([])
  })
})

describe("reserveUpcomingSlug — uniqueness across BOTH tables", () => {
  it("REJECTS a slug already owned by a published episode", async () => {
    if (!hasDb) return
    // The whole point of the reservation: `episodes` has its own UNIQUE index
    // and `upcoming_episodes` has its own, and neither can see the other.
    expect(existingEpisodeSlug).toBeTruthy()

    const result = await q.reserveUpcomingSlug(existingEpisodeSlug)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("حلقة منشورة")
  })

  it("rejects a slug already taken by another upcoming page", async () => {
    if (!hasDb) return
    const result = await q.reserveUpcomingSlug(SLUG.published)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("صفحة حلقة قادمة")
  })

  it("lets a row keep its OWN slug on edit (`excludeId`)", async () => {
    if (!hasDb) return
    const result = await q.reserveUpcomingSlug(SLUG.published, {
      excludeId: upcomingIds.published,
    })
    expect(result.ok).toBe(true)
  })

  it("accepts a free slug, normalized", async () => {
    if (!hasDb) return
    const result = await q.reserveUpcomingSlug(`  ${SLUG.free}  `)
    expect(result).toEqual({ ok: true, slug: SLUG.free })
  })

  it("refuses an empty slug and path-breaking characters", async () => {
    if (!hasDb) return
    expect((await q.reserveUpcomingSlug("   ")).ok).toBe(false)
    expect((await q.reserveUpcomingSlug("a/b")).ok).toBe(false)
    expect((await q.reserveUpcomingSlug("a?b")).ok).toBe(false)
    expect((await q.reserveUpcomingSlug("a%b")).ok).toBe(false)
  })

  it("never de-duplicates silently — a conflict is an error, not a new slug", async () => {
    if (!hasDb) return
    const result = await q.reserveUpcomingSlug(SLUG.published)
    // A `…-2` here would mean Khaled distributes one URL and gets another.
    expect(result.ok).toBe(false)
  })
})

describe("createUpcomingEpisode / updateUpcomingEpisode", () => {
  it("refuses to create a row on a slug an episode already owns", async () => {
    if (!hasDb) return

    // A DELTA, not an absolute count: the sitemap suite above deliberately
    // seeds a row on this very slug, so asserting "zero rows exist" would be
    // asserting something about a different test's fixture.
    const countRows = async () =>
      (
        await pool.query("select count(*)::int c from upcoming_episodes where slug = $1", [
          existingEpisodeSlug,
        ])
      ).rows[0].c as number

    const before = await countRows()

    const result = await q.createUpcomingEpisode({
      eir_id: eirIds[0],
      slug: existingEpisodeSlug,
      title: "لا يجب أن يُكتب",
    })
    expect(result.ok).toBe(false)

    // And nothing was written.
    expect(await countRows()).toBe(before)
  })

  it("refuses a second page for an EIR that already has one", async () => {
    if (!hasDb) return
    const result = await q.createUpcomingEpisode({
      eir_id: eirIds[0],
      slug: `${TAG}-second`,
      title: "صفحة ثانية لنفس الحلقة",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("صفحة قادمة أصلاً")
  })

  it("updates a row and returns the stored shape", async () => {
    if (!hasDb) return
    const result = await q.updateUpcomingEpisode(upcomingIds.draft, {
      title: "عنوان محدَّث",
      axes: ["  محور بمسافات  ", "", "محور ثاني"],
      expected_date: "2026-09-01",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.title).toBe("عنوان محدَّث")
      // Blank axes dropped, surrounding whitespace trimmed.
      expect(result.row.axes).toEqual(["محور بمسافات", "محور ثاني"])
      // A `date` column must come back as the bare day it was stored as —
      // `formatArabicDate` depends on that, and a Date here would shift the
      // day backwards in any timezone behind UTC.
      expect(result.row.expected_date).toBe("2026-09-01")
      // Still a draft: an update must not publish anything by itself.
      expect(result.row.status).toBe("draft")
    }
    expect(await q.getPublishedUpcomingBySlug(SLUG.draft)).toBeNull()
  })
})
