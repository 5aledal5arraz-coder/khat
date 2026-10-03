/**
 * Podcast Universe M1 against the REAL local database.
 *
 * ── WHY NOT tests/db-mock.ts ───────────────────────────────────────────────
 * Every claim here is about what Postgres does: the UNIQUE(youtube_video_id)
 * UPSERT turning a re-crawl into zero new rows, a checkpoint row surviving a
 * quota stop, the conditional ledger UPSERT refusing the unit that would cross
 * the cap, a CHECK refusing a VERIFIED nationality from episode metadata. The
 * mock has no index, no constraint and no conflict target.
 *
 * ── WHAT IS FAKED ──────────────────────────────────────────────────────────
 *   • YouTube — an in-memory 3-page uploads playlist (no network, no quota);
 *   • Luna — a fake `runAi` (no network, $0), and the next-batch / resolve
 *     enqueuers (so no job row is created).
 * Every row this file creates is tagged with TAG and deleted in afterAll. The
 * quota test uses a quota day in 2001 so today's real ledger is never touched.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { loadEnvFiles } from "@/lib/env-file"

loadEnvFiles()
process.env.DB_POOL_MAX = "4"

// Localhost ONLY (yousef 2026-10-03): this file writes and deletes rows, so it
// must never run against a remote DATABASE_URL (.env.local also holds the
// live connection string one line away).
function isLocalDb(url: string | undefined): boolean {
  if (!url) return false
  try {
    const h = new URL(url).hostname
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]"
  } catch {
    return false
  }
}
const HAS_DB = isLocalDb(process.env.DATABASE_URL)
const d = HAS_DB ? describe : describe.skip

const TAG = `vitest-pu-${Date.now()}`
const HANDLE = `@${TAG}`
const OLD = "2020-01-01T00:00:00Z"

type Mods = {
  db: typeof import("@/lib/db")["db"]
  sql: typeof import("drizzle-orm")["sql"]
  crawl: typeof import("@/lib/podcast-universe/crawl")
  episodes: typeof import("@/lib/podcast-universe/episodes")
  quota: typeof import("@/lib/podcast-universe/quota")
  run: typeof import("@/lib/podcast-universe/extraction/run")
  people: typeof import("@/lib/podcast-universe/people")
  schema: typeof import("@/lib/db/schema/podcast-universe")
}
let m: Mods
let channelId = ""
const runIds: string[] = []

// ─── Fake YouTube: 3 pages × 3 uploads; "…-p" is private (no videos.list item) ──
const PAGES = [
  [`${TAG}-a1`, `${TAG}-a2`, `${TAG}-a3`],
  [`${TAG}-b1`, `${TAG}-b2`, `${TAG}-b3-p`],
  [`${TAG}-c1`, `${TAG}-c2`, `${TAG}-c3`],
]
function fakeClient(opts: { quotaStopOnPage?: number } = {}) {
  let calls = 0
  return {
    calls: () => calls,
    channelByHandle: vi.fn(),
    channelById: vi.fn(),
    searchChannel: vi.fn(),
    async playlistPage(_pl: string, token: string | null) {
      calls++
      const i = token ? Number(token) : 0
      return {
        items: PAGES[i].map((id) => ({
          contentDetails: { videoId: id, videoPublishedAt: OLD },
          snippet: { title: id.endsWith("-p") ? "Private video" : id, publishedAt: OLD },
          status: { privacyStatus: id.endsWith("-p") ? "private" : "public" },
        })),
        nextPageToken: i + 1 < PAGES.length ? String(i + 1) : null,
        totalResults: 9,
      }
    },
    async videosByIds(ids: string[]) {
      calls++
      const page = PAGES.findIndex((p) => p.includes(ids[0]))
      if (opts.quotaStopOnPage === page) {
        const { PodcastQuotaExhaustedError } = await import("@/lib/podcast-universe/quota")
        throw new PodcastQuotaExhaustedError("read", new Date("2030-01-01T08:05:00Z"))
      }
      return ids
        .filter((id) => !id.endsWith("-p"))
        .map((id, k) => ({
          id,
          snippet: { title: `حلقة ${id}`, description: "وصف", publishedAt: OLD },
          contentDetails: { duration: k === 0 ? "PT1H5M" : k === 1 ? "PT10M" : "PT3M" },
          statistics: { viewCount: "1000" },
          status: { privacyStatus: "public" },
        }))
    },
  }
}

async function q<T = Record<string, unknown>>(query: ReturnType<Mods["sql"]>): Promise<T[]> {
  return (await m.db!.execute(query)).rows as T[]
}

d("Podcast Universe — real DB", () => {
  beforeAll(async () => {
    m = {
      db: (await import("@/lib/db")).db,
      sql: (await import("drizzle-orm")).sql,
      crawl: await import("@/lib/podcast-universe/crawl"),
      episodes: await import("@/lib/podcast-universe/episodes"),
      quota: await import("@/lib/podcast-universe/quota"),
      run: await import("@/lib/podcast-universe/extraction/run"),
      people: await import("@/lib/podcast-universe/people"),
      schema: await import("@/lib/db/schema/podcast-universe"),
    }
    const [c] = await m.db!
      .insert(m.schema.podcastChannels)
      .values({
        handle: HANDLE.toLowerCase(),
        youtube_channel_id: `UC${TAG}`,
        name: TAG,
        registry_type: "core_interview",
        registry_source: "manual",
        verification_status: "verified",
        uploads_playlist_id: `UU${TAG}`,
      })
      .returning({ id: m.schema.podcastChannels.id })
    channelId = c.id
  })

  afterAll(async () => {
    if (!m?.db || !channelId) return
    const { sql } = m
    const people = await q<{ person_id: string }>(sql`
      SELECT DISTINCT person_id FROM podcast_guest_appearances
      WHERE episode_id IN (SELECT id FROM podcast_episodes WHERE channel_id = ${channelId}::uuid)`)
    await m.db.execute(sql`DELETE FROM podcast_guest_appearances WHERE episode_id IN (SELECT id FROM podcast_episodes WHERE channel_id = ${channelId}::uuid)`)
    // podcast_person_events → RESTRICT (0039): the audit rows go first, explicitly.
    for (const p of people) {
      await m.db.execute(sql`DELETE FROM podcast_person_events WHERE person_id = ${p.person_id}::uuid`)
      await m.db.execute(sql`DELETE FROM podcast_people WHERE id = ${p.person_id}::uuid`)
    }
    await m.db.execute(sql`DELETE FROM podcast_person_events WHERE person_id IN (SELECT id FROM podcast_people WHERE canonical_name LIKE ${TAG + "%"})`)
    await m.db.execute(sql`DELETE FROM podcast_people WHERE canonical_name LIKE ${TAG + "%"}`)
    await m.db.execute(sql`DELETE FROM podcast_episodes WHERE channel_id = ${channelId}::uuid`)
    await m.db.execute(sql`DELETE FROM podcast_crawl_runs WHERE channel_id = ${channelId}::uuid`)
    for (const id of runIds) await m.db.execute(sql`DELETE FROM podcast_crawl_runs WHERE id = ${id}::uuid`)
    await m.db.execute(sql`DELETE FROM podcast_channels WHERE id = ${channelId}::uuid`)
    await m.db.execute(sql`DELETE FROM podcast_quota_usage WHERE quota_day = '2001-01-01'`)
  })

  it("UPSERT on youtube_video_id: the same row twice is one insert then one update", async () => {
    const row = m.episodes.episodeRowFromVideo(
      {
        id: `${TAG}-upsert`,
        snippet: { title: "t", publishedAt: OLD },
        contentDetails: { duration: "PT25M" },
        statistics: { viewCount: "5" },
        status: { privacyStatus: "public" },
      },
      channelId,
      "core_interview",
    ).row!
    expect(row.duration_class).toBe("core_longform")
    expect(row.guest_extraction_status).toBe("pending")
    expect(await m.episodes.upsertEpisodes([row])).toEqual({ inserted: 1, updated: 0 })
    // Downstream state must survive a metadata refresh.
    await m.db!.execute(m.sql`UPDATE podcast_episodes SET guest_extraction_status = 'succeeded' WHERE youtube_video_id = ${row.youtube_video_id}`)
    expect(await m.episodes.upsertEpisodes([{ ...row, title: "t2", view_count: 9 }])).toEqual({ inserted: 0, updated: 1 })
    const [e] = await q<{ title: string; view_count: string; guest_extraction_status: string }>(
      m.sql`SELECT title, view_count, guest_extraction_status FROM podcast_episodes WHERE youtube_video_id = ${row.youtube_video_id}`,
    )
    expect(e.title).toBe("t2")
    expect(Number(e.view_count)).toBe(9)
    expect(e.guest_extraction_status).toBe("succeeded")
    await m.db!.execute(m.sql`DELETE FROM podcast_episodes WHERE youtube_video_id = ${row.youtube_video_id}`)
  })

  it("quota stop → budget_stopped with a checkpoint; resume completes; a second full crawl creates 0 duplicates", async () => {
    const run = await m.crawl.createRun(channelId, "initial")
    // Page index 1 hits the app quota cap.
    const stopped = await m.crawl.runCrawl(run.id, { client: fakeClient({ quotaStopOnPage: 1 }) as never })
    expect(stopped.status).toBe("budget_stopped")
    let [r] = await q<{ status: string; cursor_state: { pageToken: string; pages: number } }>(m.sql`SELECT status, cursor_state FROM podcast_crawl_runs WHERE id = ${run.id}::uuid`)
    expect(r.status).toBe("budget_stopped")
    expect(r.cursor_state.pages).toBe(1)
    expect(r.cursor_state.pageToken).toBe("1")
    const [ch] = await q<{ crawl_status: string }>(m.sql`SELECT crawl_status FROM podcast_channels WHERE id = ${channelId}::uuid`)
    expect(ch.crawl_status).toBe("partial") // never "complete" on a quota stop (D8)

    // Resume the SAME run — continues from page 1, not page 0.
    const fc = fakeClient()
    const done = await m.crawl.runCrawl(run.id, { client: fc as never })
    expect(done.status).toBe("succeeded")
    expect(fc.calls()).toBe(4) // pages 1 and 2: playlist + videos each
    ;[r] = await q(m.sql`SELECT status, cursor_state FROM podcast_crawl_runs WHERE id = ${run.id}::uuid`)
    expect(r.status).toBe("succeeded")

    const count = async () =>
      Number((await q<{ n: string }>(m.sql`SELECT count(*) n FROM podcast_episodes WHERE channel_id = ${channelId}::uuid`))[0].n)
    expect(await count()).toBe(8) // 9 uploads, 1 private never indexed

    // Second complete initial crawl: 0 new rows.
    const run2 = await m.crawl.createRun(channelId, "initial")
    const again = await m.crawl.runCrawl(run2.id, { client: fakeClient() as never })
    expect(again).toMatchObject({ status: "succeeded", inserted: 0, updated: 8 })
    expect(await count()).toBe(8)

    // Duration classes are deterministic per item position: 1h5m / 10m / 3m.
    const classes = await q<{ duration_class: string; n: string }>(m.sql`
      SELECT duration_class, count(*) n FROM podcast_episodes WHERE channel_id = ${channelId}::uuid GROUP BY 1 ORDER BY 1`)
    expect(Object.fromEntries(classes.map((c) => [c.duration_class, Number(c.n)]))).toEqual({
      core_longform: 3,
      midform_context: 3,
      short_clip: 2,
    })
    // The private upload is logged, not silently dropped.
    const [r2] = await q<{ cursor_state: { unavailable_count: number; unavailable_ids: string[] } }>(
      m.sql`SELECT cursor_state FROM podcast_crawl_runs WHERE id = ${run2.id}::uuid`,
    )
    expect(r2.cursor_state.unavailable_count).toBe(1)
    expect(r2.cursor_state.unavailable_ids[0]).toContain(":private")
  })

  it("incremental crawl stops after the 2-page overlap once pages are all known and old", async () => {
    const run = await m.crawl.createRun(channelId, "incremental")
    const fc = fakeClient()
    const out = await m.crawl.runCrawl(run.id, { client: fc as never })
    expect(out.status).toBe("succeeded")
    expect(out).toMatchObject({ pages: 2, inserted: 0 })
    const [r] = await q<{ cursor_state: { stop_reason: string } }>(m.sql`SELECT cursor_state FROM podcast_crawl_runs WHERE id = ${run.id}::uuid`)
    expect(r.cursor_state.stop_reason).toBe("incremental_overlap_reached")
  })

  it("ONE active crawl per channel: a live running crawl blocks a second; a stale one is taken over (2026-10-03)", async () => {
    const a = await m.crawl.createRun(channelId, "incremental")
    const b = await m.crawl.createRun(channelId, "incremental")
    runIds.push(a.id, b.id)
    await m.db!.execute(m.sql`UPDATE podcast_crawl_runs SET status = 'running' WHERE id = ${a.id}::uuid`)
    // A live job behind run A (run_after far in the future: no worker will take it).
    const [job] = await q<{ id: string }>(m.sql`
      INSERT INTO jobs (id, type, payload, status, run_after, max_attempts)
      VALUES (gen_random_uuid()::text, 'podcast.channel.incremental_crawl', ${JSON.stringify({ runId: a.id, channelId })}::jsonb, 'pending', '2099-01-01', 1)
      RETURNING id`)
    try {
      const busy = await m.crawl.runCrawl(b.id, { client: fakeClient() as never })
      expect(busy).toEqual({ status: "busy", runningRunId: a.id })
      const [rb] = await q<{ status: string }>(m.sql`SELECT status FROM podcast_crawl_runs WHERE id = ${b.id}::uuid`)
      expect(rb.status).toBe("queued") // nothing ran
      // The weekly sync SKIPS a channel that is being crawled (no second job).
      const { startIncrementalCrawl } = await import("@/lib/podcast-universe/jobs")
      const weekly = await startIncrementalCrawl(channelId)
      expect(weekly).toEqual({ ok: false, error: "يوجد زحف قيد التشغيل لهذه القناة — تم التخطي" })
    } finally {
      await m.db!.execute(m.sql`DELETE FROM jobs WHERE id = ${job.id}`)
    }
    // Run A's job is gone → A is stale; B takes the channel over.
    const out = await m.crawl.runCrawl(b.id, { client: fakeClient() as never })
    expect(out.status).toBe("succeeded")
    const [ra] = await q<{ status: string; error_summary: string }>(m.sql`SELECT status, error_summary FROM podcast_crawl_runs WHERE id = ${a.id}::uuid`)
    expect(ra.status).toBe("partial")
    expect(ra.error_summary).toContain("stale")
  })

  it("the quota ledger refuses the unit that would cross the daily cap", async () => {
    const day = new Date("2001-01-01T20:00:00Z")
    expect(await m.quota.reserveQuota("search", 19, day)).toBe(19)
    expect(await m.quota.reserveQuota("search", 1, day)).toBe(20)
    await expect(m.quota.reserveQuota("search", 1, day)).rejects.toBeInstanceOf(m.quota.PodcastQuotaExhaustedError)
    const [row] = await q<{ units: number }>(m.sql`SELECT units FROM podcast_quota_usage WHERE quota_day = '2001-01-01' AND kind = 'search'`)
    expect(Number(row.units)).toBe(20)
  })

  describe("guest extraction", () => {
    const fakePricing = async () => ({ model: "fake-luna", pricing: { inputCostPer1M: 0.2, outputCostPer1M: 1.2 } })
    const noEnqueue = { enqueueNext: vi.fn(async () => {}), enqueueResolve: vi.fn(async () => {}) }

    async function seedEpisodes() {
      // Make the three long-form rows look like a real guest/hallucination/no-guest trio.
      const eps = await q<{ id: string; youtube_video_id: string }>(m.sql`
        SELECT id, youtube_video_id FROM podcast_episodes
        WHERE channel_id = ${channelId}::uuid AND duration_class = 'core_longform' ORDER BY youtube_video_id`)
      expect(eps).toHaveLength(3)
      const texts = [
        [`${TAG} حلقة مع رائد الأعمال الكويتي ${TAG}سالم ناصر العتيبي`, "وصف"],
        [`${TAG} قصة نجاح`, "حلقة عن ريادة الأعمال"],
        [`${TAG} المقدم يتحدث وحده`, "حلقة فردية"],
      ]
      for (let i = 0; i < 3; i++) {
        await m.db!.execute(m.sql`UPDATE podcast_episodes SET title = ${texts[i][0]}, description = ${texts[i][1]},
          guest_extraction_status = 'pending', guest_extraction_note = NULL WHERE id = ${eps[i].id}::uuid`)
      }
      return eps.map((e) => e.id)
    }

    it("hard budget stop: refuses the call, leaves every episode pending, nothing skipped", async () => {
      const ids = await seedEpisodes()
      const { runId } = await m.run.createExtractionRun(0.0001)
      runIds.push(runId)
      const runAi = vi.fn()
      const out = await m.run.runExtractionBatch(runId, 1, { attempt: 1, maxAttempts: 2 }, {
        runAi: runAi as never,
        resolvePricing: fakePricing,
        scopeChannelIds: [channelId],
        ...noEnqueue,
      })
      expect(out.status).toBe("budget_stopped")
      expect(runAi).not.toHaveBeenCalled()
      const st = await q<{ guest_extraction_status: string }>(m.sql`SELECT guest_extraction_status FROM podcast_episodes WHERE id IN (${m.sql.join(ids.map((i) => m.sql`${i}::uuid`), m.sql`, `)})`)
      expect(st.every((s) => s.guest_extraction_status === "pending")).toBe(true)
      const [r] = await q<{ status: string; ai_cost_usd: string }>(m.sql`SELECT status, ai_cost_usd FROM podcast_crawl_runs WHERE id = ${runId}::uuid`)
      expect(r.status).toBe("budget_stopped")
      expect(Number(r.ai_cost_usd)).toBe(0)
    })

    it("persists only evidenced guests; a hallucination fails with its reason; re-running adds nothing", async () => {
      const ids = await seedEpisodes()
      const name = `${TAG}سالم ناصر العتيبي`
      const runAi = vi.fn(async () => ({
        runId: `${TAG}-airun`,
        status: "succeeded",
        rawText: "{}",
        parsed: {
          episodes: [
            {
              episode_id: ids[0],
              content_kind: "guest_interview",
              topic_hint: "x",
              guests: [
                {
                  display_name: name,
                  role_text: "رائد أعمال",
                  is_primary_guest: true,
                  evidence_field: "title",
                  evidence_text: `رائد الأعمال الكويتي ${name}`,
                  nationality_claim: { country_code: "KW", evidence_text: `رائد الأعمال الكويتي ${name}` },
                  gender_signal: "male",
                  gender_evidence_text: "رائد الأعمال الكويتي",
                  confidence: 0.95,
                },
              ],
            },
            {
              episode_id: ids[1],
              content_kind: "guest_interview",
              topic_hint: null,
              guests: [{ display_name: "عبدالله الهاجري", evidence_text: "مع الضيف عبدالله الهاجري", confidence: 0.9 }],
            },
            { episode_id: ids[2], content_kind: "solo_host", topic_hint: null, guests: [] },
          ],
        },
        provider: "openai",
        modelName: "fake-luna",
        latencyMs: 1,
        tokensIn: 100,
        tokensOut: 100,
        costUsd: 0.0012,
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
        jsonRepairStage: null,
      }))
      const { runId } = await m.run.createExtractionRun(3)
      runIds.push(runId)
      const out = await m.run.runExtractionBatch(runId, 1, { attempt: 1, maxAttempts: 2 }, {
        runAi: runAi as never,
        resolvePricing: fakePricing,
        scopeChannelIds: [channelId],
        ...noEnqueue,
      })
      expect(out).toMatchObject({ status: "processed", episodes: 3, guests: 1 })
      const st = await q<{ id: string; guest_extraction_status: string; guest_extraction_note: string | null; content_kind: string }>(
        m.sql`SELECT id, guest_extraction_status, guest_extraction_note, content_kind FROM podcast_episodes WHERE id IN (${m.sql.join(ids.map((i) => m.sql`${i}::uuid`), m.sql`, `)})`,
      )
      const by = Object.fromEntries(st.map((s) => [s.id, s]))
      expect(by[ids[0]].guest_extraction_status).toBe("succeeded")
      // The batch had a validation issue → its guest-less episodes get ONE
      // more pass before no_guest/failed is final (yousef #13).
      expect(by[ids[1]].guest_extraction_status).toBe("pending")
      expect(by[ids[1]].guest_extraction_note).toBe("recheck_after_batch_validation_issues_once")
      expect(by[ids[2]].guest_extraction_status).toBe("pending")
      // The call carried an explicit output ceiling sized to the batch (rashid #11).
      expect((runAi.mock.calls[0] as unknown as [{ providerOptions: { max_tokens: number } }])[0].providerOptions.max_tokens).toBe(3 * 600 + 2000)

      const apps = await q<{ person_id: string; evidence_text: string }>(m.sql`
        SELECT person_id, evidence_text FROM podcast_guest_appearances WHERE episode_id IN (${m.sql.join(ids.map((i) => m.sql`${i}::uuid`), m.sql`, `)})`)
      expect(apps).toHaveLength(1)
      const [run] = await q<{ ai_cost_usd: string }>(m.sql`SELECT ai_cost_usd FROM podcast_crawl_runs WHERE id = ${runId}::uuid`)
      expect(Number(run.ai_cost_usd)).toBeCloseTo(0.0012, 6)

      // B10: metadata → PROBABLE KW male, never VERIFIED.
      await m.people.resolvePeople([apps[0].person_id])
      const [p] = await q<{ nationality_status: string; nationality_code: string; gender_status: string }>(
        m.sql`SELECT nationality_status, nationality_code, gender_status FROM podcast_people WHERE id = ${apps[0].person_id}::uuid`,
      )
      expect(p).toMatchObject({ nationality_status: "probable", nationality_code: "KW", gender_status: "probable" })

      // The DB itself refuses VERIFIED from metadata (CHECK).
      await expect(
        m.db!.execute(m.sql`UPDATE podcast_people SET nationality_status = 'verified', nationality_basis = 'episode_metadata' WHERE id = ${apps[0].person_id}::uuid`),
      ).rejects.toThrow()

      // Re-attaching the same evidenced guest to the same episode: no new person, no new appearance.
      await m.db!.transaction(async (tx) => {
        const a = await m.people.attachGuest(tx, {
          episodeId: ids[0],
          channelId,
          guest: {
            display_name: name,
            role_text: "رائد أعمال",
            is_primary_guest: true,
            evidence_field: "title",
            evidence_text: `رائد الأعمال الكويتي ${name}`,
            nationality_claim_code: null,
            nationality_claim_text: null,
            gender_signal: "unknown",
            gender_evidence_text: null,
            confidence: 0.5,
          },
          topicHint: null,
          aiRunId: `${TAG}-airun-new`,
          actor: "vitest",
        })
        expect(a.rule).toBe("already_attached")
      })
      // Provenance REPLACED by the re-confirming run — including dropping the
      // KW / male claims the new run did not validate (2026-10-03).
      const [prov] = await q<{ ai_run_id: string; nationality_claim_code: string | null; gender_signal: string; extraction_confidence: string }>(
        m.sql`SELECT ai_run_id, nationality_claim_code, gender_signal, extraction_confidence FROM podcast_guest_appearances WHERE episode_id = ${ids[0]}::uuid`,
      )
      expect(prov).toMatchObject({ ai_run_id: `${TAG}-airun-new`, nationality_claim_code: null, gender_signal: "unknown" })
      expect(Number(prov.extraction_confidence)).toBe(0.5)
      // Second pass over the two re-offered episodes: now final.
      const second = await m.run.runExtractionBatch(runId, 2, { attempt: 1, maxAttempts: 2 }, {
        runAi: runAi as never,
        resolvePricing: fakePricing,
        scopeChannelIds: [channelId],
        ...noEnqueue,
      })
      expect(second).toMatchObject({ status: "processed", episodes: 2 })
      const fin = Object.fromEntries(
        (await q<{ id: string; guest_extraction_status: string; guest_extraction_note: string | null }>(
          m.sql`SELECT id, guest_extraction_status, guest_extraction_note FROM podcast_episodes WHERE id IN (${m.sql.join(ids.map((i) => m.sql`${i}::uuid`), m.sql`, `)})`,
        )).map((r) => [r.id, r]),
      )
      expect(fin[ids[1]].guest_extraction_status).toBe("failed")
      expect(fin[ids[1]].guest_extraction_note).toContain("not an exact substring")
      expect(fin[ids[2]].guest_extraction_status).toBe("no_guest")
      const again = await m.run.runExtractionBatch(runId, 3, { attempt: 1, maxAttempts: 2 }, {
        runAi: runAi as never,
        resolvePricing: fakePricing,
        scopeChannelIds: [channelId],
        ...noEnqueue,
      })
      expect(again.status).toBe("done")
      expect(runAi).toHaveBeenCalledTimes(2)
      const apps2 = await q(m.sql`SELECT 1 FROM podcast_guest_appearances WHERE episode_id IN (${m.sql.join(ids.map((i) => m.sql`${i}::uuid`), m.sql`, `)})`)
      expect(apps2).toHaveLength(1)
    })

    it("a schema failure at 40 falls back to a batch of 20 and re-offers the same episodes", async () => {
      const ids = await seedEpisodes()
      const { runId } = await m.run.createExtractionRun(3)
      runIds.push(runId)
      const runAi = vi.fn(async () => ({
        runId: `${TAG}-airun2`, status: "succeeded", rawText: "nonsense", parsed: { not: "the contract" },
        provider: "openai", modelName: "fake", latencyMs: 1, tokensIn: 1, tokensOut: 1, costUsd: 0.0001,
        errorClass: null, errorMessage: null, retryCount: 0, jsonRepairStage: null,
      }))
      const out = await m.run.runExtractionBatch(runId, 1, { attempt: 1, maxAttempts: 2 }, {
        runAi: runAi as never, resolvePricing: fakePricing, scopeChannelIds: [channelId], ...noEnqueue,
      })
      expect(out).toEqual({ status: "retry_smaller_batch", batchSize: 20 })
      const st = await q<{ guest_extraction_status: string }>(m.sql`SELECT guest_extraction_status FROM podcast_episodes WHERE id IN (${m.sql.join(ids.map((i) => m.sql`${i}::uuid`), m.sql`, `)})`)
      expect(st.every((s) => s.guest_extraction_status === "pending")).toBe(true)
      // Second schema failure at 20 → explicit failure, not silent pending.
      const out2 = await m.run.runExtractionBatch(runId, 2, { attempt: 1, maxAttempts: 2 }, {
        runAi: runAi as never, resolvePricing: fakePricing, scopeChannelIds: [channelId], ...noEnqueue,
      })
      expect(out2.status).toBe("processed")
      const st2 = await q<{ guest_extraction_status: string; guest_extraction_note: string }>(m.sql`SELECT guest_extraction_status, guest_extraction_note FROM podcast_episodes WHERE id IN (${m.sql.join(ids.map((i) => m.sql`${i}::uuid`), m.sql`, `)})`)
      expect(st2.every((s) => s.guest_extraction_status === "failed" && s.guest_extraction_note.includes("schema_failure"))).toBe(true)
      await m.db!.execute(m.sql`UPDATE podcast_crawl_runs SET status = 'succeeded' WHERE id = ${runId}::uuid`)
    })

    const aiResult = (over: Record<string, unknown>) => ({
      runId: `${TAG}-airun-x`, status: "succeeded", rawText: "{}", parsed: null,
      provider: "openai", modelName: "fake", latencyMs: 1, tokensIn: 1, tokensOut: 1, costUsd: 0.0001,
      errorClass: null, errorMessage: null, retryCount: 0, jsonRepairStage: null, ...over,
    })
    async function freshRun() {
      const { runId } = await m.run.createExtractionRun(3)
      runIds.push(runId)
      return runId
    }
    const closeRun = (runId: string) => m.db!.execute(m.sql`UPDATE podcast_crawl_runs SET status = 'succeeded' WHERE id = ${runId}::uuid`)
    const statuses = async (ids: string[]) =>
      (await q<{ guest_extraction_status: string; guest_extraction_note: string | null }>(
        m.sql`SELECT guest_extraction_status, guest_extraction_note FROM podcast_episodes WHERE id IN (${m.sql.join(ids.map((i) => m.sql`${i}::uuid`), m.sql`, `)})`,
      ))

    it("a truncation-repaired reply is a SIZE failure: back to pending at 20, never no_guest (rashid #9)", async () => {
      const ids = await seedEpisodes()
      const runId = await freshRun()
      const runAi = vi.fn(async () =>
        aiResult({ jsonRepairStage: "truncation_repair", parsed: { episodes: ids.map((id) => ({ episode_id: id, content_kind: "solo_host", guests: [] })) } }),
      )
      const out = await m.run.runExtractionBatch(runId, 1, { attempt: 1, maxAttempts: 2 }, {
        runAi: runAi as never, resolvePricing: fakePricing, scopeChannelIds: [channelId], ...noEnqueue,
      })
      expect(out).toEqual({ status: "retry_smaller_batch", batchSize: 20 })
      expect((await statuses(ids)).every((s) => s.guest_extraction_status === "pending")).toBe(true)
      await closeRun(runId)
    })

    it("a timeout at batch size 40 falls back to 20 (rashid #10)", async () => {
      const ids = await seedEpisodes()
      const runId = await freshRun()
      const runAi = vi.fn(async () => aiResult({ status: "failed", errorClass: "timeout", errorMessage: "Provider timeout" }))
      const out = await m.run.runExtractionBatch(runId, 1, { attempt: 1, maxAttempts: 2 }, {
        runAi: runAi as never, resolvePricing: fakePricing, scopeChannelIds: [channelId], ...noEnqueue,
      })
      expect(out).toEqual({ status: "retry_smaller_batch", batchSize: 20 })
      expect((await statuses(ids)).every((s) => s.guest_extraction_status === "pending")).toBe(true)
      await closeRun(runId)
    })

    it("an AI error after the last attempt → failed with the reason (not pending, not no_guest)", async () => {
      const ids = await seedEpisodes()
      const runId = await freshRun()
      await m.db!.execute(m.sql`UPDATE podcast_crawl_runs SET cursor_state = jsonb_set(cursor_state, '{batch_size}', '20') WHERE id = ${runId}::uuid`)
      const runAi = vi.fn(async () => aiResult({ status: "failed", errorClass: "server_error", errorMessage: "502 bad gateway" }))
      const out = await m.run.runExtractionBatch(runId, 1, { attempt: 2, maxAttempts: 2 }, {
        runAi: runAi as never, resolvePricing: fakePricing, scopeChannelIds: [channelId], ...noEnqueue,
      })
      expect(out).toMatchObject({ status: "processed", failed: 3 })
      const st = await statuses(ids)
      expect(st.every((s) => s.guest_extraction_status === "failed" && (s.guest_extraction_note ?? "").includes("ai_error server_error"))).toBe(true)
      await closeRun(runId)
    })

    it("the identity audit trail is RESTRICT, not CASCADE (yousef #14)", async () => {
      const [p] = await q<{ id: string }>(m.sql`
        INSERT INTO podcast_people (canonical_name, normalized_name_key) VALUES (${TAG + "-fk"}, ${TAG + "-fk"}) RETURNING id`)
      await m.db!.execute(m.sql`INSERT INTO podcast_person_events (person_id, action, actor_id) VALUES (${p.id}::uuid, 'test', 'vitest')`)
      await expect(m.db!.execute(m.sql`DELETE FROM podcast_people WHERE id = ${p.id}::uuid`)).rejects.toThrow()
      const ev = await q(m.sql`SELECT 1 FROM podcast_person_events WHERE person_id = ${p.id}::uuid`)
      expect(ev).toHaveLength(1)
    })

    it("two concurrent starts create ONE active run (yousef #12)", async () => {
      const all = await Promise.all(Array.from({ length: 8 }, () => m.run.createExtractionRun(3)))
      runIds.push(...all.map((r) => r.runId))
      expect(new Set(all.map((r) => r.runId)).size).toBe(1)
      expect(all.filter((r) => !r.reused)).toHaveLength(1)
      // The guarantee lives in the DB, not in the read-then-write: a second
      // active guest_extract row is refused outright.
      await expect(
        m.db!.execute(m.sql`INSERT INTO podcast_crawl_runs (run_type, status) VALUES ('guest_extract', 'queued')`),
      ).rejects.toThrow()
      await closeRun(all[0].runId)
    })

    it("a 429 / no-credits call books 0; the reservation exists only DURING the call (2026-10-03)", async () => {
      const ids = await seedEpisodes()
      const runId = await freshRun()
      await m.db!.execute(m.sql`UPDATE podcast_crawl_runs SET cursor_state = jsonb_set(cursor_state, '{batch_size}', '20') WHERE id = ${runId}::uuid`)
      let reservedDuringCall = -1
      const runAi = vi.fn(async (req: { taskKind: string; preferredModel?: string }) => {
        const [r] = await q<{ reserved_usd: string }>(m.sql`SELECT reserved_usd FROM podcast_crawl_runs WHERE id = ${runId}::uuid`)
        reservedDuringCall = Number(r.reserved_usd)
        expect(req.taskKind).toBe("podcast_guest_extract")
        expect(req.preferredModel).toBe("gpt-5.6-luna")
        return aiResult({ status: "failed", errorClass: "quota_exceeded", errorMessage: "insufficient_quota", costUsd: null, tokensIn: null, tokensOut: null })
      })
      const out = await m.run.runExtractionBatch(runId, 1, { attempt: 1, maxAttempts: 2 }, {
        runAi: runAi as never, resolvePricing: fakePricing, scopeChannelIds: [channelId], ...noEnqueue,
      })
      expect(out.status).toBe("failed")
      expect(reservedDuringCall).toBeGreaterThan(0)
      const [r] = await q<{ ai_cost_usd: string; reserved_usd: string }>(m.sql`SELECT ai_cost_usd, reserved_usd FROM podcast_crawl_runs WHERE id = ${runId}::uuid`)
      expect(Number(r.ai_cost_usd)).toBe(0)
      expect(Number(r.reserved_usd)).toBe(0)
      expect((await statuses(ids)).every((s) => s.guest_extraction_status === "pending")).toBe(true)
    })

    it("the $3 cap is TOTAL across runs: a new run inherits earlier spend and is refused (noura #2)", async () => {
      const ids = await seedEpisodes()
      // An earlier, finished run that already spent almost the whole cap.
      const [old] = await q<{ id: string }>(m.sql`
        INSERT INTO podcast_crawl_runs (run_type, status, ai_cost_usd, budget_limit_usd)
        VALUES ('guest_extract', 'budget_stopped', 2.999, 3) RETURNING id`)
      runIds.push(old.id)
      const { startGuestExtraction } = await import("@/lib/podcast-universe/jobs")
      // 2.999 < 3, so start is allowed to try — but the batch gate counts the total.
      const runId = await freshRun()
      const runAi = vi.fn()
      const out = await m.run.runExtractionBatch(runId, 1, { attempt: 1, maxAttempts: 2 }, {
        runAi: runAi as never, resolvePricing: fakePricing, scopeChannelIds: [channelId], ...noEnqueue,
      })
      expect(out.status).toBe("budget_stopped")
      expect(runAi).not.toHaveBeenCalled()
      expect((await statuses(ids)).every((s) => s.guest_extraction_status === "pending")).toBe(true)
      // Once the total reaches the cap, nothing new may start at all.
      await m.db!.execute(m.sql`UPDATE podcast_crawl_runs SET ai_cost_usd = 3 WHERE id = ${old.id}::uuid`)
      const refused = await startGuestExtraction(3)
      expect(refused.ok).toBe(false)
    })
  })
})
