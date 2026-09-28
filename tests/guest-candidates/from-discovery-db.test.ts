/**
 * Discovery → CRM without duplicates — against the REAL local database.
 *
 * The dedupe is a lookup over existing rows; the db-mock returns queued rows
 * regardless of WHERE, so it could not tell "found the existing record" from
 * "was handed one". This file inserts through the real module and counts rows.
 * Everything it creates is tagged and deleted in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Pool } from "pg"

import { loadEnvFiles } from "@/lib/env-file"
import type { DiscoveryCandidateRecord } from "@/lib/discovery/candidates"

type Mod = typeof import("@/lib/guest-candidates/from-discovery")

const TAG = `vitest-crm-${Date.now()}`
// Spelled two ways on purpose — hamza/taa-marbuta differ, the folded key must not.
const NAME_A = `نايف أحمد المطوّع ${TAG}`
const NAME_B = `نايف احمد المطوع ${TAG}`
const QID = `Q-${TAG}`
const EIR = `eir-${TAG}`

let m: Mod
let pool: Pool
let hasDb = false

function rec(over: Partial<DiscoveryCandidateRecord> & { v2?: Record<string, unknown> } = {}): DiscoveryCandidateRecord {
  const { v2, ...rest } = over
  return {
    id: `dc-${TAG}`,
    discovery_run_id: null,
    target_episode_candidate_id: null,
    proposed_name: NAME_A,
    proposed_role: "رائد أعمال",
    proposed_country: "الكويت",
    archetype: null,
    evidence_urls: [{ platform: "story", url: `https://example.com/${TAG}/1`, title: "t", snippet: null, fetched_at: "" }],
    evidence_summary: null,
    platform_signals: { v2: { why: "سبب الترشيح", ...(v2 ?? {}) } } as never,
    story_signals: null,
    general_rationale: null,
    topic_fit_rationale: null,
    social_links: null,
    editorial_fit_score: null,
    hiddenness_score: null,
    novelty_score: null,
    evidence_strength_score: null,
    topic_fit_score: null,
    composite_score: null,
    status: "proposed",
    promoted_guest_id: null,
    rejection_reason: null,
    created_at: "",
    updated_at: "",
    pipeline_version: null,
    display_name: null,
    full_name_normalized: null,
    person_class_signals: null,
    identity_confidence: null,
    attribute_confidences: null,
    evidence_bundle: null,
    hidden_gem_score: null,
    recommendation_score: null,
    dropped_reason: null,
    ...rest,
  } as DiscoveryCandidateRecord
}

const countTagged = async () =>
  Number((await pool.query("select count(*) from guest_candidates where full_name like $1", [`%${TAG}%`])).rows[0].count)

beforeAll(async () => {
  loadEnvFiles()
  if (!process.env.DATABASE_URL) {
    console.warn("[from-discovery-db] DATABASE_URL unset — skipping real-DB assertions")
    return
  }
  hasDb = true
  m = await import("@/lib/guest-candidates/from-discovery")
  pool = new Pool({ connectionString: process.env.DATABASE_URL })
})

afterAll(async () => {
  if (!hasDb) return
  await pool.query("delete from guest_candidates where full_name like $1", [`%${TAG}%`])
  await pool.end()
})

describe("upsertCrmCandidateFromDiscovery", () => {
  it("first time creates; the same person again (respelled) UPDATES — one row, now linked to the episode", async () => {
    if (!hasDb) return
    const first = await m.upsertCrmCandidateFromDiscovery(rec(), { actorId: "vitest" })
    expect(first.created).toBe(true)
    expect(await countTagged()).toBe(1)

    const second = await m.upsertCrmCandidateFromDiscovery(rec({ proposed_name: NAME_B }), {
      actorId: "vitest",
      eirId: EIR,
    })
    expect(second.created).toBe(false)
    expect(second.candidateId).toBe(first.candidateId)
    expect(await countTagged()).toBe(1)
    const row = (await pool.query("select target_eir_id, full_name from guest_candidates where id = $1", [first.candidateId])).rows[0]
    expect(row.target_eir_id).toBe(EIR)
    expect(row.full_name).toBe(NAME_A) // the team's spelling is not overwritten
  })

  it("a matching confident QID finds the record even under a different name", async () => {
    if (!hasDb) return
    const byName = await m.upsertCrmCandidateFromDiscovery(rec({ v2: { qid: QID } }), { actorId: "vitest" })
    expect(byName.created).toBe(false) // same name as above — and now it carries the QID
    const other = await m.upsertCrmCandidateFromDiscovery(
      rec({ proposed_name: `Naif Almutawa ${TAG}`, v2: { qid: QID } }),
      { actorId: "vitest" },
    )
    expect(other.candidateId).toBe(byName.candidateId)
    expect(await countTagged()).toBe(1)
  })

  it("a person already nominated for ANOTHER episode is not re-pointed — conflict, nothing written", async () => {
    if (!hasDb) return
    const r = await m.upsertCrmCandidateFromDiscovery(rec(), { actorId: "vitest", eirId: `${EIR}-other` })
    expect(r.conflict?.otherEirId).toBe(EIR)
    const row = (await pool.query("select target_eir_id from guest_candidates where id = $1", [r.candidateId])).rows[0]
    expect(row.target_eir_id).toBe(EIR)
    // the SAME episode again is fine (idempotent)
    expect((await m.upsertCrmCandidateFromDiscovery(rec(), { actorId: "vitest", eirId: EIR })).conflict).toBeUndefined()
  })

  it("a namesake with a DIFFERENT confident QID becomes its own record", async () => {
    if (!hasDb) return
    const r = await m.upsertCrmCandidateFromDiscovery(rec({ v2: { qid: `${QID}-other` } }), { actorId: "vitest" })
    expect(r.created).toBe(true)
    expect(await countTagged()).toBe(2)
    await pool.query("delete from guest_candidates where id = $1", [r.candidateId])
  })

  it("a double click cannot create the person twice: the upsert waits on its lock, then finds the row", async () => {
    if (!hasDb) return
    // A plain Promise.all race proved nothing here (the two calls did not
    // overlap reliably, so it passed with the lock removed). Instead: hold the
    // upsert's advisory lock from outside, start an upsert, and prove it
    // WAITS — then release and prove it completes. Look-up + insert both run
    // under that lock, so a second click always sees the first one's row.
    const holder = await pool.connect()
    const name = `متزامن تجريبي ${TAG}`
    try {
      await holder.query("select pg_advisory_lock(hashtext('crm:upsert-from-discovery'))")
      let finished = false
      const pending = m
        .upsertCrmCandidateFromDiscovery(rec({ proposed_name: name }), { actorId: "vitest" })
        .then((r) => {
          finished = true
          return r
        })
      await new Promise((r) => setTimeout(r, 400))
      expect(finished).toBe(false)
      expect(Number((await pool.query("select count(*) from guest_candidates where full_name = $1", [name])).rows[0].count)).toBe(0)
      await holder.query("select pg_advisory_unlock(hashtext('crm:upsert-from-discovery'))")
      const first = await pending
      expect(first.created).toBe(true)
      const again = await m.upsertCrmCandidateFromDiscovery(rec({ proposed_name: name }), { actorId: "vitest" })
      expect(again.candidateId).toBe(first.candidateId)
      await pool.query("delete from guest_candidates where id = $1", [first.candidateId])
    } finally {
      await holder.query("select pg_advisory_unlock_all()")
      holder.release()
    }
  })

  it("sight: a genuinely different person is a new row", async () => {
    if (!hasDb) return
    const r = await m.upsertCrmCandidateFromDiscovery(rec({ proposed_name: `شخص آخر ${TAG}` }), { actorId: "vitest" })
    expect(r.created).toBe(true)
    expect(await countTagged()).toBe(2)
  })
})
