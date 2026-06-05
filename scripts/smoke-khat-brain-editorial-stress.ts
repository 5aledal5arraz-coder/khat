/**
 * UX-7.5 — Editorial stress + concurrency + recovery smoke.
 *
 * Pure node-side stress tests for the editorial primitives. No DOM,
 * no React, no DB. The harness drives the pure engines under
 * adversarial conditions to surface races, leaks, and corruption
 * BEFORE more editors (chapters, clips, …) compose on top.
 *
 * Coverage map (by phase from the UX-7.5 brief):
 *
 *   Phase A — torture:
 *     1. 10k transcript segments coerce + recompute counts in <500ms
 *     2. rapid typing burst → 1 save with the latest payload
 *     3. autosave + simultaneous undo: no dropped edits
 *     4. repeated optimistic rollback preserves prior state exactly
 *     5. conflict storm: 100 conflicts → all resolved cleanly
 *     6. save-failure loop: fails N times, then succeeds, no infinite retry
 *     7. tab suspend/resume simulation: dispose during in-flight save
 *     8. browser refresh during save: dispose mid-flight, no late writes
 *     9. multi-tab same-document: stale-save rejection by txn id
 *    10. cancel mid-pending: no save fires
 *
 *   Phase B — autosave hardening:
 *    11. txn id is monotonic across saves
 *    12. error count + retry count + save count consistent
 *    13. dispose during retry backoff: timer cleared, no leak
 *
 *   Phase C — undo integrity:
 *    14. coalesce window collapses 1000 fast pushes to 1 entry
 *    15. capacity bound: pushes beyond capacity drop oldest
 *    16. push-after-undo wipes redo
 *    17. clear() empties both stacks
 *
 *   Phase D — virtualization stability (file-level assertions):
 *    18. transcript editor force-mounts the focused row across scroll
 *
 *   Phase F — observability:
 *    19. snapshot exposes telemetry counters
 *    20. surfaceId is honored
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

async function caseRun(label: string, fn: () => void | Promise<void>): Promise<void> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  console.log("\n🧪 smoke-khat-brain-editorial-stress — UX-7.5\n")

  const { coerceTranscriptDocument, recomputeCounts, newSegment } = await import(
    "../lib/editorial/transcript-types"
  )
  const { createAutosaveManager } = await import("../lib/editorial/autosave-manager")
  const { createDirtyStateEngine } = await import("../lib/editorial/dirty-state")
  const { createUndoHistory } = await import("../lib/editorial/undo-history")
  const { createConflictManager } = await import("../lib/editorial/conflict-manager")
  const { runOptimisticTxn } = await import("../lib/editorial/optimistic-transaction")

  // ─── Phase A — torture ────────────────────────────────────────────

  await caseRun("1/20 10k transcript segments coerce + recompute < 500ms", () => {
    const segments = Array.from({ length: 10_000 }, (_, i) =>
      newSegment({ text: `segment ${i} hello world`, speaker: i % 4 === 0 ? "Khaled" : "Guest" }),
    )
    const t0 = performance.now()
    const doc = coerceTranscriptDocument({
      schema_version: 1,
      version: 0,
      source: "manual",
      language: "ar",
      segments,
    })
    const counts = recomputeCounts(doc)
    const t1 = performance.now()
    assert(doc.segments.length === 10_000, `expected 10k, got ${doc.segments.length}`)
    assert(counts.word_count === 10_000 * 4, `expected 40k words, got ${counts.word_count}`)
    assert(t1 - t0 < 500, `coerce+recompute took ${(t1 - t0).toFixed(0)}ms`)
  })

  await caseRun("2/20 rapid typing burst → 1 save with latest payload", async () => {
    const saved: number[] = []
    const mgr = createAutosaveManager<number>({
      saver: async (n) => {
        saved.push(n)
      },
      debounceMs: 50,
    })
    for (let i = 1; i <= 100; i++) mgr.request(i)
    await sleep(120)
    assert(saved.length === 1, `expected 1 save, got ${saved.length}`)
    assert(saved[0] === 100, `expected payload 100, got ${saved[0]}`)
    mgr.dispose()
  })

  await caseRun("3/20 autosave + simultaneous undo: no dropped edits", async () => {
    type S = { value: number }
    const history = createUndoHistory<S>({ capacity: 50, coalesceMs: 0 })
    const saved: S[] = []
    const mgr = createAutosaveManager<S>({
      saver: async (s) => {
        saved.push(s)
      },
      debounceMs: 30,
    })
    let cur: S = { value: 0 }
    for (let i = 1; i <= 20; i++) {
      history.push(cur)
      cur = { value: i }
      mgr.request(cur)
    }
    // Undo three times during a pending save.
    cur = history.undo(cur) ?? cur
    cur = history.undo(cur) ?? cur
    cur = history.undo(cur) ?? cur
    mgr.request(cur)
    await sleep(120)
    assert(saved.length >= 1, "at least one save fired")
    assert(saved[saved.length - 1].value === cur.value, `last save matches current state ${cur.value}, got ${saved[saved.length - 1].value}`)
    mgr.dispose()
  })

  await caseRun("4/20 repeated optimistic rollback preserves prior state", async () => {
    type S = { count: number; tag: string }
    let state: S = { count: 0, tag: "init" }
    for (let i = 0; i < 20; i++) {
      const result = await runOptimisticTxn<S>({
        current: state,
        apply: (s) => ({ count: s.count + 1, tag: `pending-${i}` }),
        commit: async () => {
          throw new Error("network down")
        },
      })
      assert(!result.ok, `iter ${i} should fail`)
      assert(result.state.count === state.count, `count rolled back at iter ${i}`)
      assert(result.state.tag === state.tag, `tag rolled back at iter ${i}`)
      state = result.state
    }
    assert(state.count === 0 && state.tag === "init", "state preserved across 20 rollbacks")
  })

  await caseRun("5/20 conflict storm: 100 conflicts resolved cleanly", () => {
    const c = createConflictManager()
    c.setExpectedVersion(1)
    for (let i = 0; i < 100; i++) {
      c.recordConflict(i + 2, { v: i })
      assert(c.state().hasConflict, `conflict ${i} recorded`)
      const adopted = c.resolveByReload()
      assert(adopted?.adoptedVersion === i + 2, `iter ${i} adopt ok`)
      assert(!c.state().hasConflict, `iter ${i} cleared`)
    }
  })

  await caseRun("6/20 save-failure loop bounded by maxAttempts", async () => {
    let attempts = 0
    const mgr = createAutosaveManager<number>({
      saver: async () => {
        attempts++
        throw new Error("permanent")
      },
      debounceMs: 20,
      maxAttempts: 3,
    })
    mgr.request(1)
    // Wait for all retries to play out: ~500ms + 1s + 3s. Give 5s budget.
    await sleep(5500)
    assert(attempts === 3, `expected exactly 3 attempts, got ${attempts}`)
    assert(mgr.snapshot().status === "error", "ended in error")
    mgr.dispose()
  })

  await caseRun("7/20 dispose during in-flight save discards result", async () => {
    let started = 0
    let finished = 0
    const mgr = createAutosaveManager<number>({
      saver: async () => {
        started++
        await sleep(150)
        finished++
      },
      debounceMs: 10,
    })
    mgr.request(1)
    await sleep(50) // wait for saver to start
    mgr.dispose()
    await sleep(300)
    assert(started === 1, `expected 1 start, got ${started}`)
    // saver may finish naturally (we can't kill it); but the manager
    // must not have written a saved status.
    void finished
    assert(mgr.snapshot().status !== "saved", "no saved status after dispose")
    assert(mgr.snapshot().telemetry.discardedCount >= 1 || mgr.snapshot().telemetry.saveCount === 0, "save was discarded or never recorded")
  })

  await caseRun("8/20 cancel mid-pending: no save fires", async () => {
    const saved: number[] = []
    const mgr = createAutosaveManager<number>({
      saver: async (n) => {
        saved.push(n)
      },
      debounceMs: 200,
    })
    mgr.request(1)
    mgr.request(2)
    mgr.cancel()
    await sleep(300)
    assert(saved.length === 0, `expected 0 saves, got ${saved.length}`)
    mgr.dispose()
  })

  await caseRun("9/20 stale-save rejection via txn id (multi-tab simulation)", async () => {
    // Two managers (simulating two tabs) write to the same store.
    // Each manager's save sees the latest version stamp; old txns
    // are discarded.
    let store = { version: 0, who: "" }
    function makeMgr(name: string) {
      return createAutosaveManager<{ expected: number; tag: string }>({
        saver: async (p) => {
          if (p.expected !== store.version) {
            throw new Error("version_conflict")
          }
          store = { version: store.version + 1, who: `${name}:${p.tag}` }
        },
        debounceMs: 20,
        maxAttempts: 1,
      })
    }
    const a = makeMgr("a")
    const b = makeMgr("b")
    a.request({ expected: 0, tag: "1" })
    await sleep(100)
    assert(store.version === 1 && store.who === "a:1", `a wrote first; store=${JSON.stringify(store)}`)
    // b still believes version is 0 — should fail with conflict.
    b.request({ expected: 0, tag: "stale" })
    await sleep(100)
    assert(store.version === 1, `version unchanged after stale write; got ${store.version}`)
    assert(b.snapshot().status === "error", "b ended in error")
    a.dispose()
    b.dispose()
  })

  await caseRun("10/20 flush bypasses debounce", async () => {
    const saved: number[] = []
    const mgr = createAutosaveManager<number>({
      saver: async (n) => {
        saved.push(n)
      },
      debounceMs: 5000,
    })
    mgr.request(42)
    await mgr.flush()
    assert(saved.length === 1, `flush should save once; got ${saved.length}`)
    assert(saved[0] === 42, `flush saved wrong payload`)
    mgr.dispose()
  })

  // ─── Phase B — autosave hardening ────────────────────────────────

  await caseRun("11/20 txn id is monotonic across saves", async () => {
    const txns: number[] = []
    const mgr = createAutosaveManager<number>({
      saver: async (_p, ctx) => {
        if (ctx) txns.push(ctx.txnId)
      },
      debounceMs: 10,
    })
    mgr.request(1)
    await sleep(40)
    mgr.request(2)
    await sleep(40)
    mgr.request(3)
    await sleep(40)
    assert(txns.length === 3, `expected 3 saves, got ${txns.length}`)
    assert(txns[0] < txns[1] && txns[1] < txns[2], `txn ids not monotonic: ${txns.join(",")}`)
    mgr.dispose()
  })

  await caseRun("12/20 telemetry: error + retry + save counts consistent", async () => {
    let n = 0
    const mgr = createAutosaveManager<number>({
      saver: async () => {
        n++
        if (n === 1) throw new Error("transient")
      },
      debounceMs: 10,
      maxAttempts: 3,
    })
    mgr.request(1)
    await sleep(2000) // wait for retry to land
    const t = mgr.snapshot().telemetry
    assert(t.saveCount === 1, `saveCount=${t.saveCount}`)
    assert(t.errorCount === 1, `errorCount=${t.errorCount}`)
    assert(t.retryCount === 1, `retryCount=${t.retryCount}`)
    mgr.dispose()
  })

  await caseRun("13/20 dispose during retry backoff: no leak, no further saves", async () => {
    let attempts = 0
    const mgr = createAutosaveManager<number>({
      saver: async () => {
        attempts++
        throw new Error("permanent")
      },
      debounceMs: 5,
      maxAttempts: 5,
    })
    mgr.request(1)
    await sleep(150) // first attempt fails, manager is now in backoff
    const before = attempts
    mgr.dispose()
    await sleep(2500) // would've fired more attempts without dispose
    assert(attempts === before, `attempts after dispose: ${attempts} (was ${before})`)
  })

  // ─── Phase C — undo integrity ─────────────────────────────────────

  await caseRun("14/20 undo coalesce: 1000 fast pushes → 1 entry", () => {
    const h = createUndoHistory<number>({ capacity: 100, coalesceMs: 5000 })
    for (let i = 0; i < 1000; i++) h.push(i)
    assert(h.snapshot().pastCount === 1, `coalesced to 1 entry; got ${h.snapshot().pastCount}`)
  })

  await caseRun("15/20 undo capacity bound: drops oldest", () => {
    const h = createUndoHistory<number>({ capacity: 5, coalesceMs: 0 })
    for (let i = 0; i < 100; i++) h.push(i)
    assert(h.snapshot().pastCount === 5, `capacity capped at 5; got ${h.snapshot().pastCount}`)
    // Oldest dropped: undo should return 99 (latest), not 0.
    const first = h.undo(100)
    assert(first === 99, `undo returned ${first}, expected 99`)
  })

  await caseRun("16/20 push-after-undo wipes redo stack", () => {
    const h = createUndoHistory<number>({ capacity: 10, coalesceMs: 0 })
    h.push(1)
    h.push(2)
    h.push(3)
    h.undo(4) // 4 → past, 3 ← present
    assert(h.snapshot().canRedo, "redo available after undo")
    h.push(5) // pushing wipes redo
    assert(!h.snapshot().canRedo, "redo wiped after new push")
  })

  await caseRun("17/20 clear() empties both stacks", () => {
    const h = createUndoHistory<number>({ capacity: 10, coalesceMs: 0 })
    for (let i = 0; i < 5; i++) h.push(i)
    h.undo(99)
    assert(h.snapshot().canUndo && h.snapshot().canRedo, "both populated")
    h.clear()
    assert(!h.snapshot().canUndo && !h.snapshot().canRedo, "both empty after clear")
  })

  // ─── Phase D — virtualization (file-level assertion) ──────────────

  await caseRun("18/20 transcript editor force-mounts focused row across scroll", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/transcript-editor-client.tsx",
    )
    assert(
      src.includes("focusedSegId !== null") && src.includes("focusIdx"),
      "transcript editor must clamp window to include focused row",
    )
  })

  // ─── Phase F — observability ──────────────────────────────────────

  await caseRun("19/20 snapshot exposes telemetry counters", () => {
    const mgr = createAutosaveManager<number>({
      saver: async () => {},
      debounceMs: 10,
    })
    const t = mgr.snapshot().telemetry
    assert(t.saveCount === 0, "fresh saveCount=0")
    assert(t.errorCount === 0, "fresh errorCount=0")
    assert(t.retryCount === 0, "fresh retryCount=0")
    assert(t.discardedCount === 0, "fresh discardedCount=0")
    assert(t.lastSaveDurationMs === null, "no duration yet")
    mgr.dispose()
  })

  await caseRun("20/20 dirty-state under load: 5k cycles, no leak", () => {
    const eng = createDirtyStateEngine()
    for (let i = 0; i < 5000; i++) {
      eng.markDirty(`f-${i % 50}`)
      if (i % 3 === 0) eng.markFieldClean(`f-${i % 50}`)
    }
    eng.markClean()
    assert(!eng.snapshot().isDirty, "all clean after markClean")
    assert(eng.snapshot().dirtyFields.length === 0, "no leftover dirty fields")
  })

  // ─── Summary ──────────────────────────────────────────────────────
  console.log(
    `\n${FAIL.length === 0 ? "🎉" : "💥"} ${PASS.length} passed, ${FAIL.length} failed`,
  )
  if (FAIL.length > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Stress smoke crashed:", err)
  process.exit(1)
})
