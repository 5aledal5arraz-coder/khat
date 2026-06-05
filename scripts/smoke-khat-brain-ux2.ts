/**
 * UX-2 — Season Workspace smoke (11 cases).
 *
 *   1. /admin/khat-brain/seasons page module imports cleanly
 *   2. /admin/khat-brain/seasons/[seasonId] page module imports cleanly
 *   3. listSeasonSummaries returns shape with counts (incl. zero-row safe)
 *   4. loadEirPhasesForCandidates joins candidates → EIR phase
 *   5. Hybrid generation action is reachable from the new workspace
 *      (via the imported HybridGenerateButton + hybrid-actions module)
 *   6. legacy Generate Batch is gated by KHAT_LEGACY_BATCH_ENABLED
 *      (verified by grepping the wizard-client client component)
 *   7. market freshness widget data sources resolve (queries module
 *      imports + getMarketTotals + getTopClusters present)
 *   8. next-action helper provides a CTA for any phase the workspace
 *      surfaces (re-uses UX-1 helper)
 *   9. next.config.ts declares redirects for legacy /admin/khat-map URLs
 *  10. sidebar Seasons link points at /admin/khat-brain/seasons
 *      (NOT /admin/khat-map)
 *  11. seasons workspace renders the WizardClient stack (and therefore
 *      reuses accept/reject/alternative server actions)
 *
 * Pure file-system + module-import + DB-level smoke. Cleans up its own
 * rows on success.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
  khatMapGuestCandidates,
} from "@/lib/db/schema/khat-map"
import {
  listSeasonSummaries,
  loadEirPhasesForCandidates,
} from "@/lib/khat-brain/seasons-summary"
import { ensureEirForCandidate } from "@/lib/khat-brain"
import { getEpisodeCandidateById } from "@/lib/khat-map/core/queries"

const TAG = "smoke-ux2"
const REPO_ROOT = path.resolve(__dirname, "..")

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
  }
}

async function ensureSmokeAdmin(): Promise<string> {
  const existing = await db!
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, `${TAG}@example.com`))
    .limit(1)
  if (existing[0]) return existing[0].id
  const [row] = await db!
    .insert(adminUsers)
    .values({
      email: `${TAG}@example.com`,
      password_hash: "x",
      role: "ADMIN",
    })
    .returning({ id: adminUsers.id })
  return row.id
}

async function cleanup() {
  await db!.execute(sql`
    DELETE FROM khat_map_episode_candidates
    WHERE working_title LIKE ${TAG + "%"}
       OR season_id IN (SELECT id FROM khat_map_seasons WHERE name LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM khat_map_guest_candidates
    WHERE season_id IN (SELECT id FROM khat_map_seasons WHERE name LIKE ${TAG + "%"})
  `)
  await db!.execute(sql`
    DELETE FROM episode_intelligence_records WHERE working_title LIKE ${TAG + "%"}
  `)
  await db!.execute(sql`DELETE FROM khat_map_seasons WHERE name LIKE ${TAG + "%"}`)
}

// ─── Cases ────────────────────────────────────────────────────────────

async function caseListPageImports() {
  console.log("Case 1 — /admin/khat-brain/seasons page imports cleanly:")
  const mod = await import("@/app/admin/khat-brain/seasons/page")
  assert(typeof mod.default === "function", "default export missing")
  console.log(`  ✓ list page module loaded`)
}

async function caseWorkspacePageImports() {
  console.log("\nCase 2 — /admin/khat-brain/seasons/[seasonId] page imports:")
  const mod = await import("@/app/admin/khat-brain/seasons/[seasonId]/page")
  assert(typeof mod.default === "function", "default export missing")
  console.log(`  ✓ workspace page module loaded`)
}

async function caseListSummariesShape(adminId: string) {
  console.log("\nCase 3 — listSeasonSummaries returns shape with counts:")
  // Seed: 1 season, 3 candidates with statuses approved/rejected/proposed.
  const [season] = await db!
    .insert(khatMapSeasons)
    .values({
      name: `${TAG}-season-counts`,
      season_number: null,
      status: "planning",
      target_episode_count: 6,
      v2_mode: "guided",
      created_by: adminId,
    })
    .returning()
  await db!.insert(khatMapEpisodeCandidates).values([
    {
      season_id: season.id,
      status: "approved",
      working_title: `${TAG}-c1`,
      episode_type: "intellectual",
      topic_domain: "psychology",
    },
    {
      season_id: season.id,
      status: "rejected",
      working_title: `${TAG}-c2`,
      episode_type: "intellectual",
      topic_domain: "philosophy",
    },
    {
      season_id: season.id,
      status: "proposed",
      working_title: `${TAG}-c3`,
      episode_type: "intellectual",
      topic_domain: "social_issues",
    },
  ])
  const summaries = await listSeasonSummaries("active")
  const ours = summaries.find((s) => s.id === season.id)
  assert(ours, "seeded season not in summary list")
  assert(ours!.generated_count === 3, `expected 3 generated, got ${ours!.generated_count}`)
  assert(ours!.accepted_count === 1, `expected 1 accepted, got ${ours!.accepted_count}`)
  assert(ours!.rejected_count === 1, `expected 1 rejected, got ${ours!.rejected_count}`)
  assert(ours!.pending_count === 1, `expected 1 pending, got ${ours!.pending_count}`)
  console.log(
    `  ✓ counts: generated=${ours!.generated_count} accepted=${ours!.accepted_count} rejected=${ours!.rejected_count} pending=${ours!.pending_count}`,
  )
  return { seasonId: season.id }
}

async function caseEirPhaseLookup(adminId: string, seasonId: string) {
  console.log("\nCase 4 — loadEirPhasesForCandidates joins to EIR phase:")
  // Promote one of our pending candidates into an EIR.
  const [guest] = await db!
    .insert(khatMapGuestCandidates)
    .values({
      season_id: seasonId,
      status: "approved",
      full_name: `${TAG}-guest`,
      bio: "smoke",
      gender: "unknown",
      public_links: [],
      social_accounts: { website: "https://example.com" },
      evidence_citations: [],
      risk_flags: [],
    })
    .returning()
  const [cand] = await db!
    .insert(khatMapEpisodeCandidates)
    .values({
      season_id: seasonId,
      status: "approved",
      working_title: `${TAG}-eir-target`,
      episode_type: "intellectual",
      topic_domain: "psychology",
      suggested_guest_candidate_id: guest.id,
    })
    .returning()
  const fresh = await getEpisodeCandidateById(cand.id)
  assert(fresh, "candidate vanished")
  await ensureEirForCandidate({
    candidate: fresh!,
    guestId: guest.id,
    adminId,
  })

  const phases = await loadEirPhasesForCandidates([cand.id])
  const info = phases.get(cand.id)
  assert(info, "phase info missing for promoted candidate")
  assert(info!.eir_id, "eir_id missing")
  assert(info!.phase, "phase missing")
  console.log(`  ✓ phase lookup → eir=${info!.eir_id.slice(0, 8)} phase=${info!.phase}`)
}

async function caseHybridReachable() {
  console.log("\nCase 5 — Hybrid generation action reachable from new workspace:")
  // The new workspace imports HybridGenerateButton + hybrid-actions; if
  // those import cleanly, the path is wired.
  const btn = await import("@/app/admin/khat-brain/seasons/[seasonId]/_components/hybrid-button")
  assert(typeof btn.HybridGenerateButton === "function", "HybridGenerateButton not importable")
  const action = await import("@/app/admin/khat-brain/seasons/[seasonId]/_components/hybrid-actions")
  assert(typeof action.generateHybridTopicsAction === "function", "hybrid action not importable")
  // And the workspace file itself references both.
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/seasons/[seasonId]/page.tsx"),
    "utf8",
  )
  assert(body.includes("HybridGenerateButton"), "workspace must mount HybridGenerateButton")
  console.log(`  ✓ Hybrid surface is reachable from /admin/khat-brain/seasons/[id]`)
}

async function caseLegacyBatchGated() {
  console.log("\nCase 6 — legacy Generate Batch is flag-gated:")
  // wizard-client.tsx already enforces this in Phase A. Verify the
  // wizard still respects KHAT_LEGACY_BATCH_ENABLED and the workspace
  // forwards the flag.
  const workspace = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/seasons/[seasonId]/page.tsx"),
    "utf8",
  )
  assert(
    workspace.includes("KHAT_LEGACY_BATCH_ENABLED"),
    "workspace must read KHAT_LEGACY_BATCH_ENABLED",
  )
  const wizard = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/seasons/[seasonId]/_components/wizard-client.tsx"),
    "utf8",
  )
  assert(
    wizard.includes("legacyBatchEnabled"),
    "wizard-client must accept legacyBatchEnabled prop",
  )
  console.log(`  ✓ legacy Generate Batch hidden unless flag is set`)
}

async function caseMarketFreshnessSources() {
  console.log("\nCase 7 — market freshness widget data sources resolve:")
  const mod = await import("@/lib/market-intelligence/queries")
  assert(typeof mod.getMarketTotals === "function", "getMarketTotals missing")
  assert(typeof mod.getTopClusters === "function", "getTopClusters missing")
  // Smoke-call them.
  const totals = await mod.getMarketTotals()
  assert(typeof totals.signals_total === "number", "signals_total wrong type")
  assert(typeof totals.signals_last_7d === "number", "signals_last_7d wrong type")
  assert(typeof totals.clusters_total === "number", "clusters_total wrong type")
  console.log(
    `  ✓ market totals: signals=${totals.signals_total}, last_7d=${totals.signals_last_7d}, clusters=${totals.clusters_total}`,
  )
}

async function caseNextActionAvailable() {
  console.log("\nCase 8 — next-action helper provides CTA for workspace use:")
  const mod = await import("@/lib/khat-brain/next-action")
  assert(typeof mod.nextActionFor === "function", "nextActionFor missing")
  // Workspace surfaces phases such as approved/researching/prepared/etc.
  for (const phase of ["approved", "researching", "prepared", "ready_to_record"] as const) {
    const a = mod.nextActionFor(phase)
    assert(a.label && a.label.length > 0, `phase ${phase} missing label`)
  }
  console.log(`  ✓ all workspace-relevant phases have next-action entries`)
}

async function caseRedirectsDeclared() {
  console.log("\nCase 9 — next.config.ts declares legacy redirects:")
  const body = await fs.readFile(path.join(REPO_ROOT, "next.config.ts"), "utf8")
  for (const expected of [
    `source: "/admin/khat-map"`,
    `source: "/admin/khat-map/v2"`,
    `source: "/admin/khat-map/v2/:seasonId"`,
    `destination: "/admin/khat-brain/seasons"`,
    `destination: "/admin/khat-brain/seasons/:seasonId"`,
  ]) {
    assert(body.includes(expected), `next.config.ts missing: ${expected}`)
  }
  console.log(`  ✓ /admin/khat-map[*] → /admin/khat-brain/seasons[*]`)
}

async function caseSidebarPointsToNewRoute() {
  console.log("\nCase 10 — sidebar Seasons link points at /admin/khat-brain/seasons:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/components/admin-sidebar.tsx"),
    "utf8",
  )
  // The Seasons link must point at the new route. UX-5.3 shortened the
  // sidebar label from "المواسم والمواضيع" to "المواسم" — accept either
  // so historical and current source both pass.
  const seasonsLine = body
    .split("\n")
    .find(
      (l) =>
        l.includes(`href: "/admin/khat-brain/seasons"`) &&
        (l.includes("المواسم والمواضيع") || l.includes("المواسم")),
    )
  assert(
    seasonsLine,
    "Seasons sidebar link missing — expected /admin/khat-brain/seasons with المواسم label",
  )
  // No href to /admin/khat-map should remain in the sidebar.
  const oldHrefMatches = (body.match(/href:\s*"\/admin\/khat-map"/g) ?? []).length
  assert(
    oldHrefMatches === 0,
    `legacy /admin/khat-map href still present in sidebar (${oldHrefMatches})`,
  )
  console.log(`  ✓ sidebar Seasons → /admin/khat-brain/seasons`)
}

async function caseWorkspaceMountsWizard() {
  console.log("\nCase 11 — workspace mounts the existing WizardClient stack:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/seasons/[seasonId]/page.tsx"),
    "utf8",
  )
  assert(body.includes("import { WizardClient }"), "workspace must import WizardClient")
  assert(body.includes("<WizardClient"), "workspace must render <WizardClient />")
  // It must pass legacyBatchEnabled forward.
  assert(
    body.includes("legacyBatchEnabled={legacyBatchEnabled}"),
    "workspace must pass legacyBatchEnabled to WizardClient",
  )
  console.log(`  ✓ wizard stack reused; accept/reject/alt server actions intact`)
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 smoke-khat-brain-ux2 — starting\n")
  await cleanup()
  const adminId = await ensureSmokeAdmin()

  await caseListPageImports()
  await caseWorkspacePageImports()
  const { seasonId } = await caseListSummariesShape(adminId)
  await caseEirPhaseLookup(adminId, seasonId)
  await caseHybridReachable()
  await caseLegacyBatchGated()
  await caseMarketFreshnessSources()
  await caseNextActionAvailable()
  await caseRedirectsDeclared()
  await caseSidebarPointsToNewRoute()
  await caseWorkspaceMountsWizard()

  await cleanup()
  console.log("\n✅ smoke-khat-brain-ux2: all 11 cases passed")
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("\n💥 smoke failed:", err)
    try {
      await cleanup()
    } catch {}
    process.exit(1)
  })
