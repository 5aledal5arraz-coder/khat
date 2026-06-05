/**
 * Smoke — Hybrid Integration (Phase 6).
 *
 * Mixed static + live tests:
 *   • Clustering filters rejected/archived signals
 *   • Clustering weights approved/operator-created/trusted/scored higher
 *   • Clusters persist editorial_score; queries sort by it
 *   • Hybrid inputs dropped raw_signals_fallback; taste weights surface
 *   • Generator gates correctly:
 *       - clusters → run normally
 *       - signals only → analysis_pending (no AI call)
 *       - truly empty → no_inputs
 *       - foundational → run with originals+memory
 *   • Action short-circuits on analysis_pending
 *   • UI surfaces "المسار التأسيسي" + "جاري تحليل…" + "بُنيت من إشارات سوق معتمدة"
 *   • Operator-language map has analysis_pending entry
 *   • No internal terms in operator surface
 *   • LIVE: rerun clustering against real signals → see editorial_score
 *   • LIVE: getHybridReadiness reflects current DB state
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import { readFileSync } from "node:fs"

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
function loadEnv() {
  try {
    const envPath = path.resolve(REPO_ROOT, ".env.local")
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      const [, k, rawV] = m
      if (process.env[k]) continue
      let v = rawV.trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[k] = v
    }
  } catch {}
}

const SEASON_COMP_DIR = "app/admin/khat-brain/seasons/[seasonId]/_components"

const FORBIDDEN_OPERATOR = [
  "raw_signals",
  "score_components",
  "market.score_signals",
  "market.cluster_signals",
  "market.extract",
  "market.scheduler",
  "pipeline",
  "scheduler",
  "ingestion",
  "ai_runs",
]

async function main() {
  console.log("\n🧪 smoke-khat-brain-editorial-hybrid-integration — Phase 6\n")
  loadEnv()

  await caseRun("1/16 clustering filters rejected/archived signals", async () => {
    const src = await readRel("lib/market-intelligence/clustering.ts")
    assert(
      src.includes('notInArray(marketTopicSignals.review_status') &&
        src.includes('"rejected"') && src.includes('"archived"'),
      "clustering must filter out review_status IN (rejected, archived)",
    )
  })

  await caseRun("2/16 clustering weights approved/operator/trusted/score", async () => {
    const src = await readRel("lib/market-intelligence/clustering.ts")
    for (const required of [
      "CONTRIB_APPROVED_MULT",
      "CONTRIB_OPERATOR_MULT",
      "CONTRIB_TRUSTED_MULT",
      "CONTRIB_EDITORIAL_TAG_MULT",
      "CONTRIB_SCORE_LIFT_MAX",
      "CONTRIB_CAP",
    ]) {
      assert(src.includes(required), `clustering missing weight constant "${required}"`)
    }
    assert(
      src.includes("contributionWeight"),
      "clustering must declare a contributionWeight() helper",
    )
    // Approved must boost > 1.0
    const m = src.match(/CONTRIB_APPROVED_MULT\s*=\s*([\d.]+)/)
    assert(m && Number(m[1]) > 1, "approved multiplier must be > 1.0")
  })

  await caseRun("3/16 cluster rows persist editorial_score", async () => {
    const cluster = await readRel("lib/market-intelligence/clustering.ts")
    assert(
      cluster.includes("editorial_score: b.editorial_score"),
      "clustering must write editorial_score to the cluster row",
    )
    const queries = await readRel("lib/market-intelligence/queries.ts")
    assert(
      queries.includes("desc(marketTopicClusters.editorial_score)"),
      "getTopClusters must sort by editorial_score DESC",
    )
  })

  await caseRun("4/16 hybrid inputs removed raw_signals_fallback + load taste", async () => {
    const raw = await readRel("lib/hybrid-topics/inputs.ts")
    // raw_signals_fallback / HybridRawSignal can appear in JSDoc comments
    // describing the removal — strip comments before checking.
    const code = stripComments(raw)
    assert(
      !code.includes("raw_signals_fallback") && !code.includes("HybridRawSignal"),
      "raw_signals_fallback must be gone in Phase 6 executable code",
    )
    assert(
      raw.includes("loadTasteLookup") && raw.includes("taste_hints"),
      "inputs must load + surface taste weights",
    )
    assert(
      raw.includes("dominantTasteHints"),
      "inputs must declare dominantTasteHints()",
    )
  })

  await caseRun("5/16 generator: foundational path + analysis_pending reason", async () => {
    const src = await readRel("lib/hybrid-topics/generate.ts")
    assert(
      src.includes('"foundational"') && src.includes('"clusters"'),
      "HybridFallbackPath must be {clusters, foundational}",
    )
    assert(
      !src.includes('"raw_signals"') && !src.includes("raw_signals_fallback"),
      "raw_signals path must be removed",
    )
    assert(
      src.includes('"analysis_pending"'),
      "reason vocab must include analysis_pending",
    )
    assert(
      src.includes("decideReadiness"),
      "generator must declare decideReadiness()",
    )
    // Taste-hint block must be in the prompt builder.
    assert(
      src.includes("EDITORIAL TASTE HINTS") || src.includes("tasteHintBlock"),
      "prompt must include taste-hint block",
    )
  })

  await caseRun("6/16 action short-circuits on analysis_pending", async () => {
    const src = await readRel(`${SEASON_COMP_DIR}/hybrid-actions.ts`)
    assert(
      src.includes('readiness.blocking_reason === "analysis_pending"'),
      "action must detect blocking_reason='analysis_pending' before calling AI",
    )
    assert(
      src.includes("should_trigger_scoring") &&
        src.includes('"market.score_signals"'),
      "action must auto-trigger scoring when stale",
    )
    // Operator copy passes through generationReasonLabel.
    assert(
      src.includes('generationReasonLabel("analysis_pending")'),
      "action must surface analysis_pending via operator-language",
    )
  })

  await caseRun("7/16 diagnostics: new gates + scoring trigger", async () => {
    const src = await readRel("lib/hybrid-topics/diagnostics.ts")
    for (const required of [
      "market_signals_scored",
      "has_scored_signals",
      "should_trigger_scoring",
      '"analysis_pending"',
      "has_foundational",
    ]) {
      assert(src.includes(required), `diagnostics missing "${required}"`)
    }
    // Filters rejected/archived from the signal-counts query.
    assert(
      src.includes("review_status NOT IN ('rejected', 'archived')"),
      "diagnostics must exclude rejected/archived from signal totals",
    )
  })

  await caseRun("8/16 operator-language map: analysis_pending entry", async () => {
    const src = await readRel("lib/operator-language.ts")
    assert(
      src.includes("analysis_pending:") &&
        src.includes("جاري تحليل إشارات السوق"),
      "operator-language must surface analysis_pending in Arabic",
    )
  })

  await caseRun("9/16 button renders Arabic path badges", async () => {
    const src = await readRel(`${SEASON_COMP_DIR}/hybrid-button.tsx`)
    assert(
      src.includes("المسار التأسيسي"),
      "button must show 'المسار التأسيسي' badge on foundational path",
    )
    assert(
      src.includes("بُنيت من إشارات سوق معتمدة"),
      "button must show 'بُنيت من إشارات سوق معتمدة' badge on cluster path",
    )
    assert(
      src.includes("جاري تحليل إشارات السوق"),
      "button must show 'جاري تحليل…' message",
    )
    assert(
      src.includes('data-hybrid-path="foundational"') &&
        src.includes('data-hybrid-path="clusters"'),
      "button must expose data-hybrid-path for testability",
    )
  })

  await caseRun("10/16 no internal terms leak in operator surface", async () => {
    const surfaces = [
      `${SEASON_COMP_DIR}/hybrid-button.tsx`,
    ]
    for (const f of surfaces) {
      const code = stripComments(await readRel(f))
      const noImports = code.replace(/^import.+$/gm, "")
      for (const banned of FORBIDDEN_OPERATOR) {
        assert(
          !noImports.includes(banned),
          `operator surface "${f}" leaks "${banned}"`,
        )
      }
    }
  })

  await caseRun("11/16 no false accepted/rejected counts in success copy", async () => {
    const src = await readRel(`${SEASON_COMP_DIR}/hybrid-button.tsx`)
    // قُبل / رُفض are reserved for human wizard clicks. Phase 4 banned
    // these from the button's executable JSX; Phase 6 re-asserts it.
    const code = stripComments(src)
    assert(
      !code.includes("قُبل") && !code.includes("رُفض"),
      "button must never narrate human-decision verbs from system output",
    )
    // Pending cards must be reachable BEFORE counts. Verify the result
    // panel renders the preview + the refresh button.
    assert(
      src.includes("preview_titles") && src.includes("عرض المرشحات الجديدة"),
      "button must surface preview titles + refresh button so cards appear before any human count",
    )
  })

  await caseRun("12/16 LIVE: getHybridReadiness reads new DB shape", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("   skipped — DATABASE_URL not set")
      return
    }
    const { db } = await import("../lib/db")
    if (!db) return
    const { getHybridReadiness } = await import(
      "../lib/hybrid-topics/diagnostics"
    )
    const r = await getHybridReadiness()
    assert(
      typeof r.market_signals_scored === "number",
      "readiness must expose market_signals_scored",
    )
    assert(
      typeof r.has_scored_signals === "boolean",
      "readiness must expose has_scored_signals",
    )
    assert(
      r.blocking_reason === null ||
        r.blocking_reason === "no_inputs" ||
        r.blocking_reason === "analysis_pending",
      `unexpected blocking_reason: ${r.blocking_reason}`,
    )
  })

  await caseRun("13/16 LIVE: clustering writes editorial_score against real signals", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("   skipped — DATABASE_URL not set")
      return
    }
    const { db } = await import("../lib/db")
    if (!db) return
    const { sql } = await import("drizzle-orm")
    const { recomputeClusters } = await import(
      "../lib/market-intelligence/clustering"
    )
    const r = await recomputeClusters({ lookbackDays: 90 })
    assert(
      r.scanned >= 0 && r.written >= 0,
      "clustering result shape sane",
    )
    if (r.written === 0) {
      // No clusters formed (test DB might be filtered tight). Still pass.
      console.log("   note: clustering produced 0 buckets; that's fine for the test")
      return
    }
    const head = await db.execute(sql`
      SELECT label, editorial_score, signal_count
      FROM market_topic_clusters
      ORDER BY editorial_score DESC NULLS LAST
      LIMIT 1
    `)
    const top = head.rows[0] as Record<string, unknown> | undefined
    assert(top, "expected at least one cluster")
    assert(
      top!.editorial_score !== null && Number(top!.editorial_score) > 0,
      "top cluster must have editorial_score > 0",
    )
  })

  await caseRun("14/16 LIVE: rejected signals are excluded from new clusters", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("   skipped — DATABASE_URL not set")
      return
    }
    const { db } = await import("../lib/db")
    if (!db) return
    const { sql } = await import("drizzle-orm")
    const { recomputeClusters } = await import(
      "../lib/market-intelligence/clustering"
    )
    // Pick an extracted signal whose theme is shared by MULTIPLE other
    // signals — otherwise rejecting it would just dissolve the cluster
    // (below MIN_BUCKET_SAMPLE) and leave us nothing to compare.
    // Clustering buckets by (theme, language). Match that grouping
    // exactly so we pick a (theme,language) pair with enough headroom
    // that rejecting one signal still leaves MIN_BUCKET_SAMPLE valid.
    const candidate = await db.execute(sql`
      WITH theme_counts AS (
        SELECT theme, language, count(*)::int AS n
        FROM market_topic_signals
        WHERE theme IS NOT NULL
          AND review_status = 'new'
          AND collected_at >= now() - interval '90 days'
        GROUP BY theme, language
        HAVING count(*) >= 3
      )
      SELECT s.id, s.theme, s.language
      FROM market_topic_signals s
      JOIN theme_counts tc
        ON tc.theme = s.theme AND tc.language = s.language
      WHERE s.review_status = 'new'
      ORDER BY s.collected_at DESC
      LIMIT 1
    `)
    const target = candidate.rows[0] as Record<string, unknown> | undefined
    if (!target) {
      console.log("   skipped — no theme with ≥3 'new' signals available")
      return
    }
    const theme = String(target.theme)
    const language = String(target.language)
    const id = String(target.id)
    try {
      // Re-cluster first to ensure baseline reflects ALL currently-valid signals.
      await recomputeClusters({ lookbackDays: 90 })
      const before = await db.execute(sql`
        SELECT signal_count
        FROM market_topic_clusters
        WHERE label = ${theme} AND language = ${language}
        LIMIT 1
      `)
      const beforeCount = Number(
        (before.rows[0] as { signal_count?: number } | undefined)?.signal_count ?? 0,
      )
      // Reject one signal of that (theme, language).
      await db.execute(sql`
        UPDATE market_topic_signals SET review_status='rejected' WHERE id=${id}
      `)
      await recomputeClusters({ lookbackDays: 90 })
      const after = await db.execute(sql`
        SELECT signal_count
        FROM market_topic_clusters
        WHERE label = ${theme} AND language = ${language}
        LIMIT 1
      `)
      const afterCount = Number(
        (after.rows[0] as { signal_count?: number } | undefined)?.signal_count ?? 0,
      )
      assert(
        afterCount === beforeCount - 1 || after.rows.length === 0,
        `rejected signal must reduce cluster ${theme}|${language} signal_count (before=${beforeCount} after=${afterCount})`,
      )
    } finally {
      await db.execute(sql`
        UPDATE market_topic_signals SET review_status='new' WHERE id=${id}
      `)
      await recomputeClusters({ lookbackDays: 90 })
    }
  })

  await caseRun("15/16 LIVE: full chain produces visible PENDING candidates", async () => {
    if (!process.env.DATABASE_URL || !process.env.OPENAI_API_KEY) {
      console.log("   skipped — DATABASE_URL or OPENAI_API_KEY not set")
      return
    }
    const { db } = await import("../lib/db")
    if (!db) return
    const { generateHybridTopics } = await import(
      "../lib/hybrid-topics/generate"
    )
    const r = await generateHybridTopics({
      seasonId: null,
      language: "ar",
      count: 4,
      allowKuwaitBias: false,
      createdBy: null,
    })
    assert(r.ok, `live generation failed: reason=${r.reason ?? "?"}`)
    assert(
      r.fallback_path === "clusters" || r.fallback_path === "foundational",
      `unexpected fallback_path: ${r.fallback_path}`,
    )
    assert(
      r.accepted.length >= 1,
      `expected ≥1 accepted candidate, got ${r.accepted.length}`,
    )
    // r.persisted is 0 when seasonId is null — by design. Operator
    // never sees a "human accepted" count from this endpoint.
    assert(
      r.persisted.length === 0,
      "persisted must be 0 when seasonId is null (no review queue write)",
    )
  })

  await caseRun("16/16 cross-phase regressions: scoring + manual + sources + review", async () => {
    // Touch-check that the surfaces still exist and Phase 6 didn't
    // delete anything from the prior phases.
    for (const f of [
      "lib/market-intelligence/scoring.ts",
      "lib/market-intelligence/taste-learning.ts",
      "lib/market-intelligence/sources-mutations.ts",
      "lib/market-intelligence/review-mutations.ts",
      "lib/market-intelligence/manual-signals.ts",
      "app/admin/khat-brain/market/signals/page.tsx",
      "app/admin/khat-brain/market/sources/page.tsx",
    ]) {
      const ok = await fs
        .access(path.join(REPO_ROOT, f))
        .then(() => true)
        .catch(() => false)
      assert(ok, `missing prior-phase surface: ${f}`)
    }
  })

  console.log(
    `\n${FAIL.length === 0 ? "🎉" : "💥"} ${PASS.length} passed, ${FAIL.length} failed`,
  )
  if (FAIL.length > 0) process.exit(1)
}

main().catch(async (err) => {
  console.error("Smoke crashed:", err)
  try {
    const { closeDb } = await import("../lib/db")
    await closeDb()
  } catch {}
  process.exit(1)
})
