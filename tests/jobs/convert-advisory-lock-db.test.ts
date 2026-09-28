/**
 * «تحويل لإعداد» racing itself on a candidate that has NO EIR yet — against
 * the REAL local database and the REAL EIR helpers.
 *
 * The bug: `ensureEirForCandidate` ran BEFORE the conversion's lock, so two
 * concurrent converts of a candidate without an EIR each created one — the
 * loser's stayed behind as an orphan `approved` EIR. The fix runs the EIR
 * creation, the approved walk, the prep insert and the back-link under one
 * candidate-scoped advisory lock (withCandidateConvertLock). This file uses
 * the real ensureEirForCandidate + walkEirToPhase (job-queue-db.test.ts mocks
 * them), so "one EIR" is counted in the table, not in a mock.
 *
 * Mocked: the pipeline (hangs — never awaited), the learning-layer writes to
 * shared pattern/feedback tables. No worker runs; the one queued job stays
 * pending and is deleted with every other [TEST] row in afterAll.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { Pool } from "pg"
import { loadEnvFiles } from "@/lib/env-file"

loadEnvFiles()
process.env.DB_POOL_MAX = "8"

const HAS_DB = Boolean(process.env.DATABASE_URL)
const d = HAS_DB ? describe : describe.skip

const TAG = `vitest-cvlock-${Date.now()}`
const SEASON = `${TAG}-season`
const GUEST = `${TAG}-guest`
const CAND = `${TAG}-cand`
const ADMIN = "11111111-1111-1111-1111-111111111111"

const { HANG } = vi.hoisted(() => ({ HANG: () => new Promise<never>(() => {}) }))
vi.mock("@/lib/preparation/v2/pipeline", () => ({ runPrepV2Pipeline: vi.fn(HANG) }))
vi.mock("@/lib/khat-map/core/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/khat-map/core/queries")>()),
  logFeedback: vi.fn(async () => {}),
  bumpAcceptedPattern: vi.fn(async () => {}),
  getTopicByAngleCode: vi.fn(async () => null),
  markTopicUsed: vi.fn(async () => {}),
}))

let pool: Pool
const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows

d("convert — the advisory lock keeps EIR creation single (real DB, real EIR helpers)", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    await q(`insert into khat_map_seasons (id, name, created_by) values ($1, $2, $3)`, [SEASON, `[TEST] ${TAG}`, ADMIN])
    await q(`insert into khat_map_guest_candidates (id, season_id, full_name, bio) values ($1, $2, $3, $4)`, [
      GUEST,
      SEASON,
      "[TEST] ضيف",
      "ضيف اختبار",
    ])
    await q(
      `insert into khat_map_episode_candidates
         (id, season_id, working_title, episode_type, status, suggested_guest_candidate_id)
       values ($1, $2, $3, 'intellectual', 'approved', $4)`,
      [CAND, SEASON, `[TEST] ${CAND}`, GUEST],
    )
  })

  afterAll(async () => {
    if (!pool) return
    const eirs = (await q(`select id from episode_intelligence_records where season_id = $1`, [SEASON])).map((r) => r.id)
    const preps = (await q(`select id from episode_preparations where title = $1`, [`[TEST] ${CAND}`])).map((r) => r.id)
    await q(`delete from jobs where dedupe_key = any($1::text[])`, [preps.map((id: string) => `prep_v2:${id}`)])
    await q(`update khat_map_episode_candidates set converted_preparation_id = null, eir_id = null where season_id = $1`, [SEASON])
    if (preps.length) await q(`delete from episode_preparations where id = any($1::text[])`, [preps])
    if (eirs.length) await q(`delete from episode_intelligence_records where id = any($1::text[])`, [eirs])
    // The EIR walk logs transitions to the append-only event log; take ours back out.
    if (eirs.length) await q(`delete from system_events where source = 'eir' and subject_id = any($1::text[])`, [eirs])
    await q(`delete from khat_map_seasons where id = $1`, [SEASON])
    await pool.end()
  })

  it("two parallel converts of a candidate with no EIR → ONE EIR, ONE prep, ONE job", async () => {
    const { convertEpisodeToPreparation } = await import("@/lib/khat-map/conversion/to-preparation")
    const [a, b] = await Promise.all([
      convertEpisodeToPreparation({ episode_candidate_id: CAND, admin_id: ADMIN }),
      convertEpisodeToPreparation({ episode_candidate_id: CAND, admin_id: ADMIN }),
    ])
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) throw new Error("unreachable")

    const eirs = await q(
      `select id, phase from episode_intelligence_records where season_id = $1`,
      [SEASON],
    )
    expect(eirs).toHaveLength(1)
    const [cand] = await q(`select eir_id, converted_preparation_id from khat_map_episode_candidates where id = $1`, [CAND])
    expect(cand.eir_id).toBe(eirs[0].id)

    const preps = await q(`select id, eir_id from episode_preparations where title = $1`, [`[TEST] ${CAND}`])
    expect(preps).toHaveLength(1)
    expect(preps[0].eir_id).toBe(eirs[0].id)
    expect(cand.converted_preparation_id).toBe(preps[0].id)

    const jobs = await q(`select id from jobs where dedupe_key = $1`, [`prep_v2:${preps[0].id}`])
    expect(jobs).toHaveLength(1)
    expect(a.link.target_id).toBe(b.link.target_id)
  })
})
