/**
 * The job queue's concurrency claims, against the REAL local database.
 *
 * ── WHY NOT `tests/db-mock.ts` ─────────────────────────────────────────────
 * Every claim here is about what Postgres does under concurrency: a partial
 * unique index turning two INSERTs into one row, a candidate advisory lock
 * making the second conversion wait and see the first one's preparation (and
 * never create a second EIR), `SKIP LOCKED`
 * claims filtered by lane. The mock has no index, no lock and no second
 * connection, so it would pass all of these for code that is broken.
 *
 * ── WHAT IS MOCKED ─────────────────────────────────────────────────────────
 *   • runPrepV2Pipeline — HANGS forever. The conversions must still return in
 *     under a second: they enqueue, they do not await five AI passes.
 *   • the EIR walk + the learning-layer side effects of a conversion (they
 *     write shared tables — patterns, feedback — this test has no business
 *     touching). The candidate lock, the preparation insert, the back-link and
 *     the job row are all real.
 *   • the admin session (vitest is not a request).
 *
 * No worker runs during this file, so every job it creates stays `pending`
 * and costs nothing. Every row it creates is tagged and deleted in afterAll;
 * a claim that ever returns a job this file did not create is put back.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { Pool } from "pg"
import { loadEnvFiles } from "@/lib/env-file"

loadEnvFiles()
// Several concurrent callers need several connections (script mode default: 2).
process.env.DB_POOL_MAX = "8"

const HAS_DB = Boolean(process.env.DATABASE_URL)
const d = HAS_DB ? describe : describe.skip

const TAG = `vitest-jobq-${Date.now()}`
const SEASON = `${TAG}-season`
const GUEST = `${TAG}-guest`
const CAND_A = `${TAG}-cand-a`
const CAND_B = `${TAG}-cand-b`
const CAND_C = `${TAG}-cand-c`
const ADMIN = "11111111-1111-1111-1111-111111111111"
const TOP_PRIORITY = 2_000_000_000

const { HANG } = vi.hoisted(() => ({ HANG: () => new Promise<never>(() => {}) }))

vi.mock("@/lib/preparation/v2/pipeline", () => ({ runPrepV2Pipeline: vi.fn(HANG) }))
vi.mock("@/lib/khat-brain", () => ({
  // A little latency so two racing converts genuinely overlap inside it.
  ensureEirForCandidate: vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 50))
    return { eir: { id: "vitest-jobq-eir" }, created: true }
  }),
  walkEirToPhase: vi.fn(async () => {}),
}))
vi.mock("@/lib/khat-map/core/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/khat-map/core/queries")>()),
  logFeedback: vi.fn(async () => {}),
  bumpAcceptedPattern: vi.fn(async () => {}),
  getTopicByAngleCode: vi.fn(async () => null),
  markTopicUsed: vi.fn(async () => {}),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  requireActionRole: vi.fn(async () => ({ ok: true as const, user: { id: ADMIN } })),
  getAdminAuthUser: vi.fn(async () => ({ id: ADMIN })),
}))

let pool: Pool
let queue: typeof import("@/lib/jobs/queue")
let conversion: typeof import("@/lib/khat-map/conversion/to-preparation")
let bulk: typeof import("@/app/admin/khat-brain/seasons/[seasonId]/bulk-convert-actions")
let runPrepV2Pipeline: ReturnType<typeof vi.fn>
let ensureEir: ReturnType<typeof vi.fn>
const createdJobIds = new Set<string>()

const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows

d("job queue — real Postgres", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    queue = await import("@/lib/jobs/queue")
    conversion = await import("@/lib/khat-map/conversion/to-preparation")
    bulk = await import("@/app/admin/khat-brain/seasons/[seasonId]/bulk-convert-actions")
    runPrepV2Pipeline = vi.mocked((await import("@/lib/preparation/v2/pipeline")).runPrepV2Pipeline)
    ensureEir = vi.mocked((await import("@/lib/khat-brain")).ensureEirForCandidate) as unknown as ReturnType<typeof vi.fn>

    await q(`insert into khat_map_seasons (id, name, created_by) values ($1, $2, $3)`, [
      SEASON,
      `[TEST] ${TAG}`,
      ADMIN,
    ])
    await q(
      `insert into khat_map_guest_candidates (id, season_id, full_name, bio) values ($1, $2, $3, $4)`,
      [GUEST, SEASON, "[TEST] ضيف", "ضيف اختبار"],
    )
    for (const id of [CAND_A, CAND_B, CAND_C]) {
      await q(
        `insert into khat_map_episode_candidates
           (id, season_id, working_title, episode_type, status, suggested_guest_candidate_id)
         values ($1, $2, $3, 'intellectual', 'approved', $4)`,
        [id, SEASON, `[TEST] ${id}`, GUEST],
      )
    }
  })

  afterAll(async () => {
    if (!pool) return
    const preps = await q(`select id from episode_preparations where created_by = $1 and title like '[TEST]%'`, [ADMIN])
    const prepIds = preps.map((r) => r.id as string)
    await q(
      `delete from jobs where dedupe_key like $1 or id = any($2::text[]) or dedupe_key = any($3::text[])`,
      [`${TAG}%`, [...createdJobIds], prepIds.map((id) => `prep_v2:${id}`)],
    )
    // Unlink before deleting the preparations (the FK has no cascade).
    await q(`update khat_map_episode_candidates set converted_preparation_id = null where season_id = $1`, [SEASON])
    if (prepIds.length) await q(`delete from episode_preparations where id = any($1::text[])`, [prepIds])
    await q(`delete from khat_map_seasons where id = $1`, [SEASON]) // cascades guest + candidates
    await pool.end()
  })

  it("six concurrent enqueueJobOnce calls with one key produce ONE row", async () => {
    const key = `${TAG}:dedupe`
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        queue.enqueueJobOnce("demo.echo", { tag: TAG }, { dedupeKey: key, runAfter: new Date(Date.now() + 3_600_000) }),
      ),
    )
    results.forEach((r) => createdJobIds.add(r.job.id))

    const rows = await q(`select id from jobs where dedupe_key = $1`, [key])
    expect(rows).toHaveLength(1)
    expect(new Set(results.map((r) => r.job.id)).size).toBe(1)
    expect(results.filter((r) => !r.alreadyRunning)).toHaveLength(1)
  })

  it("a finished job frees its key: the next enqueue creates a fresh row", async () => {
    const key = `${TAG}:refire`
    const first = await queue.enqueueJobOnce("demo.echo", {}, { dedupeKey: key, runAfter: new Date(Date.now() + 3_600_000) })
    createdJobIds.add(first.job.id)
    await q(`update jobs set status = 'succeeded' where id = $1`, [first.job.id])
    const second = await queue.enqueueJobOnce("demo.echo", {}, { dedupeKey: key, runAfter: new Date(Date.now() + 3_600_000) })
    createdJobIds.add(second.job.id)
    expect(second.alreadyRunning).toBe(false)
    expect(second.job.id).not.toBe(first.job.id)
  })

  it("a heavy job running does not block an interactive claim — and lanes never cross", async () => {
    const heavy = await queue.enqueueJobOnce("studio.transcribe", { tag: TAG }, {
      dedupeKey: `${TAG}:heavy`,
      priority: TOP_PRIORITY,
    })
    const interactive = await queue.enqueueJobOnce("prep.generate_v2", { tag: TAG }, {
      dedupeKey: `${TAG}:interactive`,
      priority: TOP_PRIORITY,
    })
    createdJobIds.add(heavy.job.id)
    createdJobIds.add(interactive.job.id)

    const putBack = async (claimed: { id: string } | null) => {
      if (claimed && !createdJobIds.has(claimed.id)) {
        await q(
          `update jobs set status = 'pending', locked_by = null, locked_at = null, attempts = attempts - 1 where id = $1`,
          [claimed.id],
        )
      }
    }

    // The heavy lane takes the transcription and it is now RUNNING…
    const h = await queue.claimNextJob(`${TAG}-worker`, "heavy")
    await putBack(h)
    expect(h?.id).toBe(heavy.job.id)
    // …and the interactive lane still gets the prep job at once.
    const i = await queue.claimNextJob(`${TAG}-worker`, "interactive")
    await putBack(i)
    expect(i?.id).toBe(interactive.job.id)

    // Lanes never cross: with only a heavy job pending, interactive claims none of ours.
    const heavy2 = await queue.enqueueJobOnce("studio.transcribe", { tag: TAG }, {
      dedupeKey: `${TAG}:heavy2`,
      priority: TOP_PRIORITY,
    })
    createdJobIds.add(heavy2.job.id)
    const none = await queue.claimNextJob(`${TAG}-worker`, "interactive")
    await putBack(none)
    expect(none?.id).not.toBe(heavy2.job.id)
  })

  it("an orphaned run is re-queued once, then dead-lettered — and its key is freed", async () => {
    const key = `${TAG}:orphan`
    const q1 = await queue.enqueueJobOnce("prep.generate_v2", { tag: TAG }, {
      dedupeKey: key,
      maxAttempts: 1,
      runAfter: new Date(Date.now() + 3_600_000),
    })
    createdJobIds.add(q1.job.id)
    // Claimed once, then its worker died: lease 3 min old.
    await q(
      `update jobs set status='running', attempts=1, locked_by=$2, locked_at=now() - interval '3 minutes' where id=$1`,
      [q1.job.id, `${TAG}-dead-worker`],
    )
    const first = await queue.reclaimStaleJobs(120_000)
    expect(first.find((r) => r.id === q1.job.id)?.outcome).toBe("pending")
    const [afterFirst] = await q(`select status, error_message from jobs where id=$1`, [q1.job.id])
    expect(afterFirst.status).toBe("pending")
    expect(afterFirst.error_message).toMatch(/أُعيدت إلى الطابور/)

    // Its one re-run is orphaned too.
    await q(
      `update jobs set status='running', attempts=2, locked_by=$2, locked_at=now() - interval '3 minutes' where id=$1`,
      [q1.job.id, `${TAG}-dead-worker-2`],
    )
    const second = await queue.reclaimStaleJobs(120_000)
    expect(second.find((r) => r.id === q1.job.id)?.outcome).toBe("dead")
    const [afterSecond] = await q(`select status, error_message from jobs where id=$1`, [q1.job.id])
    expect(afterSecond.status).toBe("dead")
    expect(afterSecond.error_message).toContain("«أعد المحاولة»")

    // Dead frees the dedupe key → «أعد المحاولة» can enqueue a fresh run.
    const again = await queue.enqueueJobOnce("prep.generate_v2", { tag: TAG }, {
      dedupeKey: key,
      runAfter: new Date(Date.now() + 3_600_000),
    })
    createdJobIds.add(again.job.id)
    expect(again.alreadyRunning).toBe(false)
  })

  it("boot path: a proven-dead worker's jobs are reclaimed at once; a fresh live one is untouched", async () => {
    const dead = await queue.enqueueJobOnce("prep.generate_v2", { tag: TAG }, { dedupeKey: `${TAG}:boot-dead`, runAfter: new Date(Date.now() + 3_600_000) })
    const live = await queue.enqueueJobOnce("prep.generate_v2", { tag: TAG }, { dedupeKey: `${TAG}:boot-live`, runAfter: new Date(Date.now() + 3_600_000) })
    createdJobIds.add(dead.job.id)
    createdJobIds.add(live.job.id)
    await q(`update jobs set status='running', attempts=1, locked_by=$2, locked_at=now() where id=$1`, [dead.job.id, `${TAG}-w-dead`])
    await q(`update jobs set status='running', attempts=1, locked_by=$2, locked_at=now() where id=$1`, [live.job.id, `${TAG}-w-live`])

    const rows = await queue.reclaimStaleJobs(0, { lockedBy: `${TAG}-w-dead` })
    expect(rows.map((r) => r.id)).toEqual([dead.job.id])
    const status = await q(`select id, status from jobs where id = any($1::text[])`, [[dead.job.id, live.job.id]])
    expect(Object.fromEntries(status.map((r) => [r.id, r.status]))).toEqual({
      [dead.job.id]: "pending",
      [live.job.id]: "running",
    })
    // The live worker renews; a renewal from someone else is fenced out.
    await queue.renewJobLease(live.job.id, 1, `${TAG}-someone-else`)
    await queue.renewJobLease(live.job.id, 1, `${TAG}-w-live`)
    await q(`update jobs set status='succeeded' where id = any($1::text[])`, [[dead.job.id, live.job.id]])
  })

  it("two parallel converts of one topic → ONE preparation, ONE job, both in < 1s", async () => {
    const started = performance.now()
    const [a, b] = await Promise.all([
      conversion.convertEpisodeToPreparation({ episode_candidate_id: CAND_A, admin_id: ADMIN }),
      conversion.convertEpisodeToPreparation({ episode_candidate_id: CAND_A, admin_id: ADMIN }),
    ])
    expect(performance.now() - started).toBeLessThan(1000)
    // The pipeline hangs forever; returning at all proves it was not awaited.
    expect(runPrepV2Pipeline).not.toHaveBeenCalled()
    // ONE EIR: the losing caller must never reach ensureEirForCandidate (it
    // ran before the lock once, and left orphan `approved` EIRs behind).
    expect(ensureEir.mock.calls.filter((c) => c[0].candidate.id === CAND_A)).toHaveLength(1)

    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) throw new Error("unreachable")
    expect(a.link.target_id).toBe(b.link.target_id)
    expect([a.was_existing, b.was_existing].sort()).toEqual([false, true])

    const preps = await q(
      `select id from episode_preparations where title = $1 and created_by = $2`,
      [`[TEST] ${CAND_A}`, ADMIN],
    )
    expect(preps).toHaveLength(1)
    const jobs = await q(`select id, status, type from jobs where dedupe_key = $1`, [`prep_v2:${preps[0].id}`])
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ status: "pending", type: "prep.generate_v2" })
    // The losing caller attaches to the SAME job — it can watch it too.
    expect(a.job?.id).toBe(jobs[0].id)
    expect(b.job?.id).toBe(jobs[0].id)
  })

  it("bulk convert returns in < 1s with one queued job per card", async () => {
    const started = performance.now()
    const r = await bulk.bulkConvertApprovedAction(SEASON)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(runPrepV2Pipeline).not.toHaveBeenCalled()

    const converted = r.per_card.filter((c) => c.status === "converted")
    expect(converted.map((c) => c.candidate_id).sort()).toEqual([CAND_B, CAND_C].sort())
    for (const c of converted) {
      expect(c.job_id).toBeTruthy()
      const rows = await q(`select type, status, payload from jobs where id = $1`, [c.job_id])
      expect(rows[0]).toMatchObject({ type: "prep.generate_v2", status: "pending" })
      expect(rows[0].payload).toMatchObject({ trigger: "bulk", preparationId: c.preparation_id })
    }
  })
})
