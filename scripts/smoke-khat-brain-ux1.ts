/**
 * UX-1 — Navigation + Command Center as true home (smoke).
 *
 *   1. lib/khat-brain/next-action.ts maps EVERY EpisodePhase value
 *   2. buildNextActionQueue sorts by priority then recency
 *   3. /admin/khat-brain page module imports cleanly
 *   4. /admin/khat-brain/command page module imports cleanly + is the
 *      redirect alias (calls notFound/redirect at module level — we
 *      verify shape only)
 *   5. /admin page is the redirect alias to /admin/khat-brain
 *   6. admin sidebar declares the new Khat Brain + Site & Operations
 *      groups, only ONE Khat Map link, no legacy "الأساسية" group, and
 *      points the Khat Brain home at /admin/khat-brain (not /command)
 *   7. /admin/khat-brain page source includes the
 *      "ما الذي يحتاج انتباهك الآن؟" heading
 *
 * Pure file-system + module-import smoke. No DB seed.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import {
  EPISODE_PHASES,
  type EpisodePhase,
} from "@/lib/db/schema/eir"
import {
  NEXT_ACTION_BY_PHASE,
  nextActionFor,
  buildNextActionQueue,
} from "@/lib/khat-brain/next-action"

const REPO_ROOT = path.resolve(__dirname, "..")

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
  }
}

// ─── Cases ────────────────────────────────────────────────────────────

function caseNextActionCoversEveryPhase() {
  console.log("Case 1 — next-action helper maps every EIR phase:")
  const phases = EPISODE_PHASES
  for (const phase of phases) {
    const a = NEXT_ACTION_BY_PHASE[phase]
    assert(a, `phase ${phase} has no NextAction entry`)
    assert(a.phase === phase, `phase mismatch for ${phase}: ${a.phase}`)
    assert(typeof a.label === "string" && a.label.length > 0, `phase ${phase} missing label`)
    assert(typeof a.description === "string" && a.description.length > 0, `phase ${phase} missing description`)
    assert(typeof a.href === "function", `phase ${phase} href must be a builder`)
    assert(typeof a.priority === "number", `phase ${phase} priority must be number`)
    assert(["normal", "warning", "urgent"].includes(a.tone), `phase ${phase} tone invalid: ${a.tone}`)
    // href builder produces something route-shaped.
    const sample = a.href("test-eir-id-12345")
    assert(sample.includes("test-eir-id-12345"), `phase ${phase} href didn't embed eir id`)
    assert(sample.startsWith("/admin/"), `phase ${phase} href must be admin-scoped`)
  }
  // Direct lookup helper.
  for (const phase of phases) {
    assert(nextActionFor(phase).phase === phase, `nextActionFor returned wrong entry for ${phase}`)
  }
  console.log(`  ✓ ${phases.length} phases × 1 action each, all valid`)
}

function caseQueueSortPriorityThenRecency() {
  console.log("\nCase 2 — buildNextActionQueue sorts by priority then recency:")
  const fakeEirs: Array<{ id: string; phase: EpisodePhase; updated_at: string }> = [
    // High priority but old
    { id: "a", phase: "ready_to_record", updated_at: "2026-01-01T00:00:00Z" },
    // Lower priority but newest
    { id: "b", phase: "published", updated_at: "2026-04-01T00:00:00Z" },
    // High priority and newest
    { id: "c", phase: "recording", updated_at: "2026-04-15T00:00:00Z" },
    // Mid priority
    { id: "d", phase: "researching", updated_at: "2026-04-10T00:00:00Z" },
    // Same high priority as "a", but newer
    { id: "e", phase: "ready_to_record", updated_at: "2026-04-20T00:00:00Z" },
  ]
  const q = buildNextActionQueue(fakeEirs)
  assert(q.length === 5, `expected 5 entries, got ${q.length}`)

  // recording (priority 5) must come first.
  assert(q[0].eir.id === "c", `expected 'c' first (recording), got ${q[0].eir.id}`)
  // Then the two ready_to_record entries (priority 10), newest-first.
  assert(q[1].eir.id === "e", `expected 'e' second (newer ready_to_record), got ${q[1].eir.id}`)
  assert(q[2].eir.id === "a", `expected 'a' third (older ready_to_record), got ${q[2].eir.id}`)
  // researching (priority 25) before published (priority 40).
  assert(q[3].eir.id === "d", `expected 'd' fourth (researching), got ${q[3].eir.id}`)
  assert(q[4].eir.id === "b", `expected 'b' last (published), got ${q[4].eir.id}`)

  // Each entry has the resolved href.
  for (const item of q) {
    assert(item.href.includes(item.eir.id), `href didn't embed eir id`)
  }
  console.log(`  ✓ priority then recency ordering correct`)
}

async function caseCommandCenterPageImports() {
  console.log("\nCase 3 — /admin/khat-brain page imports cleanly:")
  const mod = await import("@/app/admin/khat-brain/page")
  assert(typeof mod.default === "function", "default export missing")
  console.log(`  ✓ /admin/khat-brain page module loaded`)
}

async function caseCommandAliasIsRedirect() {
  console.log("\nCase 4 — /admin/khat-brain/command is a redirect alias:")
  const mod = await import("@/app/admin/khat-brain/command/page")
  assert(typeof mod.default === "function", "default export missing")
  // Read the file and verify it calls redirect("/admin/khat-brain").
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/command/page.tsx"),
    "utf8",
  )
  assert(body.includes(`redirect("/admin/khat-brain")`), "alias must redirect to /admin/khat-brain")
  console.log(`  ✓ /admin/khat-brain/command redirects to /admin/khat-brain`)
}

async function caseAdminRootIsRedirect() {
  console.log(
    "\nCase 5 — /admin redirects to /admin/ops (Operational dashboard is official home, B1):",
  )
  const mod = await import("@/app/admin/page")
  assert(typeof mod.default === "function", "default export missing")
  const rootBody = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/page.tsx"),
    "utf8",
  )
  // B1 — operational dashboard is now the admin home. The Khat Brain
  // Command Center remains one click away via the sidebar.
  assert(
    rootBody.includes(`redirect("/admin/ops")`),
    "/admin must redirect to /admin/ops (Phase B1 contract)",
  )
  // Cleanup Wave 1 (still holds) — the legacy-home `.bak` is gone;
  // app/admin/page.tsx must remain a thin redirect-only stub. A
  // redirect-only page is small + does not import any heavy admin
  // queries.
  assert(
    rootBody.length < 1000,
    `app/admin/page.tsx must remain a thin redirect (got ${rootBody.length} bytes)`,
  )
  for (const heavy of [
    "getEpisodes",
    "getAdminEpisodes",
    "getAllGuests",
    "DashboardCard",
  ]) {
    assert(
      !rootBody.includes(heavy),
      `app/admin/page.tsx must not import \`${heavy}\` — only redirect`,
    )
  }

  // The Command Center page still exists at /admin/khat-brain — it's
  // the episode-workflow center, just no longer the landing page.
  // Verify its source still carries the expected hero copy so an
  // accidental rename / delete is caught.
  const cc = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/page.tsx"),
    "utf8",
  )
  assert(
    cc.includes("Command Center") && cc.includes("مركز قيادة Khat Brain"),
    "Command Center page must still exist with its heading copy",
  )
  console.log(
    `  ✓ /admin redirects to /admin/ops + Command Center still reachable at /admin/khat-brain (${rootBody.length} bytes)`,
  )
}

async function caseSidebarShape() {
  console.log(
    "\nCase 6 — sidebar shape (B1: pinned home + Khat Brain + الموقع + أدوات متقدمة):",
  )
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/components/admin-sidebar.tsx"),
    "utf8",
  )
  // B1 — pinned home group present.
  assert(
    body.includes(`title: "__home__"`),
    "B1 pinned home group missing (title === '__home__')",
  )
  // Pinned home item points at /admin/ops with the "الرئيسية" label.
  const homePinLine = body
    .split("\n")
    .find((l) => l.includes(`label: "الرئيسية"`))
  assert(homePinLine, "Pinned home item missing")
  assert(
    homePinLine!.includes(`href: "/admin/ops"`),
    "Pinned home item must point at /admin/ops",
  )
  // No duplicate /admin/ops entry — only one (the pinned home item).
  const opsHrefMatches = (body.match(/href:\s*"\/admin\/ops"/g) ?? []).length
  assert(
    opsHrefMatches === 1,
    `Exactly one /admin/ops href expected (the pinned home); got ${opsHrefMatches}`,
  )

  // Required named groups (B1 renamed "الموقع والعمليات" → "الموقع"
  // since operations moved to the pinned home).
  assert(body.includes(`title: "Khat Brain"`), "Khat Brain group missing")
  assert(body.includes(`title: "الموقع"`), "الموقع group missing (B1 rename)")
  assert(body.includes(`title: "أدوات متقدمة"`), "أدوات متقدمة group missing")

  // Old / removed group titles must NOT appear.
  for (const old of [
    `title: "الأساسية"`,
    `title: "المحتوى"`,
    `title: "التواصل"`,
    `title: "النظام"`,
    `title: "Site & Operations"`, // English name before the B.3 Arabic rename
    `title: "الموقع والعمليات"`,   // pre-B1 combined name
  ]) {
    assert(!body.includes(old), `old group "${old}" must be removed`)
  }

  // Khat Brain home link still points at /admin/khat-brain.
  const cmdLine = body
    .split("\n")
    .find((l) => l.includes(`label: "مركز القيادة"`))
  assert(cmdLine, "مركز القيادة link missing")
  assert(
    cmdLine!.includes(`href: "/admin/khat-brain"`) &&
      !cmdLine!.includes(`/admin/khat-brain/command`),
    "Command Center link must point at /admin/khat-brain (not /command)",
  )

  // No duplicate Khat Map link (UX-2 moved Seasons to /admin/khat-brain/seasons).
  const khatMapMatches = (body.match(/href:\s*"\/admin\/khat-map"/g) ?? []).length
  assert(
    khatMapMatches <= 1,
    `sidebar must not contain more than one /admin/khat-map link, got ${khatMapMatches}`,
  )
  const hasSeasonsLink =
    body.includes(`href: "/admin/khat-map"`) ||
    body.includes(`href: "/admin/khat-brain/seasons"`)
  assert(hasSeasonsLink, "sidebar must surface a Seasons / Khat Map link")

  console.log(
    `  ✓ pinned-home + 3 named groups; Ops home unique; Seasons reachable; Command Center link intact`,
  )
}

async function caseHomePageHasNextActionQueue() {
  console.log("\nCase 7 — /admin/khat-brain renders «ما الذي يحتاج انتباهك الآن؟»:")
  const body = await fs.readFile(
    path.join(REPO_ROOT, "app/admin/khat-brain/page.tsx"),
    "utf8",
  )
  assert(
    body.includes("ما الذي يحتاج انتباهك الآن؟"),
    "Command Center page must render the Next Action heading",
  )
  assert(body.includes("buildNextActionQueue"), "Command Center must call buildNextActionQueue")
  assert(body.includes("NextActionRow"), "Command Center must use the NextActionRow component")
  // Raw activity feeds wrapped in <details>.
  assert(
    body.includes("<details") && body.includes("تفاصيل النشاط الخام"),
    "Raw activity feeds must be inside a <details> collapsible",
  )
  console.log(`  ✓ heading + queue + collapsible activity feeds present`)
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 smoke-khat-brain-ux1 — starting\n")
  caseNextActionCoversEveryPhase()
  caseQueueSortPriorityThenRecency()
  await caseCommandCenterPageImports()
  await caseCommandAliasIsRedirect()
  await caseAdminRootIsRedirect()
  await caseSidebarShape()
  await caseHomePageHasNextActionQueue()
  console.log("\n✅ smoke-khat-brain-ux1: all 7 cases passed")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 smoke failed:", err)
    process.exit(1)
  })
