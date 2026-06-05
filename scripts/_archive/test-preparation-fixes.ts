/**
 * Runtime QA harness for the 6 preparation fixes.
 *
 * Exercises the query-layer functions directly against the live DB
 * (DATABASE_URL) so we can verify state transitions without needing
 * an authenticated HTTP session. Each scenario creates its own test
 * row, asserts the expected state, and cleans up.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-preparation-fixes.ts
 */

import {
  createPreparation,
  getPreparationById,
  setGuestIdentity,
  wipeResearchAndDownstream,
  setPreparationSection,
  setLiveTokenHash,
  updateLiveStateByToken,
  clearLiveToken,
  rotateLiveTokenHash,
  updatePreparationStatus,
  writeResearchErrorState,
  isResearchUsable,
  forceSetStatus,
  computeForceStatus,
  deletePreparation,
  getPreparationByLiveToken,
} from "@/lib/preparation/queries"
import { generateLiveToken, hashLiveToken } from "@/lib/preparation/token"
import { checkAdminRateLimit } from "@/lib/rate-limit"
import { PREPARATION_LIMITS } from "@/lib/preparation/rate-limit"
import type {
  PreparationInputs,
  PreparationGuestIdentity,
  PreparationResearch,
} from "@/types/preparation"

const results: Array<{ scenario: string; ok: boolean; detail: string }> = []

function ok(scenario: string, detail: string) {
  results.push({ scenario, ok: true, detail })
  console.log(`  PASS  ${scenario} — ${detail}`)
}
function fail(scenario: string, detail: string) {
  results.push({ scenario, ok: false, detail })
  console.log(`  FAIL  ${scenario} — ${detail}`)
}

const baseInputs: PreparationInputs = {
  title: "QA harness test",
  guest_name: "Test Guest",
  guest_description: "Test description used as research anchor",
  guest_profile_link: null,
  short_description: "short",
  episode_goal: "goal",
  key_questions: ["q1"],
  tone_type: "deep",
  focus_mode: "guest",
  expected_duration_min: 60,
  depth_level: 3,
  boldness_level: 3,
  content_focus: ["ideas"],
}

const baseIdentity: PreparationGuestIdentity = {
  name: "Test Guest",
  description: "canonical identity",
  source_provider: "manual",
  source_url: null,
  source_title: null,
  avatar_url: null,
  profile_link: null,
  confirmed_at: new Date().toISOString(),
  confirmed_by: "qa-harness",
}

/**
 * A fake but structurally valid research payload — enough for
 * isResearchUsable() to return true.
 */
const fakeUsableResearch: PreparationResearch = {
  sources: [
    {
      id: "src_1",
      provider: "manual",
      url: "https://example.com/page1",
      title: "Fake source 1",
      snippet: "snippet",
      published_at: null,
      author: null,
    },
  ],
  claims: [
    {
      id: "c1",
      text: "a claim",
      source_ids: ["src_1"],
      verifier_status: "accepted",
      verifier_note: null,
    },
  ],
  timeline: [],
  stats: { total_sources: 1, accepted_claims: 1, rejected_claims: 0 },
} as unknown as PreparationResearch

const fakeEmptyResearch: PreparationResearch = {
  sources: [],
  claims: [],
  timeline: [],
  stats: { total_sources: 0, accepted_claims: 0, rejected_claims: 0 },
} as unknown as PreparationResearch

async function createTestPrep(suffix: string): Promise<string> {
  const prep = await createPreparation({
    inputs: { ...baseInputs, title: `QA ${suffix}` },
    guest_identity: baseIdentity,
    created_by: "qa-harness",
  })
  return prep.id
}

async function cleanup(ids: string[]) {
  for (const id of ids) {
    try {
      await deletePreparation(id)
    } catch {
      // best effort
    }
  }
}

// ─── Fix 1: identity change wipes research + downstream ─────────────────────
async function testFix1_IdentityWipe() {
  console.log("\n=== Fix 1: identity change wipes research + downstream ===")
  const id = await createTestPrep("fix1")
  try {
    // Seed research and one editorial section.
    await setPreparationSection(id, "research", fakeUsableResearch, {})
    const afterResearch = await getPreparationById(id)
    if (!afterResearch) throw new Error("prep vanished after research seed")
    if (!isResearchUsable(afterResearch)) {
      fail("fix1.setup", "seeded research is not usable — setup broken")
      return id
    }
    await setPreparationSection(
      id,
      "executive_summary",
      { tldr: "x", bullets: ["a"] },
      afterResearch.sections_status,
    )
    const seeded = await getPreparationById(id)
    if (!seeded?.research_data || !seeded?.executive_summary) {
      fail("fix1.setup", "seed failed to land in DB")
      return id
    }

    // Seed an approved status + live token so we can verify those get wiped too.
    await updatePreparationStatus(id, "reviewed")
    await updatePreparationStatus(id, "approved")
    const { hash } = generateLiveToken()
    await setLiveTokenHash(id, hash)
    const preIdentityChange = await getPreparationById(id)
    if (preIdentityChange?.status !== "approved") {
      fail("fix1.setup", "could not reach approved state")
      return id
    }
    if (!preIdentityChange.live_token_hash) {
      fail("fix1.setup", "live token hash missing after setLiveTokenHash")
      return id
    }

    // Perform identity change.
    const newIdentity: PreparationGuestIdentity = {
      ...baseIdentity,
      name: "Different Person",
      description: "a totally different person",
    }
    const afterWipe = await setGuestIdentity(id, newIdentity)
    if (!afterWipe) {
      fail("fix1", "setGuestIdentity returned null")
      return id
    }

    // Assertions
    if (afterWipe.research_data !== null) {
      fail("fix1.research_data", "research_data not wiped")
      return id
    }
    if (afterWipe.executive_summary !== null) {
      fail("fix1.editorial", "executive_summary not wiped")
      return id
    }
    if (Object.keys(afterWipe.sections_status).length !== 0) {
      fail(
        "fix1.sections_status",
        `sections_status not empty: ${JSON.stringify(afterWipe.sections_status)}`,
      )
      return id
    }
    if (afterWipe.status !== "draft") {
      fail("fix1.status", `expected draft, got ${afterWipe.status}`)
      return id
    }
    if (afterWipe.approved_at !== null) {
      fail("fix1.approved_at", "approved_at not cleared")
      return id
    }
    if (afterWipe.live_token_hash !== null) {
      fail("fix1.live_token_hash", "live_token_hash not cleared")
      return id
    }
    if (afterWipe.live_state !== null) {
      fail("fix1.live_state", "live_state not cleared")
      return id
    }
    if (afterWipe.guest_identity?.name !== "Different Person") {
      fail("fix1.identity", "new identity not persisted")
      return id
    }
    // Inputs preserved
    if (afterWipe.guest_description !== baseInputs.guest_description) {
      fail("fix1.preserved", "guest_description was clobbered")
      return id
    }

    ok("fix1", "identity change wiped research+editorial+token, status→draft")
  } catch (err) {
    fail("fix1", err instanceof Error ? err.message : String(err))
  }
  return id
}

// ─── Fix 2b: simulate the PATCH route's description-change flow ─────────────
async function testFix2_PatchRouteFlow() {
  console.log("\n=== Fix 2b: PATCH route description-change simulation ===")
  const { updatePreparationInputs } = await import("@/lib/preparation/queries")
  const id = await createTestPrep("fix2b")
  try {
    // Seed downstream.
    await setPreparationSection(id, "research", fakeUsableResearch, {})
    const afterResearch = await getPreparationById(id)
    if (!afterResearch) throw new Error("prep vanished")
    await setPreparationSection(
      id,
      "executive_summary",
      { tldr: "x", bullets: ["a"] },
      afterResearch.sections_status,
    )

    // === Route path replica ===
    const before = await getPreparationById(id)
    if (!before) throw new Error("prep vanished")
    const body = { guest_description: "A NEW anchor that breaks the old query" }
    await updatePreparationInputs(id, body)
    const descriptionChanged =
      body.guest_description !== undefined &&
      (body.guest_description ?? "").trim() !== (before.guest_description ?? "").trim()
    const hadDownstream =
      before.research_data !== null ||
      before.executive_summary !== null ||
      before.knowledge_bank !== null ||
      before.guest_intelligence !== null ||
      before.conversation_axes !== null ||
      before.episode_flow !== null ||
      before.question_system !== null ||
      before.host_instructions !== null ||
      before.quotes_references !== null ||
      before.viral_moments !== null
    if (!descriptionChanged || !hadDownstream) {
      fail("fix2b.trigger", "route branch would not have fired")
      return id
    }
    const wiped = await wipeResearchAndDownstream(id)
    // === /route path replica ===

    const final = wiped ?? (await getPreparationById(id))
    if (!final) throw new Error("prep vanished post-wipe")
    if (final.research_data !== null || final.executive_summary !== null) {
      fail("fix2b", "downstream not wiped after route-path simulation")
      return id
    }
    if (final.guest_description !== body.guest_description) {
      fail("fix2b.inputs", "new description not persisted")
      return id
    }
    if (final.status !== "draft") {
      fail("fix2b.status", `expected draft, got ${final.status}`)
      return id
    }
    ok("fix2b", "PATCH-route flow wipes downstream, keeps new description, status→draft")
  } catch (err) {
    fail("fix2b", err instanceof Error ? err.message : String(err))
  }
  return id
}

// ─── Fix 2: guest_description change wipes research ─────────────────────────
async function testFix2_DescriptionWipe() {
  console.log("\n=== Fix 2: wipeResearchAndDownstream helper ===")
  const id = await createTestPrep("fix2")
  try {
    // Seed research + editorial + approved + token (same shape as fix1).
    await setPreparationSection(id, "research", fakeUsableResearch, {})
    const afterResearch = await getPreparationById(id)
    if (!afterResearch) throw new Error("prep vanished")
    await setPreparationSection(
      id,
      "executive_summary",
      { tldr: "x", bullets: ["a"] },
      afterResearch.sections_status,
    )
    await updatePreparationStatus(id, "reviewed")
    await updatePreparationStatus(id, "approved")
    const { hash } = generateLiveToken()
    await setLiveTokenHash(id, hash)

    const wiped = await wipeResearchAndDownstream(id)
    if (!wiped) {
      fail("fix2", "wipe returned null")
      return id
    }
    if (
      wiped.research_data !== null ||
      wiped.executive_summary !== null ||
      Object.keys(wiped.sections_status).length !== 0 ||
      wiped.status !== "draft" ||
      wiped.approved_at !== null ||
      wiped.live_token_hash !== null ||
      wiped.live_state !== null
    ) {
      fail(
        "fix2",
        `incomplete wipe: research=${wiped.research_data !== null} exec=${wiped.executive_summary !== null} status=${wiped.status} token=${wiped.live_token_hash !== null}`,
      )
      return id
    }
    // Inputs preserved
    if (wiped.guest_name !== "Test Guest" || wiped.guest_description !== baseInputs.guest_description) {
      fail("fix2.preserved", "inputs were clobbered")
      return id
    }
    ok("fix2", "wipe helper cleared research+editorial+token; inputs preserved")
  } catch (err) {
    fail("fix2", err instanceof Error ? err.message : String(err))
  }
  return id
}

// ─── Fix 3: live state PATCH gated by approved status ───────────────────────
async function testFix3_LiveStateGate() {
  console.log("\n=== Fix 3: updateLiveStateByToken gated by status=approved ===")
  const id = await createTestPrep("fix3")
  try {
    // Approve + mint token so we have a valid live handle.
    await setPreparationSection(id, "research", fakeUsableResearch, {})
    await updatePreparationStatus(id, "reviewed")
    await updatePreparationStatus(id, "approved")
    const { token, hash } = generateLiveToken()
    await setLiveTokenHash(id, hash)

    // 1. PATCH works when approved.
    const first = await updateLiveStateByToken(token, { energy_level: 4 })
    if (!first || first.energy_level !== 4) {
      fail("fix3.approved", "update rejected while approved")
      return id
    }

    // 2. Demote to reviewed (keep the token hash intentionally — this is the
    //    race that fix 3 protects against: token still exists but record is
    //    no longer approved).
    await forceSetStatus(id, "reviewed")
    const demoted = await getPreparationById(id)
    if (demoted?.status !== "reviewed" || !demoted.live_token_hash) {
      fail("fix3.setup", "could not set up demoted-with-token state")
      return id
    }

    const rejected = await updateLiveStateByToken(token, { energy_level: 5 })
    if (rejected !== null) {
      fail(
        "fix3.reviewed",
        "updateLiveStateByToken accepted a write on reviewed preparation",
      )
      return id
    }

    // 3. Also verify the read gate (already in place before fix) still holds.
    const reading = await getPreparationByLiveToken(token)
    if (reading !== null) {
      fail("fix3.read", "getPreparationByLiveToken returned non-null on reviewed")
      return id
    }

    ok("fix3", "live state writes accepted only when status=approved")
  } catch (err) {
    fail("fix3", err instanceof Error ? err.message : String(err))
  }
  return id
}

// ─── Fix 4: clearLiveToken on demotion ──────────────────────────────────────
async function testFix4_DemotionClearsToken() {
  console.log("\n=== Fix 4: clearLiveToken nukes the token cleanly ===")
  const id = await createTestPrep("fix4")
  try {
    await setPreparationSection(id, "research", fakeUsableResearch, {})
    await updatePreparationStatus(id, "reviewed")
    await updatePreparationStatus(id, "approved")
    const { token, hash } = generateLiveToken()
    await setLiveTokenHash(id, hash)

    // Token works while approved.
    const before = await getPreparationByLiveToken(token)
    if (!before) {
      fail("fix4.setup", "live token did not resolve while approved")
      return id
    }

    // Simulate the demotion flow: clearLiveToken then forceSetStatus.
    await clearLiveToken(id)
    await forceSetStatus(id, "researched")

    const after = await getPreparationByLiveToken(token)
    if (after !== null) {
      fail("fix4.read", "token still resolves after clearLiveToken")
      return id
    }
    const writeAttempt = await updateLiveStateByToken(token, { energy_level: 2 })
    if (writeAttempt !== null) {
      fail("fix4.write", "token still accepts writes after clearLiveToken")
      return id
    }
    const prep = await getPreparationById(id)
    if (prep?.live_token_hash !== null || prep?.live_state !== null) {
      fail("fix4.db", "DB row still has token/live_state")
      return id
    }
    ok("fix4", "clearLiveToken fully invalidates token (read + write both dead)")
  } catch (err) {
    fail("fix4", err instanceof Error ? err.message : String(err))
  }
  return id
}

// ─── Fix 5: empty-research atomic write ─────────────────────────────────────
async function testFix5_EmptyResearchAtomic() {
  console.log("\n=== Fix 5: empty research writes error state atomically ===")
  const id = await createTestPrep("fix5")
  try {
    // Simulate the research route's empty-case path directly.
    const prep = await getPreparationById(id)
    if (!prep) throw new Error("prep vanished")

    const afterWrite = await writeResearchErrorState(
      id,
      fakeEmptyResearch,
      "test empty reason",
      prep.sections_status,
    )
    if (!afterWrite) {
      fail("fix5", "writeResearchErrorState returned null")
      return id
    }

    // Research section must be "error", never "ready".
    const resSt = afterWrite.sections_status.research
    if (!resSt || resSt.status !== "error") {
      fail(
        "fix5.section_status",
        `expected research.status=error, got ${JSON.stringify(resSt)}`,
      )
      return id
    }
    if (resSt.error !== "test empty reason") {
      fail("fix5.error", `error message not stored: ${resSt.error}`)
      return id
    }

    // research_data is persisted (so the UI can show what the pipeline saw)
    if (!afterWrite.research_data) {
      fail("fix5.research_data", "research_data not stored")
      return id
    }

    // isResearchUsable must say NO.
    if (isResearchUsable(afterWrite)) {
      fail("fix5.usable", "isResearchUsable returned true for empty research")
      return id
    }

    // And writeResearchErrorState did NOT auto-bump — status stays draft.
    if (afterWrite.status !== "draft") {
      fail("fix5.status", `expected draft, got ${afterWrite.status}`)
      return id
    }

    // After a force recompute capped at researched, we should still land on
    // draft (research is not usable).
    const forced = computeForceStatus(afterWrite, "researched")
    if (forced !== "draft") {
      fail("fix5.computeForce", `computeForceStatus returned ${forced}, expected draft`)
      return id
    }
    ok("fix5", "empty research writes sections_status.research=error in one UPDATE; no false ready state")
  } catch (err) {
    fail("fix5", err instanceof Error ? err.message : String(err))
  }
  return id
}

// ─── Fix 6: SSRF — static check that fetchPageTitle is gone ────────────────
async function testFix6_SSRFRemoved() {
  console.log("\n=== Fix 6: identify.ts has no outbound URL fetch ===")
  const fs = await import("node:fs/promises")
  const path = await import("node:path")
  const file = path.resolve(process.cwd(), "lib/ai/preparation/identify.ts")
  const src = await fs.readFile(file, "utf8")

  // Banned patterns.
  const hasFetchPageTitle = /fetchPageTitle/.test(src)
  const hasFetchOnProfileLink = /fetch\s*\(\s*[^)]*profile_link/i.test(src)
  const hasSsrfComment = /SSRF/i.test(src)

  if (hasFetchPageTitle) {
    fail("fix6", "fetchPageTitle is still referenced in identify.ts")
    return
  }
  if (hasFetchOnProfileLink) {
    fail("fix6", "identify.ts still fetches guest_profile_link")
    return
  }
  if (!hasSsrfComment) {
    fail("fix6", "SSRF note missing; cannot confirm the removal was intentional")
    return
  }

  // Every `fetch(` call must be reachable only via hardcoded hosts. There
  // should be exactly one — the YouTube API — and it must be constructed
  // from the hardcoded googleapis.com base URL.
  const fetchCount = (src.match(/\bfetch\s*\(/g) ?? []).length
  if (fetchCount !== 1) {
    fail("fix6", `expected exactly 1 fetch() call, found ${fetchCount}`)
    return
  }
  if (!/new URL\(\s*"https:\/\/www\.googleapis\.com\/youtube\/v3\/search"/.test(src)) {
    fail("fix6", "YouTube fetch is not anchored to hardcoded googleapis.com URL")
    return
  }
  // The URL object passed to fetch must have been built from the hardcoded
  // base, not from any admin-supplied string.
  const buildsFromProfileLink = /new URL\(\s*[^)]*profile_link/i.test(src)
  if (buildsFromProfileLink) {
    fail("fix6", "identify.ts constructs a URL from profile_link")
    return
  }
  ok("fix6", "no fetch on admin-supplied URL; only outbound call is hardcoded googleapis.com")
}

// ─── Fix 4b: static check — every demotion-capable route calls clearLiveToken ─
async function testFix4_StaticDemotionAudit() {
  console.log("\n=== Fix 4b: every route that can demote calls clearLiveToken ===")
  const fs = await import("node:fs/promises")
  const path = await import("node:path")
  const files = [
    "app/api/admin/preparation/[id]/approve/route.ts",
    "app/api/admin/preparation/[id]/research/route.ts",
    "app/api/admin/preparation/[id]/generate/route.ts",
    "app/api/admin/preparation/[id]/regenerate/route.ts",
  ]
  for (const f of files) {
    const abs = path.resolve(process.cwd(), f)
    const src = await fs.readFile(abs, "utf8")
    if (!/clearLiveToken/.test(src)) {
      fail("fix4.static", `${f} does not import or call clearLiveToken`)
      return
    }
    if (!/clearLiveToken\s*\(/.test(src)) {
      fail("fix4.static", `${f} references clearLiveToken but never calls it`)
      return
    }
  }
  ok(
    "fix4.static",
    "approve, research, generate, regenerate routes all call clearLiveToken",
  )
}

// ─── Rate limit (test G) ────────────────────────────────────────────────────
async function testRateLimit() {
  console.log("\n=== Rate limit: research cap fires at the 11th call ===")
  const action = PREPARATION_LIMITS.research.action + "-QA-HARNESS-" + Date.now()
  const max = PREPARATION_LIMITS.research.max
  const windowMs = PREPARATION_LIMITS.research.windowMs
  const fakeUser = "qa-harness-user-" + Date.now()

  let firstDenied: number | null = null
  for (let i = 1; i <= max + 2; i++) {
    const res = checkAdminRateLimit(fakeUser, action, max, windowMs)
    if (!res.allowed && firstDenied === null) firstDenied = i
  }
  if (firstDenied !== max + 1) {
    fail("rate", `first denial at call ${firstDenied}, expected ${max + 1}`)
    return
  }
  const denied = checkAdminRateLimit(fakeUser, action, max, windowMs)
  if (denied.retryAfterSeconds <= 0) {
    fail("rate", "retryAfterSeconds not positive on a denied call")
    return
  }
  ok(
    "rate",
    `first 10 allowed, call #11 denied with retryAfter=${denied.retryAfterSeconds}s`,
  )
}

// ─── Token rotation (test F) ────────────────────────────────────────────────
async function testTokenRotation() {
  console.log("\n=== Token rotation: old hash replaced atomically ===")
  const id = await createTestPrep("rotate")
  try {
    await setPreparationSection(id, "research", fakeUsableResearch, {})
    await updatePreparationStatus(id, "reviewed")
    await updatePreparationStatus(id, "approved")
    const first = generateLiveToken()
    await setLiveTokenHash(id, first.hash)

    const before = await getPreparationByLiveToken(first.token)
    if (!before) {
      fail("rotate.setup", "first token did not resolve")
      return id
    }

    const second = generateLiveToken()
    await rotateLiveTokenHash(id, second.hash)

    const oldStillWorks = await getPreparationByLiveToken(first.token)
    if (oldStillWorks !== null) {
      fail("rotate.old", "old token still resolves after rotate")
      return id
    }
    const newWorks = await getPreparationByLiveToken(second.token)
    if (!newWorks) {
      fail("rotate.new", "new token does not resolve after rotate")
      return id
    }
    const prep = await getPreparationById(id)
    if (prep?.live_token_hash !== second.hash) {
      fail("rotate.db", "stored hash does not match rotated hash")
      return id
    }
    // live_state should be reset — fresh rotation wipes any prior session data.
    if (!prep.live_state || prep.live_state.current_phase !== null) {
      fail("rotate.state", "live_state not reset on rotate")
      return id
    }
    ok("rotate", "old hash dead, new hash live, live_state reset")
  } catch (err) {
    fail("rotate", err instanceof Error ? err.message : String(err))
  }
  return id
}

async function main() {
  console.log("Preparation fixes — runtime QA harness")
  console.log("=" + "=".repeat(60))

  const ids: string[] = []

  try {
    ids.push(await testFix1_IdentityWipe())
    ids.push(await testFix2_DescriptionWipe())
    ids.push(await testFix2_PatchRouteFlow())
    ids.push(await testFix3_LiveStateGate())
    ids.push(await testFix4_DemotionClearsToken())
    await testFix4_StaticDemotionAudit()
    ids.push(await testFix5_EmptyResearchAtomic())
    await testFix6_SSRFRemoved()
    await testTokenRotation().then((id) => ids.push(id))
    await testRateLimit()
  } finally {
    await cleanup(ids.filter(Boolean) as string[])
  }

  console.log("\n" + "=".repeat(61))
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  console.log(`Results: ${passed} passed, ${failed} failed (of ${results.length})`)
  if (failed > 0) {
    console.log("\nFailures:")
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  - ${r.scenario}: ${r.detail}`)
    }
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error("Harness crashed:", err)
  process.exit(2)
})
