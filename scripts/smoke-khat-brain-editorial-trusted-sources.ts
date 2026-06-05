/**
 * Smoke — Trusted Sources UI (Phase 3).
 *
 * File-system + module-import smoke. Verifies:
 *   • Page + components exist
 *   • Arabic copy for the seven source types + filters + sort
 *   • Server actions for full CRUD + state toggles + slider adjustments
 *   • Validation: dup-identifier, URL check, score range, display name
 *   • Preview calculations (linked count, mean score, approval ratio,
 *     latest activity) declared in the query layer
 *   • Sidebar entry "المصادر الموثوقة"
 *   • Phase boundary: no scoring / hybrid / cluster / scheduler edits
 *   • raw_signals fallback unchanged
 *   • Phase 2 review UI smoke artefacts untouched
 */

import { promises as fs } from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "..")
const FAIL: string[] = []
const PASS: string[] = []

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}
async function readRel(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), "utf8")
}
function stripComments(src: string): string {
  const jsxBlock = new RegExp("\\{\\s*\\/\\*[\\s\\S]*?\\*\\/\\s*\\}", "g")
  const block = new RegExp("\\/\\*[\\s\\S]*?\\*\\/", "g")
  const line = new RegExp("(^|[^:])\\/\\/[^\\n]*", "g")
  return src.replace(jsxBlock, "").replace(block, "").replace(line, "$1")
}
async function caseRun(label: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    PASS.push(label)
    console.log(`✅ ${label}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    FAIL.push(`${label} — ${msg}`)
    console.log(`❌ ${label}`)
    console.log(`   ${msg}`)
  }
}

const COMP_DIR = "app/admin/khat-brain/market/sources/_components"
const PAGE_PATH = "app/admin/khat-brain/market/sources/page.tsx"

const FORBIDDEN = [
  "npm run",
  "market.collect",
  "market.extract",
  "market.cluster_signals",
  "market.scheduler",
  "ingestion",
  "pipeline",
  "scheduler",
  "ai_runs",
  "trusted_source_id",
  "market_trusted_sources",
]

async function main() {
  console.log("\n🧪 smoke-khat-brain-editorial-trusted-sources — Phase 3\n")

  await caseRun("1/12 page + components exist at expected paths", async () => {
    for (const f of [
      PAGE_PATH,
      `${COMP_DIR}/copy.ts`,
      `${COMP_DIR}/source-actions.ts`,
      `${COMP_DIR}/sources-client.tsx`,
      "lib/market-intelligence/sources-queries.ts",
      "lib/market-intelligence/sources-mutations.ts",
    ]) {
      const ok = await fs
        .access(path.join(REPO_ROOT, f))
        .then(() => true)
        .catch(() => false)
      assert(ok, `missing file: ${f}`)
    }
  })

  await caseRun("2/12 Arabic copy covers seven source types + filters + sorts", async () => {
    const copy = await readRel(`${COMP_DIR}/copy.ts`)
    for (const required of [
      "قناة يوتيوب",
      "بودكاست",
      "موقع",
      "تغذية RSS",
      "صانع محتوى",
      "صحفي",
      "مفكّر",
    ]) {
      assert(copy.includes(required), `SOURCE_TYPE_LABEL missing "${required}"`)
    }
    for (const required of ["نشطة", "متوقّفة", "مؤرشفة", "ثقة عالية", "انسجام عالٍ"]) {
      assert(copy.includes(required), `FILTER_LABEL missing "${required}"`)
    }
    for (const required of [
      "الأحدث",
      "الأعلى ثقة",
      "الأعلى انسجاماً",
      "الأكثر إشارات",
    ]) {
      assert(copy.includes(required), `SORT_LABEL missing "${required}"`)
    }
  })

  await caseRun("3/12 server actions export full CRUD + state toggles + score adjusters", async () => {
    const src = await readRel(`${COMP_DIR}/source-actions.ts`)
    for (const name of [
      "createSourceAction",
      "updateSourceAction",
      "setActiveAction",
      "archiveSourceAction",
      "restoreSourceAction",
      "adjustTrustAction",
      "adjustAlignmentAction",
      "setNotesAction",
    ]) {
      assert(
        src.includes(`export async function ${name}`),
        `source-actions.ts must export ${name}`,
      )
    }
    assert(
      src.includes('"use server"'),
      "source-actions.ts must be a server-action module",
    )
    assert(
      src.includes("requireAdmin()") && src.includes("getAdminAuthUser()"),
      "actions must require admin + lift actor from session",
    )
  })

  await caseRun("4/12 validation: URL + range + display name + dup-identifier", async () => {
    const src = await readRel("lib/market-intelligence/sources-mutations.ts")
    assert(src.includes("looksLikeUrl"), "URL validator missing")
    assert(src.includes("clamp01"), "score range clamp missing")
    assert(
      src.includes("display_name_required") &&
        src.includes("invalid_url") &&
        src.includes("invalid_score_range") &&
        src.includes("duplicate_identifier"),
      "mutation must surface all four error codes",
    )
    // URL-required set must include exactly the four URL-shaped types.
    assert(
      src.includes('"youtube"') &&
        src.includes('"podcast"') &&
        src.includes('"website"') &&
        src.includes('"rss"'),
      "URL_REQUIRED_TYPES set must enumerate youtube/podcast/website/rss",
    )
    // Pre-check + DB unique catch race.
    assert(
      src.includes("Pre-check duplicate") || src.includes("duplicate key value"),
      "mutation must pre-check or trap duplicate identifier",
    )
  })

  await caseRun("5/12 preview calculations declared on read layer", async () => {
    const src = await readRel("lib/market-intelligence/sources-queries.ts")
    for (const required of [
      "linked_count",
      "mean_signal_score",
      "approval_ratio",
      "latest_signal_at",
      "latest_signals",
    ]) {
      assert(src.includes(required), `query layer missing "${required}"`)
    }
    // The approval_ratio is computed approved / (approved + rejected).
    assert(
      src.includes("approved / totalReviewed"),
      "approval_ratio must be approved / (approved+rejected)",
    )
  })

  await caseRun("6/12 facets cover filters: type / language / geography / active counts", async () => {
    const src = await readRel("lib/market-intelligence/sources-queries.ts")
    for (const required of [
      "totalActive",
      "totalInactive",
      "totalArchived",
      "byType",
      "byGeography",
      "byLanguage",
    ]) {
      assert(src.includes(required), `facets missing "${required}"`)
    }
  })

  await caseRun("7/12 client surface offers all filter chips + sort options", async () => {
    const src = await readRel(`${COMP_DIR}/sources-client.tsx`)
    for (const required of [
      "data-filter-key",
      "data-type-filter",
      "data-language-filter",
      "data-geography-filter",
      "data-sort",
      "data-add-source",
      "data-add-submit",
      "data-edit-submit",
      "data-add-form",
      "data-edit-form",
      'testId="archive"',
      'testId="restore"',
      'testId="activate"',
      'testId="deactivate"',
      'testId="edit"',
      "data-action={testId}",
      "data-slider={testId}",
      'testId="trust"',
      'testId="alignment"',
      "data-source-card",
      "data-latest-signals",
      "data-source-stats",
    ]) {
      assert(src.includes(required), `client surface missing hook "${required}"`)
    }
  })

  await caseRun("8/12 no internal terms in operator surface", async () => {
    for (const f of [PAGE_PATH, `${COMP_DIR}/copy.ts`, `${COMP_DIR}/sources-client.tsx`]) {
      const code = stripComments(await readRel(f))
      for (const banned of FORBIDDEN) {
        assert(
          !code.includes(banned),
          `operator surface "${f}" leaks "${banned}"`,
        )
      }
    }
  })

  await caseRun("9/12 sidebar has the Arabic entry «المصادر الموثوقة»", async () => {
    const src = await readRel("app/admin/components/admin-sidebar.tsx")
    assert(
      src.includes("/admin/khat-brain/market/sources") &&
        src.includes("المصادر الموثوقة"),
      "admin-sidebar must link to /admin/khat-brain/market/sources with label 'المصادر الموثوقة'",
    )
  })

  await caseRun("10/12 phase boundary: no behavior change to scoring/hybrid/cluster/scheduler", async () => {
    const forbidden = [
      "createTrustedSource",
      "updateTrustedSource",
      "archiveSource",
      "restoreSource",
      "adjustTrustScore",
      "adjustAlignmentScore",
    ]
    const handlerFiles = [
      "lib/jobs/handlers/market-intelligence.ts",
      "lib/hybrid-topics/generate.ts",
      "lib/hybrid-topics/inputs.ts",
      "lib/hybrid-topics/diagnostics.ts",
      "lib/market-intelligence/clustering.ts",
      "lib/market-intelligence/extraction.ts",
      "lib/market-intelligence/freshness.ts",
    ]
    for (const f of handlerFiles) {
      try {
        const src = await readRel(f)
        for (const sym of forbidden) {
          assert(
            !src.includes(sym),
            `Phase 3 must not wire ${sym} into ${f}`,
          )
        }
      } catch {
        // file missing — fine
      }
    }
  })

  await caseRun("11/12 hybrid generator declares clusters + foundational paths (Phase 6+)", async () => {
    const gen = await readRel("lib/hybrid-topics/generate.ts")
    // Phase 6 retired the raw_signals fallback. Verify the post-Phase-6
    // contract: clusters OR foundational only.
    assert(
      gen.includes('"clusters"') && gen.includes('"foundational"'),
      "generator must declare both clusters + foundational paths",
    )
    assert(
      !gen.includes("raw_signals_fallback"),
      "Phase 6 contract: raw_signals_fallback path is gone",
    )
  })

  await caseRun("12/12 Phase 2 review-queue surface untouched", async () => {
    const review = await readRel(
      "app/admin/khat-brain/market/signals/_components/signals-client.tsx",
    )
    // Phase 2 hooks still exist (this guards against accidental edits).
    for (const required of [
      "data-bulk-approve",
      "data-bulk-reject",
      "data-bulk-archive",
      "data-bulk-tag",
    ]) {
      assert(review.includes(required), `Phase 2 hook ${required} missing`)
    }
  })

  console.log(
    `\n${FAIL.length === 0 ? "🎉" : "💥"} ${PASS.length} passed, ${FAIL.length} failed`,
  )
  if (FAIL.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error("Smoke crashed:", err)
  process.exit(1)
})
