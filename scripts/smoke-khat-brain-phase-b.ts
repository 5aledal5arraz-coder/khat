/**
 * Phase B — Controlled Legacy Collapse smoke (14 cases).
 *
 *   1. Legacy surface map carries the migration-status legend + the
 *      Phase B audit (per-route status + decision).
 *   2. /admin/episodes/[id] redirects to workspace when EIR exists +
 *      legacy escape (?legacy=1) preserved.
 *   3. /admin/episodes/[id] legacy banner uses the "أنت داخل العرض
 *      القديم" copy (operator knows where they are).
 *   4. /admin/studio surfaces the discoverability banner pointing
 *      operators into the workspace.
 *   5. Sidebar declares "أدوات متقدمة" as a collapsible group.
 *   6. Sidebar advanced-tools items use neutral labels (الإعداد /
 *      الاستديو / المرشحون / الحلقات) — no "الكاملة" / "القديمة" /
 *      "الجديدة" wording remains.
 *   7. Workspace tabs down-rank legacy links via faded markers.
 *   8. CreateRoomButton + PushButton no longer double-fetch (router.push
 *      without trailing router.refresh).
 *   9. Workspace loading.tsx skeleton exists.
 *  10. Phase C deletion manifest exists at the documented path.
 *  11. Workspace empty states give the operator a next action (no
 *      dead-ends in journey D).
 *  12. Push confirmation panel still groups جديدة vs سيتم استبدالها.
 *  13. /admin/preparation/[id] redirect contract preserved (UX-3a +
 *      Phase B keep-alive).
 *  14. CLI-hint banishment from UX-5.4 still holds.
 *
 * No DB writes — all assertions are source-text + filesystem-based.
 */

import { promises as fs } from "node:fs"
import path from "node:path"

const TAG = "smoke-phase-b"
const REPO_ROOT = path.resolve(__dirname, "..")

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`\n❌ ${msg}`)
    process.exit(1)
  }
}

async function readFile(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), "utf-8")
}

async function exists(rel: string): Promise<boolean> {
  try {
    await fs.stat(path.join(REPO_ROOT, rel))
    return true
  } catch {
    return false
  }
}

async function main() {
  console.log(`🧪 ${TAG} — starting\n`)
  let passed = 0

  // ── 1. Legacy surface map carries the new audit ──────────────────
  {
    const doc = await readFile("docs/khat-brain/legacy-surface-map.md")
    for (const need of [
      "Migration status legend",
      "Decision legend",
      "active",
      "shadowed",
      "deprecated",
      "removable",
      "removed",
      "Phase B summary",
    ]) {
      assert(doc.includes(need), `legacy-surface-map.md missing '${need}'.`)
    }
    console.log(
      "✅ 1/14 Legacy surface map ships migration-status legend + Phase B audit.",
    )
    passed++
  }

  // ── 2. /admin/episodes/[id] redirects when eir_id + !legacy ──────
  {
    const src = await readFile("app/admin/episodes/[id]/page.tsx")
    assert(
      src.includes("searchParams: Promise<{ legacy?: string }>"),
      "episodes/[id] page must accept ?legacy searchParam.",
    )
    assert(
      src.includes("redirect(") &&
        src.includes("/admin/khat-brain/episodes/${eirId}?tab=publish"),
      "episodes/[id] page must redirect to workspace when eir_id resolves.",
    )
    assert(
      src.includes("legacy !== \"1\""),
      "episodes/[id] page must guard the redirect with the ?legacy=1 escape hatch.",
    )
    console.log(
      "✅ 2/14 /admin/episodes/[id] redirects when eir_id + ?legacy=1 escape.",
    )
    passed++
  }

  // ── 3. Legacy banner copy is operator-honest ─────────────────────
  {
    const src = await readFile("app/admin/episodes/[id]/page.tsx")
    assert(
      src.includes("أنت داخل العرض القديم"),
      "Legacy banner must tell the operator they're in the legacy view.",
    )
    assert(
      src.includes("العودة إلى مساحة العمل") &&
        src.includes("/admin/khat-brain/episodes/${eirId}?tab=publish"),
      "Legacy banner must offer a one-click return path to the workspace.",
    )
    assert(
      src.includes("data-legacy-banner"),
      "Legacy banner must carry the data-legacy-banner marker.",
    )
    console.log(
      "✅ 3/14 Legacy banner tells operator they're in the legacy view + offers return.",
    )
    passed++
  }

  // ── 4. /admin/studio discoverability banner ──────────────────────
  {
    const src = await readFile("app/admin/studio/page.tsx")
    assert(
      src.includes("data-studio-discoverability-banner"),
      "Studio page must mount the discoverability banner.",
    )
    assert(
      src.includes("مساحة عمل موحّدة") &&
        src.includes("/admin/khat-brain/episodes"),
      "Studio banner must describe + link the workspace.",
    )
    console.log(
      "✅ 4/14 /admin/studio mounts the discoverability banner.",
    )
    passed++
  }

  // ── 5. Sidebar "أدوات متقدمة" is collapsible ────────────────────
  {
    const src = await readFile("app/admin/components/admin-sidebar.tsx")
    assert(
      src.includes("collapsible?: boolean"),
      "Sidebar NavGroup must declare a collapsible flag.",
    )
    assert(
      src.includes(`title: "أدوات متقدمة",
    collapsible: true,`) ||
        src.match(/title:\s*"أدوات متقدمة"[\s\S]{0,80}collapsible:\s*true/),
      "أدوات متقدمة group must be marked collapsible.",
    )
    assert(
      src.includes("data-collapsible-group"),
      "Collapsible group header must render the data-collapsible-group marker.",
    )
    console.log(
      "✅ 5/14 Sidebar declares 'أدوات متقدمة' as a collapsible group.",
    )
    passed++
  }

  // ── 6. Advanced-tools labels are neutral ────────────────────────
  {
    const src = await readFile("app/admin/components/admin-sidebar.tsx")
    // Slice the Advanced Tools block.
    const match = src.match(
      /title:\s*"أدوات متقدمة"[\s\S]*?items:\s*\[([\s\S]*?)\][\s\S]*?\}/,
    )
    assert(match, "advanced-tools group must exist in source.")
    const block = match![1]
    for (const need of [
      `label: "الإعداد"`,
      `label: "الاستديو"`,
      `label: "المرشحون"`,
      `label: "الحلقات"`,
    ]) {
      assert(
        block.includes(need),
        `advanced-tools must carry neutral label \`${need}\`.`,
      )
    }
    for (const banned of [
      "الكاملة",
      "(قديمة)",
      "الجديدة",
      "صفحة الإعداد الكاملة",
      "صفحة الاستوديو الكاملة",
      "ترشيحات الضيوف",
    ]) {
      assert(
        !block.includes(banned),
        `advanced-tools must not carry '${banned}'.`,
      )
    }
    console.log(
      "✅ 6/14 Advanced-tools labels are neutral (الإعداد / الاستديو / المرشحون / الحلقات).",
    )
    passed++
  }

  // ── 7. Workspace tabs down-rank legacy links ────────────────────
  {
    const tabs = [
      "app/admin/khat-brain/episodes/[eirId]/tab-preparation.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-recording.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-studio.tsx",
    ]
    for (const t of tabs) {
      const src = await readFile(t)
      assert(
        src.includes("data-legacy-link"),
        `${t} must mark legacy fallback links with data-legacy-link.`,
      )
      assert(
        !src.includes("الاستديو الكامل") &&
          !src.includes("صفحة الإعداد الكاملة"),
        `${t} must not duplicate 'الكامل' wording on legacy links.`,
      )
    }
    console.log(
      "✅ 7/14 Workspace tabs visually down-rank legacy fallback links.",
    )
    passed++
  }

  // ── 8. No double-fetch after action navigation ──────────────────
  {
    const room = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/create-room-button.tsx",
    )
    assert(
      !/router\.push\([^)]*\)\s*\n\s*router\.refresh\(\)/.test(room),
      "CreateRoomButton must not call router.refresh() after router.push().",
    )
    const push = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/push-button.tsx",
    )
    assert(
      !/router\.push\([^)]*\)\s*\n\s*router\.refresh\(\)/.test(push),
      "PushButton must not call router.refresh() after router.push().",
    )
    console.log(
      "✅ 8/14 CreateRoom + Push buttons no longer double-fetch on success.",
    )
    passed++
  }

  // ── 9. Workspace loading skeleton exists ────────────────────────
  {
    assert(
      await exists("app/admin/khat-brain/episodes/[eirId]/loading.tsx"),
      "Workspace must render a loading.tsx skeleton during refetches.",
    )
    const src = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/loading.tsx",
    )
    assert(
      src.includes("data-workspace-loading"),
      "Workspace loading skeleton must carry the marker.",
    )
    console.log(
      "✅ 9/14 Workspace loading.tsx skeleton present.",
    )
    passed++
  }

  // ── 10. Phase C deletion manifest exists ────────────────────────
  {
    assert(
      await exists("docs/khat-brain/safe-to-delete-phase-c.md"),
      "Phase C deletion manifest must be checked in.",
    )
    const doc = await readFile("docs/khat-brain/safe-to-delete-phase-c.md")
    for (const need of [
      "SAFE_TO_DELETE_PHASE_C",
      "_legacy-home-page.tsx.bak",
      "khat-brain/_legacy-minimal-page.tsx.bak",
      "khat-map/page.tsx",
      "khat-map/v2/[seasonId]/page.tsx",
      "NOT safe to delete",
    ]) {
      assert(
        doc.includes(need),
        `Phase C manifest missing '${need}'.`,
      )
    }
    console.log(
      "✅ 10/14 Phase C deletion manifest enumerates candidates + carries 'NOT safe' guardrail.",
    )
    passed++
  }

  // ── 11. Workspace empty states offer a next action ──────────────
  {
    // Preparation no-prep state must link to the season workspace.
    const prep = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/tab-preparation.tsx",
    )
    assert(
      prep.includes("لا يوجد سجلّ إعداد") &&
        prep.includes("/admin/khat-brain/seasons/${seasonId}"),
      "Preparation empty state must link the operator back to the season workspace.",
    )

    // Recording no-prep state must link to the Preparation tab.
    const rec = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/tab-recording.tsx",
    )
    assert(
      rec.includes("الإعداد مطلوب قبل التسجيل") &&
        rec.includes("?tab=preparation"),
      "Recording empty state must redirect operator to the Preparation tab.",
    )

    // Studio no-session state must link to the studio surface.
    const studio = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/tab-studio.tsx",
    )
    assert(
      studio.includes("لا توجد جلسة استديو") &&
        studio.includes("/admin/studio"),
      "Studio empty state must link to the studio surface.",
    )

    // Performance no-data state must offer the workspace refresh button.
    const perf = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/tab-performance.tsx",
    )
    assert(
      perf.includes("لا توجد بيانات أداء بعد") &&
        perf.includes("refreshYoutubePerformanceAction"),
      "Performance empty state must offer the workspace 'تحديث' button.",
    )
    console.log(
      "✅ 11/14 Every empty state hands the operator a next action (no dead-ends).",
    )
    passed++
  }

  // ── 12. Push confirmation grouping intact ────────────────────────
  {
    const src = await readFile(
      "app/admin/khat-brain/episodes/[eirId]/push-button.tsx",
    )
    assert(
      src.includes("حقول جديدة") &&
        src.includes("حقول سيتم استبدالها"),
      "Push confirm panel must continue grouping new vs overwritten fields.",
    )
    assert(
      src.includes("سيتم استبدال القيم الحالية في الحلقة بهذه البيانات"),
      "Push confirm warning copy must be intact.",
    )
    console.log(
      "✅ 12/14 Push confirmation grouping + warning copy intact.",
    )
    passed++
  }

  // ── 13. Preparation redirect contract intact ─────────────────────
  {
    const src = await readFile("app/admin/preparation/[id]/page.tsx")
    assert(
      src.includes("redirect(") &&
        src.includes("/admin/khat-brain/episodes/") &&
        src.includes('legacy !== "1"'),
      "/admin/preparation/[id] must continue redirecting when eir_id resolves + ?legacy=1 escape.",
    )
    console.log(
      "✅ 13/14 /admin/preparation/[id] redirect contract preserved.",
    )
    passed++
  }

  // ── 14. CLI hint banishment still holds ──────────────────────────
  {
    const tabs = [
      "app/admin/khat-brain/episodes/[eirId]/tab-preparation.tsx",
      "app/admin/khat-brain/episodes/[eirId]/tab-performance.tsx",
    ]
    for (const t of tabs) {
      const src = await readFile(t)
      for (const cli of [
        "npm run prep:v2",
        "npm run cycle:khat-brain",
        "npm run jobs:schedule-youtube-performance",
      ]) {
        assert(
          !src.includes(cli),
          `${t} must remain free of the CLI hint '${cli}' (UX-5.4 contract).`,
        )
      }
    }
    console.log(
      "✅ 14/14 CLI-hint banishment still holds.",
    )
    passed++
  }

  console.log(`\n🎉 ${TAG} — ${passed}/14 cases passed.\n`)
}

main().catch((err) => {
  console.error(`\n💥 ${TAG} failed:`, err)
  process.exit(1)
})
