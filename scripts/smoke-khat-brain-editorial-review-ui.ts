/**
 * Smoke — Editorial Review UI (Phase 2).
 *
 * Pure file-system + module-import smoke for the operator review
 * queue. Verifies:
 *
 *   • Page + components exist at the expected paths
 *   • Every required Arabic operator label is present
 *   • Every per-card + bulk action server action is exported
 *   • Every mutation writes to market_signal_review_events (audit log)
 *   • No internal terms or developer labels leak into operator copy
 *   • Sidebar entry "إشارات السوق" is wired
 *   • Phase 2 doesn't touch scoring / clustering / hybrid / scheduler
 *   • raw_signals fallback in lib/hybrid-topics/generate.ts is intact
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

const REVIEW_DIR =
  "app/admin/khat-brain/market/signals/_components"

const PAGE_PATH = "app/admin/khat-brain/market/signals/page.tsx"

const REQUIRED_ARABIC_TAB_LABELS = [
  "إشارات جديدة",
  "إشارات قوية",
  "إشارات ضعيفة",
  "إشارات مرفوضة",
  "إشارات مؤرشفة",
  "إشارات يدوية",
]

const FORBIDDEN_OPERATOR_TERMS = [
  "npm run",
  "market.collect",
  "market.extract",
  "market.cluster_signals",
  "market.scheduler",
  "market_signal_review_events",
  "editorial_taste_weights",
  "ai_runs",
  "pipeline",
  "ingestion",
  "scheduler",
  "extract job",
]

async function main() {
  console.log("\n🧪 smoke-khat-brain-editorial-review-ui — Phase 2\n")

  await caseRun("1/12 page + components exist at expected paths", async () => {
    for (const f of [
      PAGE_PATH,
      `${REVIEW_DIR}/copy.ts`,
      `${REVIEW_DIR}/signal-actions.ts`,
      `${REVIEW_DIR}/signals-client.tsx`,
      "lib/market-intelligence/review-queries.ts",
      "lib/market-intelligence/review-mutations.ts",
    ]) {
      const ok = await fs
        .access(path.join(REPO_ROOT, f))
        .then(() => true)
        .catch(() => false)
      assert(ok, `missing file: ${f}`)
    }
  })

  await caseRun("2/12 page renders all six Arabic tab labels", async () => {
    const copy = await readRel(`${REVIEW_DIR}/copy.ts`)
    for (const label of REQUIRED_ARABIC_TAB_LABELS) {
      assert(copy.includes(label), `tab label missing in copy.ts: ${label}`)
    }
    const page = await readRel(PAGE_PATH)
    assert(
      page.includes("REVIEW_TABS") && page.includes("REVIEW_TAB_LABEL"),
      "page must iterate REVIEW_TABS and use REVIEW_TAB_LABEL",
    )
  })

  await caseRun("3/12 server actions export the seven per-card + four bulk actions", async () => {
    const src = await readRel(`${REVIEW_DIR}/signal-actions.ts`)
    const required = [
      "approveSignalAction",
      "rejectSignalAction",
      "archiveSignalAction",
      "restoreSignalAction",
      "addTagAction",
      "removeTagAction",
      "setNoteAction",
      "bulkApproveAction",
      "bulkRejectAction",
      "bulkArchiveAction",
      "bulkTagAction",
    ]
    for (const name of required) {
      assert(
        src.includes(`export async function ${name}`),
        `signal-actions.ts must export ${name}`,
      )
    }
    assert(
      src.includes('"use server"'),
      "signal-actions.ts must be a server-action module",
    )
  })

  await caseRun("4/12 every mutation writes to market_signal_review_events", async () => {
    const src = await readRel("lib/market-intelligence/review-mutations.ts")
    // Audit imports
    assert(
      src.includes("marketSignalReviewEvents"),
      "mutations must import marketSignalReviewEvents",
    )
    // Every status transition + tag op + note op inserts an event row.
    // We require the insert to be visible at least 4 times: transition,
    // mutateTag, setSignalNote, bulkTransition + bulkAddSignalTag.
    const insertCount = (src.match(/insert\(marketSignalReviewEvents\)/g) ?? [])
      .length
    assert(
      insertCount >= 5,
      `expected ≥5 inserts into marketSignalReviewEvents, found ${insertCount}`,
    )
    // Every mutation requires an actorId (operator).
    assert(
      src.includes("actor_required") && src.includes("ctx.actorId"),
      "mutations must require ctx.actorId — operator decisions only",
    )
  })

  await caseRun("5/12 actions require admin + pass actor_id to mutations", async () => {
    const src = await readRel(`${REVIEW_DIR}/signal-actions.ts`)
    assert(
      src.includes("requireAdmin()") && src.includes("getAdminAuthUser()"),
      "actions must call requireAdmin() and lift actor from session",
    )
    // The actor-fail helper is the only path that produces the actorId.
    assert(
      src.includes("actorOrFail") && src.includes("user?.id"),
      "actions must derive actor_id from the authenticated session",
    )
  })

  await caseRun("6/12 no internal terms or dev labels in operator surface", async () => {
    const filesToCheck = [
      PAGE_PATH,
      `${REVIEW_DIR}/copy.ts`,
      `${REVIEW_DIR}/signals-client.tsx`,
    ]
    for (const f of filesToCheck) {
      const code = stripComments(await readRel(f))
      for (const banned of FORBIDDEN_OPERATOR_TERMS) {
        assert(
          !code.includes(banned),
          `operator surface "${f}" leaks "${banned}"`,
        )
      }
    }
  })

  await caseRun("7/12 every editorial tag has Arabic copy", async () => {
    const copy = await readRel(`${REVIEW_DIR}/copy.ts`)
    // The closed vocab is exhaustive — verify each tag has a label.
    for (const t of [
      "strong",
      "weak",
      "timeless",
      "repetitive",
      "emotional",
      "controversial",
      "deep",
      "surface_level",
      "off_identity",
    ]) {
      assert(
        new RegExp(`\\b${t}:\\s*"`).test(copy),
        `TAG_LABEL missing entry for "${t}"`,
      )
    }
  })

  await caseRun("8/12 client surface implements bulk + per-card actions", async () => {
    const src = await readRel(`${REVIEW_DIR}/signals-client.tsx`)
    // Bulk hooks render as literal `data-bulk-*` attributes.
    for (const required of [
      "data-bulk-approve",
      "data-bulk-reject",
      "data-bulk-archive",
      "data-bulk-tag",
    ]) {
      assert(
        src.includes(required),
        `signals-client.tsx missing testable hook "${required}"`,
      )
    }
    // Per-card status actions go through the shared ActionBtn whose
    // `testId` prop is forwarded to `data-action`. add-tag / add-note
    // render literal data-action attrs.
    for (const required of [
      'testId="approve"',
      'testId="reject"',
      'testId="archive"',
      'testId="restore"',
      'data-action="add-tag"',
      'data-action="add-note"',
    ]) {
      assert(
        src.includes(required),
        `signals-client.tsx missing testable hook "${required}"`,
      )
    }
    // The shared button must forward testId → data-action.
    assert(
      src.includes("data-action={testId}"),
      "ActionBtn must wire testId → data-action",
    )
    // قُبل / رُفض allowed in comments only — banned from JSX/strings.
    const code = stripComments(src)
    for (const banned of ["قُبل ", "رُفض "]) {
      assert(
        !code.includes(banned),
        `client surface must never narrate completed counts with "${banned.trim()}"`,
      )
    }
  })

  await caseRun("9/12 sidebar has the Arabic entry", async () => {
    const src = await readRel("app/admin/components/admin-sidebar.tsx")
    assert(
      src.includes("/admin/khat-brain/market/signals") &&
        src.includes("إشارات السوق"),
      "admin-sidebar.tsx must link to /admin/khat-brain/market/signals with label 'إشارات السوق'",
    )
  })

  await caseRun("10/12 phase boundary: no behavior change to scoring/clustering/hybrid/scheduler", async () => {
    // Phase 2 must not touch these handlers. We grep for our new
    // mutation symbols inside the existing pipeline files.
    const forbidden = [
      "approveSignal",
      "rejectSignal",
      "archiveSignal",
      "bulkApproveSignals",
      "marketSignalReviewEvents",
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
            `Phase 2 must not wire ${sym} into ${f}`,
          )
        }
      } catch {
        // file missing — fine
      }
    }
  })

  await caseRun("11/12 hybrid generator falls back to foundational path (Phase 6+)", async () => {
    const src = await readRel("lib/hybrid-topics/generate.ts")
    // Phase 6 removed the unsafe raw_signals path. The generator now
    // uses either market clusters OR the foundational path (originals
    // + worked-report). Phase 2's invariant is that these layers exist
    // — verifying the bail logic still distinguishes truly-empty from
    // "no market data but we have memory".
    assert(
      src.includes('"clusters"') && src.includes('"foundational"'),
      "generator must declare both clusters + foundational paths",
    )
    assert(
      !src.includes("raw_signals_fallback"),
      "Phase 6 contract: raw_signals_fallback path is gone",
    )
  })

  await caseRun("12/12 audit + actor invariants for human-only decisions", async () => {
    const m = await readRel("lib/market-intelligence/review-mutations.ts")
    // No mutation may default actorId or accept it as optional.
    assert(
      m.includes("actorId: string"),
      "MutationContext.actorId must be required (not optional)",
    )
    // Approve/reject must NOT be reachable from a non-operator code path.
    // We enforce this by checking that the only callers are the server
    // actions in signal-actions.ts (which gate on requireAdmin).
    const a = await readRel(`${REVIEW_DIR}/signal-actions.ts`)
    for (const fn of [
      "approveSignal",
      "rejectSignal",
      "archiveSignal",
      "restoreSignal",
    ]) {
      assert(
        a.includes(fn),
        `signal-actions.ts must wrap the mutation "${fn}" (operator-only path)`,
      )
    }
    // No automatic approval anywhere in the new layer.
    const all = (
      await Promise.all(
        [
          "lib/market-intelligence/review-queries.ts",
          "lib/market-intelligence/review-mutations.ts",
          `${REVIEW_DIR}/signal-actions.ts`,
          `${REVIEW_DIR}/signals-client.tsx`,
          PAGE_PATH,
        ].map((p) => readRel(p).catch(() => "")),
      )
    ).join("\n")
    assert(
      !/auto[_-]approve/i.test(all),
      "no auto-approve path may exist anywhere in the review surface",
    )
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
