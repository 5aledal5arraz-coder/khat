/**
 * Smoke — Scoring + Learning (Phase 5).
 *
 * Mixed static + live tests:
 *   • Scoring module is pure math + exports the expected shape
 *   • Taste-learning module enforces safety rails (clamp, EMA, decay)
 *   • Job handlers registered (market.score_signals + market.taste_decay)
 *   • Scheduler chains scoring after extract
 *   • UI surfaces Arabic copy only; no internal terms leak
 *   • Manual-signal action enqueues scoring
 *   • LIVE: score one signal end-to-end against the real DB
 *   • LIVE: a review event softly bumps a taste weight
 *   • LIVE: decay tick clamps + resets sub-threshold weights
 *   • Phase boundary: hybrid generator + clustering unchanged
 *   • raw_signals fallback intact
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

const COMP_DIR = "app/admin/khat-brain/market/signals/_components"

/** Strings the operator should NEVER see. These are checked against
 *  JSX/string content, not TypeScript identifiers — column names like
 *  `signal_score` and `score_components` legitimately appear as object
 *  field accesses in client code (the operator never reads the source). */
const FORBIDDEN_INTERNAL = [
  "npm run",
  "market.collect",
  "market.extract",
  "market.cluster_signals",
  "market.scheduler",
  "market.score_signals",
  "market.taste_decay",
  "market_topic_signals",
  "editorial_taste_weights",
  "ingestion",
  "pipeline",
]

async function main() {
  console.log("\n🧪 smoke-khat-brain-editorial-scoring-learning — Phase 5\n")
  loadEnv()

  await caseRun("1/16 scoring + learning + handler files exist", async () => {
    for (const f of [
      "lib/market-intelligence/scoring.ts",
      "lib/market-intelligence/taste-learning.ts",
      "lib/jobs/handlers/market-scoring.ts",
      `${COMP_DIR}/score-explanation.ts`,
      `${COMP_DIR}/refresh-scoring-action.ts`,
      `${COMP_DIR}/refresh-scoring-button.tsx`,
    ]) {
      const ok = await fs
        .access(path.join(REPO_ROOT, f))
        .then(() => true)
        .catch(() => false)
      assert(ok, `missing file: ${f}`)
    }
  })

  await caseRun("2/16 scoring is pure math + clamps to [0,1]", async () => {
    const mod = await import("../lib/market-intelligence/scoring")
    assert(typeof mod.scoreSignal === "function", "scoreSignal not exported")
    assert(typeof mod.scoreBatch === "function", "scoreBatch not exported")
    assert(typeof mod.clamp01 === "function", "clamp01 not exported")

    // Empty lookup tables.
    const taste = {
      byTheme: new Map(),
      bySource: new Map(),
      byLanguage: new Map(),
      byTag: new Map(),
    }
    const baseline = mod.scoreSignal(
      {
        id: "t1",
        collected_at: new Date().toISOString(),
        review_status: "new",
        editorial_tags: [],
        operator_created: false,
        view_signal: null,
        controversy_score: null,
        theme: null,
        language: "ar",
        trusted_source_trust: null,
        trusted_source_alignment: null,
        trusted_source_id: null,
      },
      taste,
    )
    assert(
      baseline.signal_score >= 0 && baseline.signal_score <= 1,
      "score must be in [0, 1]",
    )

    // Operator-created + approved + tag boost should score significantly higher.
    const lifted = mod.scoreSignal(
      {
        id: "t2",
        collected_at: new Date().toISOString(),
        review_status: "approved",
        editorial_tags: ["strong", "timeless", "deep"],
        operator_created: true,
        view_signal: 100_000,
        controversy_score: 0.5,
        theme: "identity_fragments",
        language: "ar",
        trusted_source_trust: 0.9,
        trusted_source_alignment: 0.9,
        trusted_source_id: "src1",
      },
      taste,
    )
    assert(
      lifted.signal_score > baseline.signal_score,
      `lifted score (${lifted.signal_score}) must beat baseline (${baseline.signal_score})`,
    )
    assert(
      lifted.signal_score <= 1,
      "lifted score still capped at 1",
    )
    // score_components written + has expected keys
    for (const key of [
      "source_trust",
      "editorial_alignment",
      "review_status",
      "operator_created",
      "recency",
      "popularity",
      "controversy",
      "taste_match",
      "tag_adjust",
    ]) {
      assert(
        key in lifted.score_components,
        `score_components missing key "${key}"`,
      )
    }
  })

  await caseRun("3/16 controversy is capped — never the deciding factor", async () => {
    const mod = await import("../lib/market-intelligence/scoring")
    const taste = {
      byTheme: new Map(),
      bySource: new Map(),
      byLanguage: new Map(),
      byTag: new Map(),
    }
    // Pure-controversy signal: zero on everything else.
    const r = mod.scoreSignal(
      {
        id: "t3",
        collected_at: new Date(Date.now() - 200 * 86400_000).toISOString(),
        review_status: "archived",
        editorial_tags: [],
        operator_created: false,
        view_signal: null,
        controversy_score: 1,
        theme: null,
        language: "ar",
        trusted_source_trust: null,
        trusted_source_alignment: null,
        trusted_source_id: null,
      },
      taste,
    )
    // Controversy weight is 0.05 — max contribution 0.05. Score must
    // not approach 1 just because controversy is high.
    assert(
      r.signal_score < 0.3,
      `controversy alone must not lift score above 0.3 (got ${r.signal_score})`,
    )
    assert(
      r.score_components.controversy <= 0.05,
      "controversy contribution must be capped at SCORE_WEIGHTS.controversy",
    )
  })

  await caseRun("4/16 taste-learning rails: clamp/EMA/decay constants", async () => {
    const mod = await import("../lib/market-intelligence/taste-learning")
    assert(
      mod.TASTE_EMA_ALPHA <= 0.5 && mod.TASTE_EMA_ALPHA > 0,
      "EMA alpha must be small + positive",
    )
    assert(
      mod.TASTE_DECAY_FACTOR < 1 && mod.TASTE_DECAY_FACTOR > 0.9,
      "decay factor must shrink weights but slowly (0.9 < f < 1)",
    )
    assert(
      mod.TASTE_DECAY_RESET_THRESHOLD > 0 && mod.TASTE_DECAY_RESET_THRESHOLD < 0.1,
      "reset threshold must be a small positive value",
    )
    // Per-event deltas exist for every closed-vocab action.
    for (const a of ["approve", "reject", "archive", "restore", "create", "tag", "untag", "note"]) {
      assert(
        a in mod.REVIEW_EVENT_DELTAS,
        `REVIEW_EVENT_DELTAS missing "${a}"`,
      )
    }
    // create > approve — operator-authored carries slight extra weight.
    assert(
      mod.REVIEW_EVENT_DELTAS.create > mod.REVIEW_EVENT_DELTAS.approve,
      "operator-created delta must exceed approve delta",
    )
    // No single delta crosses 0.10 in absolute value.
    for (const [k, v] of Object.entries(mod.REVIEW_EVENT_DELTAS)) {
      assert(
        Math.abs(v as number) <= 0.10,
        `delta ${k}=${v} exceeds safety cap 0.10`,
      )
    }
  })

  await caseRun("5/16 job handlers registered", async () => {
    // Importing the registered barrel pulls scoring handlers in via
    // side-effect registration. We verify by reading the file list.
    const registered = await readRel("lib/jobs/registered.ts")
    assert(
      registered.includes('"./handlers/market-scoring"'),
      "lib/jobs/registered.ts must import ./handlers/market-scoring",
    )
    const handler = await readRel("lib/jobs/handlers/market-scoring.ts")
    assert(
      handler.includes('"market.score_signals"') &&
        handler.includes('"market.taste_decay"'),
      "market-scoring handler must register both job types",
    )
  })

  await caseRun("6/16 scoring chained after market.extract", async () => {
    const src = await readRel("lib/jobs/handlers/market-intelligence.ts")
    // extract handler must auto-enqueue score_signals alongside cluster.
    assert(
      src.includes('enqueueJob(\n      "market.score_signals"') ||
        src.includes('enqueueJob(\n      "market.score_signals",'),
      "market.extract must auto-enqueue market.score_signals",
    )
    // scheduler must enqueue daily taste decay.
    assert(
      src.includes('"market.taste_decay"'),
      "market.scheduler must wire daily taste_decay enqueue",
    )
  })

  await caseRun("7/16 review mutations feed soft learning", async () => {
    const src = await readRel("lib/market-intelligence/review-mutations.ts")
    assert(
      src.includes("applyReviewEventLearning") &&
        src.includes("pushLearning"),
      "mutations must call applyReviewEventLearning via pushLearning helper",
    )
    // Every per-signal mutation must wrap pushLearning (4 status + 2 tag).
    for (const fn of [
      "transitionWithLearning",
      "addSignalTag",
      "removeSignalTag",
      "bulkTransitionWithLearning",
    ]) {
      assert(src.includes(fn), `learning hook missing for "${fn}"`)
    }
    // Manual signal also feeds learning.
    const manual = await readRel("lib/market-intelligence/manual-signals.ts")
    assert(
      manual.includes("applyReviewEventLearning"),
      "manual-signals.ts must call applyReviewEventLearning",
    )
  })

  await caseRun("8/16 manual signal action enqueues scoring", async () => {
    const src = await readRel(`${COMP_DIR}/manual-signal-actions.ts`)
    assert(
      src.includes('"market.score_signals"'),
      "manual signal action must enqueue market.score_signals after a successful insert",
    )
  })

  await caseRun("9/16 UI shows قوة الإشارة + سبب التقييم", async () => {
    const src = await readRel(`${COMP_DIR}/signals-client.tsx`)
    assert(src.includes("قوة الإشارة"), "missing 'قوة الإشارة' badge label")
    assert(src.includes("سبب التقييم"), "missing 'سبب التقييم' explanation label")
    // Score badge component declared.
    assert(
      src.includes("function ScoreBadge"),
      "ScoreBadge component must exist",
    )
    // Refresh button mounted on the page.
    const page = await readRel(
      "app/admin/khat-brain/market/signals/page.tsx",
    )
    assert(
      page.includes("RefreshScoringButton"),
      "signals page must mount RefreshScoringButton",
    )
    // Button uses operator label.
    const button = await readRel(`${COMP_DIR}/refresh-scoring-button.tsx`)
    assert(
      button.includes("تحديث تقييم الإشارات"),
      "refresh button must show 'تحديث تقييم الإشارات' label",
    )
  })

  await caseRun("10/16 no internal terms leak in operator surface", async () => {
    // Operator-visible files only — server action modules legitimately
    // reference job names (`market.score_signals`) and column names
    // for their internal logic; those never reach the browser.
    const surfaces = [
      `${COMP_DIR}/signals-client.tsx`,
      `${COMP_DIR}/score-explanation.ts`,
      `${COMP_DIR}/refresh-scoring-button.tsx`,
    ]
    for (const f of surfaces) {
      const code = stripComments(await readRel(f))
      const noImports = code.replace(/^import.+$/gm, "")
      for (const banned of FORBIDDEN_INTERNAL) {
        assert(
          !noImports.includes(banned),
          `operator surface "${f}" leaks "${banned}"`,
        )
      }
    }
  })

  await caseRun("11/16 Phase 5 scoring + Phase 6 integration both present", async () => {
    // Phase 6 lifts the Phase 5 ban: clustering now reads signal_score
    // + editorial-decision columns; the hybrid generator now uses
    // editorial_taste_weights via loadTasteLookup().
    const cluster = await readRel("lib/market-intelligence/clustering.ts")
    assert(
      cluster.includes("signal_score") &&
        cluster.includes("review_status") &&
        cluster.includes("editorial_tags"),
      "clustering.ts must consume the Phase 5 editorial columns",
    )
    const inputs = await readRel("lib/hybrid-topics/inputs.ts")
    assert(
      inputs.includes("loadTasteLookup") && inputs.includes("taste_hints"),
      "hybrid inputs must load + surface taste weights",
    )
  })

  await caseRun("12/16 hybrid generator uses Phase 6 paths + earlier-phase surfaces intact", async () => {
    const gen = await readRel("lib/hybrid-topics/generate.ts")
    assert(
      gen.includes('"clusters"') && gen.includes('"foundational"'),
      "generator must declare clusters + foundational paths (Phase 6 contract)",
    )
    assert(
      !gen.includes("raw_signals_fallback"),
      "Phase 6 contract: raw_signals_fallback path is gone",
    )
    const review = await readRel(`${COMP_DIR}/signals-client.tsx`)
    for (const hook of [
      "data-bulk-approve",
      "data-bulk-reject",
      "data-bulk-archive",
      "data-bulk-tag",
    ]) {
      assert(review.includes(hook), `Phase 2 hook ${hook} missing`)
    }
  })

  await caseRun("13/16 LIVE: score one signal end-to-end against real DB", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("   skipped — DATABASE_URL not set")
      return
    }
    const { db } = await import("../lib/db")
    if (!db) {
      console.log("   skipped — db unavailable")
      return
    }
    {
      const { createManualSignal } = await import(
        "../lib/market-intelligence/manual-signals"
      )
      const { sql } = await import("drizzle-orm")
      const stamp = Date.now()
      const r = await createManualSignal(
        {
          title: `إشارة تقييم ${stamp}`,
          summary: `محتوى تقييم ${stamp}`,
          manual_kind: "observation",
          language: "ar",
          theme: "identity_fragments",
          editorial_tags: ["strong", "timeless"],
        },
        { actorId: "smoke-phase-5" },
      )
      assert(r.ok, `seed create failed`)
      const seed = (r as { ok: true; data: { signal_id: string } }).data

      try {
        const { scoreSignal } = await import("../lib/market-intelligence/scoring")
        const { loadTasteLookup } = await import(
          "../lib/market-intelligence/taste-learning"
        )
        const taste = await loadTasteLookup()
        const [row] = await db.execute(sql`
          SELECT id, collected_at::text AS collected_at, review_status,
            COALESCE(editorial_tags, '[]'::jsonb) AS editorial_tags,
            operator_created, view_signal, controversy_score, theme, language,
            trusted_source_id, NULL::real AS trust_score,
            NULL::real AS editorial_alignment_score
          FROM market_topic_signals WHERE id = ${seed.signal_id}
        `).then((res) => res.rows as any[])
        const scored = scoreSignal(
          {
            id: row.id,
            collected_at: row.collected_at,
            review_status: row.review_status,
            editorial_tags: Array.isArray(row.editorial_tags)
              ? row.editorial_tags
              : [],
            operator_created: row.operator_created === true,
            view_signal: row.view_signal,
            controversy_score: row.controversy_score,
            theme: row.theme,
            language: row.language,
            trusted_source_trust: null,
            trusted_source_alignment: null,
            trusted_source_id: row.trusted_source_id,
          },
          taste,
        )
        assert(
          scored.signal_score > 0,
          `seed score should be > 0 (operator_created + approved + strong/timeless)`,
        )
        assert(
          scored.score_components.operator_created > 0,
          "operator_created component must be > 0 for manual signals",
        )
        // Persist + read back.
        await db.execute(sql`
          UPDATE market_topic_signals
             SET signal_score = ${scored.signal_score},
                 score_components = ${JSON.stringify(scored.score_components)}::jsonb
           WHERE id = ${seed.signal_id}
        `)
        const reread = await db.execute(sql`
          SELECT signal_score, score_components
          FROM market_topic_signals WHERE id = ${seed.signal_id}
        `)
        const persisted = reread.rows[0] as Record<string, unknown>
        assert(
          Math.abs(Number(persisted.signal_score) - scored.signal_score) < 0.001,
          "persisted signal_score must match computed value",
        )
        assert(
          persisted.score_components &&
            typeof persisted.score_components === "object",
          "score_components JSON must be persisted",
        )
      } finally {
        await db.execute(sql`
          DELETE FROM market_signal_review_events WHERE signal_id = ${seed.signal_id}
        `)
        await db.execute(sql`
          DELETE FROM market_topic_signals WHERE id = ${seed.signal_id}
        `)
      }
    }
  })

  await caseRun("14/16 LIVE: review event softly bumps a taste weight", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("   skipped — DATABASE_URL not set")
      return
    }
    const { db } = await import("../lib/db")
    if (!db) {
      console.log("   skipped — db unavailable")
      return
    }
    {
      const { sql } = await import("drizzle-orm")
      const { applyReviewEventLearning } = await import(
        "../lib/market-intelligence/taste-learning"
      )
      const themeKey = `smoke_phase5_theme_${Date.now()}`
      // Ensure clean state.
      await db.execute(sql`DELETE FROM editorial_taste_weights WHERE key = ${themeKey}`)
      try {
        await applyReviewEventLearning({
          action: "approve",
          ctx: {
            theme: themeKey,
            language: "ar",
            trusted_source_id: null,
            operator_created: false,
          },
        })
        const row = await db.execute(sql`
          SELECT weight, sample_size
          FROM editorial_taste_weights
          WHERE dimension='theme' AND key=${themeKey}
        `)
        assert(row.rows.length === 1, "approve must upsert exactly one row")
        const r = row.rows[0] as Record<string, unknown>
        const weight = Number(r.weight)
        assert(
          weight > 0 && weight <= 0.10,
          `approve weight (${weight}) must be small positive (≤ 0.10)`,
        )
        // A second approve should grow the weight further but stay clamped.
        await applyReviewEventLearning({
          action: "approve",
          ctx: {
            theme: themeKey,
            language: "ar",
            trusted_source_id: null,
            operator_created: false,
          },
        })
        const row2 = await db.execute(sql`
          SELECT weight, sample_size
          FROM editorial_taste_weights
          WHERE dimension='theme' AND key=${themeKey}
        `)
        const r2 = row2.rows[0] as Record<string, unknown>
        const weight2 = Number(r2.weight)
        assert(
          weight2 >= weight,
          "successive approves must compound (or saturate)",
        )
        assert(weight2 <= 1, "weight must stay clamped to ≤ 1")
        assert(
          Number(r2.sample_size) === 2,
          `sample_size must be 2 (got ${r2.sample_size})`,
        )
      } finally {
        await db.execute(sql`DELETE FROM editorial_taste_weights WHERE key = ${themeKey}`)
      }
    }
  })

  await caseRun("15/16 LIVE: decay tick fades weights + zeros sub-threshold", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("   skipped — DATABASE_URL not set")
      return
    }
    const { db } = await import("../lib/db")
    if (!db) {
      console.log("   skipped — db unavailable")
      return
    }
    {
      const { sql } = await import("drizzle-orm")
      const { runTasteDecay, TASTE_DECAY_FACTOR, TASTE_DECAY_RESET_THRESHOLD } =
        await import("../lib/market-intelligence/taste-learning")
      const k1 = `decay_strong_${Date.now()}`
      const k2 = `decay_weak_${Date.now()}`
      // Seed: one weight comfortably above the reset threshold, one
      // just below where decay would push it to zero.
      const justAboveThreshold = TASTE_DECAY_RESET_THRESHOLD / TASTE_DECAY_FACTOR + 0.001
      await db.execute(sql`
        INSERT INTO editorial_taste_weights (dimension, key, weight, sample_size)
        VALUES ('theme', ${k1}, 0.8, 5),
               ('theme', ${k2}, ${TASTE_DECAY_RESET_THRESHOLD * 0.9}, 5)
        ON CONFLICT (dimension, key) DO UPDATE SET weight = EXCLUDED.weight
      `)
      void justAboveThreshold
      try {
        await runTasteDecay()
        const rows = await db.execute(sql`
          SELECT key, weight FROM editorial_taste_weights
          WHERE key IN (${k1}, ${k2})
          ORDER BY key
        `)
        const map = new Map<string, number>()
        for (const row of rows.rows as any[]) {
          map.set(row.key, Number(row.weight))
        }
        const strong = map.get(k1)!
        const weak = map.get(k2)!
        assert(
          strong < 0.8 && strong > 0,
          `strong weight should have faded but stayed non-zero (got ${strong})`,
        )
        assert(
          weak === 0,
          `sub-threshold weight should snap to zero (got ${weak})`,
        )
      } finally {
        await db.execute(sql`DELETE FROM editorial_taste_weights WHERE key IN (${k1}, ${k2})`)
      }
    }
  })

  await caseRun("16/16 manual influence capped (single create ≤ 0.10 weight)", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("   skipped — DATABASE_URL not set")
      return
    }
    const { db } = await import("../lib/db")
    if (!db) {
      console.log("   skipped — db unavailable")
      return
    }
    {
      const { sql } = await import("drizzle-orm")
      const { applyReviewEventLearning } = await import(
        "../lib/market-intelligence/taste-learning"
      )
      const themeKey = `cap_test_${Date.now()}`
      await db.execute(sql`DELETE FROM editorial_taste_weights WHERE key = ${themeKey}`)
      try {
        await applyReviewEventLearning({
          action: "create",
          ctx: {
            theme: themeKey,
            language: "ar",
            trusted_source_id: null,
            operator_created: true,
          },
        })
        const r = await db.execute(sql`
          SELECT weight FROM editorial_taste_weights
          WHERE dimension='theme' AND key=${themeKey}
        `)
        assert(r.rows.length === 1, "create must seed a row")
        const w = Number((r.rows[0] as { weight?: number }).weight ?? 0)
        // Even an operator-create gets a small EMA blend, capped at ≤ 0.10.
        assert(
          w > 0 && w <= 0.10,
          `create weight (${w}) must be small positive and ≤ 0.10`,
        )
      } finally {
        await db.execute(sql`DELETE FROM editorial_taste_weights WHERE key = ${themeKey}`)
      }
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
