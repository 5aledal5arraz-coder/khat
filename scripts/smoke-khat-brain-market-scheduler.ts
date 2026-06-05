/**
 * Smoke — Market Intelligence Scheduler.
 *
 * Pure file-system + module-import smoke. Confirms:
 *   • Handlers registered for collect / extract / cluster_signals /
 *     scheduler
 *   • Auto-chain wires next pipeline stage on success
 *   • ensureMarketScheduler bootstrap module exists + idempotent shape
 *   • Worker calls bootstrap at startup
 *   • Operator action `refreshMarketIntelligenceAction` enqueues
 *     market.collect (not raw npm/script calls)
 *   • UI status card renders Arabic copy + no engineering leaks
 *     (no `npm run`, no `market:collect`, etc.)
 *   • Freshness reader returns expected shape + thresholds
 *   • Hybrid generator no longer bails on `no_inputs` when worked
 *     report has signal
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
  // JSX comments first ({ block }), then bare block, then line.
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
    const message = err instanceof Error ? err.message : String(err)
    FAIL.push(`${label} — ${message}`)
    console.log(`❌ ${label}`)
    console.log(`   ${message}`)
  }
}

async function main() {
  console.log("\n🧪 smoke-khat-brain-market-scheduler — UX-12\n")

  await caseRun("1/16 market handler registers all 4 job types", async () => {
    const src = await readRel("lib/jobs/handlers/market-intelligence.ts")
    for (const t of [
      '"market.collect"',
      '"market.extract"',
      '"market.cluster_signals"',
      '"market.scheduler"',
    ]) {
      assert(src.includes(t), `missing registerHandler for ${t}`)
    }
  })

  await caseRun("2/16 collect handler auto-chains to extract", async () => {
    const src = await readRel("lib/jobs/handlers/market-intelligence.ts")
    assert(
      src.includes('enqueueJob(\n        "market.extract"'),
      "market.collect must auto-enqueue market.extract on success",
    )
  })

  await caseRun("3/16 extract handler auto-chains to cluster", async () => {
    const src = await readRel("lib/jobs/handlers/market-intelligence.ts")
    assert(
      src.includes('enqueueJob(\n      "market.cluster_signals"'),
      "market.extract must auto-enqueue market.cluster_signals",
    )
  })

  await caseRun("4/16 scheduler re-enqueues itself + has daily/weekly cadence", async () => {
    const src = await readRel("lib/jobs/handlers/market-intelligence.ts")
    assert(src.includes("market.scheduler"), "scheduler handler registered")
    assert(
      src.includes("DAILY_MS = 24 * 60 * 60 * 1000"),
      "daily cadence constant present",
    )
    assert(
      src.includes("WEEKLY_MS = 7 * DAILY_MS"),
      "weekly cadence constant present",
    )
    // self-rescheduling tick: scheduler enqueues itself
    assert(
      src.includes('"market.scheduler"') &&
        src.includes("runAfter: nextTickAt"),
      "scheduler must self-reschedule with runAfter",
    )
  })

  await caseRun("5/16 ensureMarketScheduler bootstrap exists + idempotent", async () => {
    const src = await readRel("lib/jobs/scheduler-bootstrap.ts")
    assert(src.includes("ensureMarketScheduler"), "function exported")
    assert(
      src.includes("status IN ('pending', 'running')"),
      "bootstrap must check for existing pending/running tick before inserting",
    )
    assert(
      src.includes('"already_scheduled"') && src.includes('"bootstrapped"'),
      "bootstrap returns clear idempotent status codes",
    )
  })

  await caseRun("6/16 worker bootstraps scheduler at startup", async () => {
    const src = await readRel("lib/jobs/worker.ts")
    assert(
      src.includes('from "./scheduler-bootstrap"') &&
        src.includes("ensureMarketScheduler()"),
      "worker must call ensureMarketScheduler() at startup",
    )
  })

  await caseRun("7/16 operator refresh action uses internal job queue", async () => {
    const src = await readRel(
      "app/admin/khat-brain/seasons/[seasonId]/_components/market-actions.ts",
    )
    assert(
      src.includes("refreshMarketIntelligenceAction"),
      "action exported",
    )
    assert(
      src.includes('enqueueJob(\n      "market.collect"'),
      "action enqueues market.collect via internal queue",
    )
    assert(
      src.includes("already_in_flight"),
      "action dedups against in-flight jobs",
    )
    // No raw npm/script names anywhere in the action
    for (const banned of [
      "npm run",
      "market:collect",
      "market:extract",
      "market:cluster",
    ]) {
      assert(
        !src.includes(banned),
        `action must not surface engineering identifier "${banned}"`,
      )
    }
  })

  await caseRun("8/16 status card surfaces Arabic operator language only", async () => {
    const src = await readRel(
      "app/admin/khat-brain/seasons/[seasonId]/_components/market-signals-card.tsx",
    )
    // Required Arabic operator copy
    for (const required of [
      "حديثة",
      "تحتاج تحديث",
      "غير متوفرة",
      "تحديث الآن",
      "عدد الإشارات",
      "عدد العناقيد",
      "آخر تحديث",
      "سيتم تحديث إشارات السوق تلقائياً",
    ]) {
      assert(src.includes(required), `card missing copy "${required}"`)
    }
    // No engineering identifiers
    for (const banned of [
      "npm run",
      "market:collect",
      "market:extract",
      "market:cluster",
      "market.collect",
      "discovery.",
      "ai_runs",
    ]) {
      assert(!src.includes(banned), `card leaks "${banned}"`)
    }
  })

  await caseRun("9/16 freshness reader exports correct shape + thresholds", async () => {
    const mod = await import("../lib/market-intelligence/freshness")
    assert(
      typeof mod.getMarketFreshness === "function",
      "getMarketFreshness exported",
    )
    const src = await readRel("lib/market-intelligence/freshness.ts")
    assert(
      src.includes("FRESH_THRESHOLD_MS = 48 * 60 * 60 * 1000"),
      "fresh = <48h",
    )
    assert(
      src.includes("STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000"),
      "stale = >7d",
    )
    assert(
      src.includes('status = "empty"'),
      "empty status when signalCount === 0",
    )
  })

  await caseRun("10/16 generator's is_empty bail requires every layer to be dry", async () => {
    // Bail condition now lives in `loadHybridInputs.is_empty` — generator
    // just defers to it. is_empty must require ALL of:
    //   clusters empty + raw_signals_fallback empty + originals empty
    //   + worked report empty.
    const inputs = await readRel("lib/hybrid-topics/inputs.ts")
    assert(
      inputs.includes("market_clusters.length === 0") &&
        inputs.includes("raw_signals_fallback.length === 0") &&
        inputs.includes("originals.length === 0") &&
        inputs.includes("!worked_has_data"),
      "is_empty must check clusters + raw signals + originals + worked-report memory",
    )
    const gen = await readRel("lib/hybrid-topics/generate.ts")
    assert(
      gen.includes("if (inputs.is_empty)") &&
        gen.includes('emptyResult(req, "no_inputs")'),
      "generator delegates the bail decision to inputs.is_empty",
    )
  })

  await caseRun("11/16 readiness diagnostic exposes every pipeline stage", async () => {
    const mod = await import("../lib/hybrid-topics/diagnostics")
    assert(
      typeof mod.getHybridReadiness === "function",
      "getHybridReadiness exported",
    )
    const src = await readRel("lib/hybrid-topics/diagnostics.ts")
    for (const field of [
      "market_signals_total",
      "market_signals_extracted",
      "market_clusters_total",
      "original_topics_fresh",
      "has_memory",
      "generator_ready",
      "should_trigger_extraction",
      "should_trigger_clustering",
    ]) {
      assert(src.includes(field), `readiness missing field "${field}"`)
    }
  })

  await caseRun("12/16 hybrid action auto-triggers extract/cluster when signals lag", async () => {
    const src = await readRel(
      "app/admin/khat-brain/seasons/[seasonId]/_components/hybrid-actions.ts",
    )
    assert(
      src.includes("getHybridReadiness") &&
        src.includes("should_trigger_extraction") &&
        src.includes("should_trigger_clustering"),
      "action must consult readiness before delegating",
    )
    assert(
      src.includes('enqueueJob(\n      "market.extract"') &&
        src.includes('enqueueJob(\n      "market.cluster_signals"'),
      "action must auto-enqueue extract + cluster_signals",
    )
  })

  await caseRun("13/16 generator builds a raw-signal prompt when clusters are empty", async () => {
    const src = await readRel("lib/hybrid-topics/generate.ts")
    assert(
      src.includes("raw_signals_fallback.length > 0") &&
        src.includes("clusters not yet computed"),
      "generator must degrade to raw-signal prompt when clusters are empty",
    )
    assert(
      src.includes('"clusters"') &&
        src.includes('"raw_signals"') &&
        src.includes('"originals_only"') &&
        src.includes('"memory_only"'),
      "generator must surface fallback_path so callers can report degradation",
    )
  })

  await caseRun("14/16 dev diagnostics panel is hidden by default", async () => {
    const src = await readRel(
      "app/admin/khat-brain/seasons/[seasonId]/page.tsx",
    )
    // Must require BOTH dev env AND an explicit opt-in (env flag or URL ?debug=1).
    assert(
      src.includes('process.env.NODE_ENV === "development"'),
      "diagnostics gate must require development env",
    )
    assert(
      src.includes('process.env.KHAT_SHOW_DEV_DIAGNOSTICS === "true"') &&
        src.includes('sp.debug === "1"'),
      "diagnostics gate must also require KHAT_SHOW_DEV_DIAGNOSTICS or ?debug=1",
    )
    // Must NOT fall through to "always show in non-prod".
    assert(
      !src.includes('process.env.NODE_ENV !== "production"'),
      "diagnostics gate must not use the broad non-prod check",
    )
  })

  await caseRun("15/16 hybrid action distinguishes system output from operator clicks", async () => {
    const raw = await readRel(
      "app/admin/khat-brain/seasons/[seasonId]/_components/hybrid-actions.ts",
    )
    // New result shape — counts are explicitly labelled.
    for (const required of [
      "generated_for_review",
      "auto_filtered",
      "analysis_pending",
      "preview_titles",
    ]) {
      assert(raw.includes(required), `action result missing "${required}"`)
    }
    // قُبل/رُفض allowed in comments (rule docs), banned in executable code.
    const code = stripComments(raw)
    assert(
      !code.includes("قُبل") && !code.includes("رُفض"),
      "action must never build قُبل/رُفض copy — that's reserved for operator clicks",
    )
  })

  await caseRun("16/16 hybrid button uses system-output copy only", async () => {
    const raw = await readRel(
      "app/admin/khat-brain/seasons/[seasonId]/_components/hybrid-button.tsx",
    )
    // Required Arabic operator copy
    for (const required of [
      "تم توليد",
      "مرشّحاً جديداً للمراجعة",
      "استبعد النظام",
      "مرشّحات ضعيفة قبل المراجعة",
      "جاري تحليل إشارات السوق",
      "عرض المرشحات الجديدة",
    ]) {
      assert(raw.includes(required), `button missing copy "${required}"`)
    }
    // قُبل/رُفض allowed in comments, banned in JSX/strings.
    const code = stripComments(raw)
    assert(
      !code.includes("قُبل") && !code.includes("رُفض"),
      "button must never use قُبل/رُفض — those imply human decisions",
    )
    // No internal rejection codes leaked in code.
    for (const banned of [
      "rejection_summary",
      "weak_emotional_hook",
      "near_dup_khat_map",
    ]) {
      assert(!code.includes(banned), `button leaks internal code "${banned}"`)
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
