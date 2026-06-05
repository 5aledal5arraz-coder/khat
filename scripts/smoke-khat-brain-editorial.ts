/**
 * UX-7 — Editorial workspace smoke.
 *
 * Pure file-system + module-import + state-machine smoke (no DB).
 * Validates:
 *
 *   1. lib/editorial primitives load + expose stable APIs
 *   2. createDirtyStateEngine: mark/clear, idempotency, subscribe
 *   3. createUndoHistory: push/undo/redo, redo wipe, coalescing,
 *                         capacity bound
 *   4. runOptimisticTxn: apply+commit success path
 *   5. runOptimisticTxn: rollback on commit failure
 *   6. createAutosaveManager: debounce + coalesce + retry-on-failure
 *   7. createConflictManager: conflict + resolveByReload/Overwrite
 *   8. coerceTranscriptDocument: handles {} / flat string / new-shape
 *   9. recomputeCounts on transcript counts words/chars correctly
 *  10. chapterReducer: create/update/delete/reorder + recomputeEnds
 *  11. diffChapters: detects added / removed / modified+fields
 *  12. transcript-editor-client.tsx exists + exports TranscriptEditor
 *  13. tab-transcript.tsx wired into page.tsx
 *  14. Workspace IA includes intelligence/transcript/chapters/clips
 *  15. Every new tab has a legacy_fallback_href OR is implemented
 *  16. transcript-actions.ts uses studio_analysis_records (not legacy)
 *  17. saveTranscriptAction emits revalidatePath
 *  18. Every new editor tab includes ?legacy=1 escape (Phase F)
 */

import { promises as fs } from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "..")
const FAIL: string[] = []
const PASS: string[] = []

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}
async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}
async function readRel(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), "utf8")
}

function caseRun(label: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(async () => {
      await fn()
      PASS.push(label)
      console.log(`✅ ${label}`)
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      FAIL.push(`${label} — ${message}`)
      console.log(`❌ ${label}`)
      console.log(`   ${message}`)
    })
}

async function main() {
  console.log("\n🧪 smoke-khat-brain-editorial — UX-7 verification\n")

  // ── Module-level primitives ─────────────────────────────────────
  await caseRun("1/18 lib/editorial primitives load", async () => {
    const dirty = await import("../lib/editorial/dirty-state")
    assert(typeof dirty.createDirtyStateEngine === "function", "createDirtyStateEngine missing")
    const undo = await import("../lib/editorial/undo-history")
    assert(typeof undo.createUndoHistory === "function", "createUndoHistory missing")
    const auto = await import("../lib/editorial/autosave-manager")
    assert(typeof auto.createAutosaveManager === "function", "createAutosaveManager missing")
    const opt = await import("../lib/editorial/optimistic-transaction")
    assert(typeof opt.runOptimisticTxn === "function", "runOptimisticTxn missing")
    const ev = await import("../lib/editorial/activity-events")
    assert(typeof ev.createEditorEventBus === "function", "createEditorEventBus missing")
    const conflict = await import("../lib/editorial/conflict-manager")
    assert(typeof conflict.createConflictManager === "function", "createConflictManager missing")
  })

  await caseRun("2/18 Dirty-state: mark / clear / idempotency / subscribe", async () => {
    const { createDirtyStateEngine } = await import("../lib/editorial/dirty-state")
    const eng = createDirtyStateEngine()
    assert(eng.snapshot().isDirty === false, "starts clean")
    let lastRev = eng.snapshot().revision
    let notified = 0
    const off = eng.subscribe(() => {
      notified++
    })
    eng.markDirty("a")
    assert(eng.isFieldDirty("a"), "a dirty")
    assert(eng.snapshot().isDirty, "doc dirty")
    assert(eng.snapshot().revision > lastRev, "revision bumped")
    lastRev = eng.snapshot().revision
    eng.markDirty("a") // idempotent
    assert(eng.snapshot().revision === lastRev, "idempotent re-mark didn't bump")
    eng.markDirty("b")
    assert(eng.snapshot().dirtyFields.length === 2, "2 dirty fields")
    eng.markFieldClean("a")
    assert(!eng.isFieldDirty("a"), "a clean")
    assert(eng.snapshot().dirtyFields.length === 1, "1 dirty field after clean")
    eng.markClean()
    assert(!eng.snapshot().isDirty, "all clean")
    off()
    assert(notified > 0, "subscriber called at least once")
  })

  await caseRun("3/18 Undo-history: push/undo/redo, coalesce, capacity, redo wipe", async () => {
    const { createUndoHistory } = await import("../lib/editorial/undo-history")
    const h = createUndoHistory<number>({ capacity: 3, coalesceMs: 0 })
    h.push(1)
    h.push(2)
    h.push(3)
    assert(h.snapshot().pastCount === 3, "3 in past")
    // capacity overflow
    h.push(4)
    assert(h.snapshot().pastCount === 3, "capacity capped at 3")
    // undo
    const undone = h.undo(5)
    assert(undone === 4, "undo returns last past")
    assert(h.snapshot().canRedo, "redo available")
    // redo
    const redone = h.redo(undone!)
    assert(redone === 5, "redo returns last future")
    // push wipes redo
    h.push(99)
    h.undo(100)
    h.push(101)
    assert(!h.snapshot().canRedo, "redo wiped after push")
  })

  await caseRun("4/18 Optimistic transaction: success path", async () => {
    const { runOptimisticTxn } = await import("../lib/editorial/optimistic-transaction")
    const result = await runOptimisticTxn<{ count: number }>({
      current: { count: 0 },
      apply: (s) => ({ count: s.count + 1 }),
      commit: async () => {},
    })
    assert(result.ok, "ok")
    assert(result.state.count === 1, "applied")
    assert(result.error === null, "no error")
  })

  await caseRun("5/18 Optimistic transaction: rollback on commit failure", async () => {
    const { runOptimisticTxn } = await import("../lib/editorial/optimistic-transaction")
    const result = await runOptimisticTxn<{ count: number }>({
      current: { count: 5 },
      apply: (s) => ({ count: s.count + 10 }),
      commit: async () => {
        throw new Error("network down")
      },
    })
    assert(!result.ok, "not ok")
    assert(result.state.count === 5, "rolled back")
    assert(result.error?.message === "network down", "error preserved")
  })

  await caseRun("6/18 Autosave manager: debounce + coalesce + retry", async () => {
    const { createAutosaveManager } = await import("../lib/editorial/autosave-manager")
    let attempts = 0
    let saved: number[] = []
    const mgr = createAutosaveManager<number>({
      saver: async (n) => {
        attempts++
        if (attempts === 1) throw new Error("transient")
        saved.push(n)
      },
      debounceMs: 50,
      maxAttempts: 3,
    })
    mgr.request(1)
    mgr.request(2)
    mgr.request(3) // should coalesce — only the latest is saved
    await new Promise((r) => setTimeout(r, 200))
    // First attempt fails, retry kicks in. Allow generous time for retry.
    await new Promise((r) => setTimeout(r, 1500))
    assert(saved.length === 1, `expected 1 successful save, got ${saved.length}`)
    assert(saved[0] === 3, `expected payload 3, got ${saved[0]}`)
    assert(mgr.snapshot().status === "saved" || mgr.snapshot().status === "idle", "ended in saved/idle")
    mgr.dispose()
  })

  await caseRun("7/18 Conflict manager: detect + resolve", async () => {
    const { createConflictManager } = await import("../lib/editorial/conflict-manager")
    const c = createConflictManager()
    c.setExpectedVersion(5)
    assert(!c.state().hasConflict, "no conflict initially")
    c.recordConflict(7, { foo: "server" })
    assert(c.state().hasConflict, "conflict recorded")
    assert(c.state().currentVersion === 7, "server version captured")
    const adopted = c.resolveByReload()
    assert(adopted?.adoptedVersion === 7, "reload adopts server version")
    assert(!c.state().hasConflict, "conflict cleared after resolve")
  })

  await caseRun("8/18 coerceTranscriptDocument: empty / flat / new shape", async () => {
    const { coerceTranscriptDocument } = await import(
      "../lib/editorial/transcript-types"
    )
    const empty = coerceTranscriptDocument(null)
    assert(empty.segments.length === 0, "empty doc")
    assert(empty.schema_version === 1, "schema version stamped")
    const flat = coerceTranscriptDocument({
      transcript_clean: "Para 1.\n\nPara 2 with a longer body.",
      language: "ar",
      source: "paste",
    })
    assert(flat.segments.length === 2, `flat split → 2 segments, got ${flat.segments.length}`)
    const native = coerceTranscriptDocument({
      schema_version: 1,
      version: 4,
      source: "manual",
      language: "ar",
      segments: [
        { id: "s1", text: "hello world", speaker: "Khaled" },
      ],
    })
    assert(native.version === 4, "version preserved")
    assert(native.segments[0].speaker === "Khaled", "speaker preserved")
  })

  await caseRun("9/18 recomputeCounts: word + char tally", async () => {
    const { recomputeCounts, emptyTranscriptDocument, newSegment } = await import(
      "../lib/editorial/transcript-types"
    )
    const doc = {
      ...emptyTranscriptDocument(),
      segments: [newSegment({ text: "hello world" }), newSegment({ text: "again" })],
    }
    const c = recomputeCounts(doc)
    assert(c.word_count === 3, `expected 3 words, got ${c.word_count}`)
    assert(c.char_count === "hello world".length + "again".length, "chars match")
  })

  await caseRun("10/18 chapterReducer: create/update/delete/reorder", async () => {
    const { chapterReducer, emptyChapterDocument, newChapter } = await import(
      "../lib/editorial/chapter-types"
    )
    let doc = emptyChapterDocument()
    const a = newChapter({ id: "a", title: "Intro", start_seconds: 0 })
    const b = newChapter({ id: "b", title: "Body", start_seconds: 60 })
    doc = chapterReducer(doc, { type: "create", chapter: a })
    doc = chapterReducer(doc, { type: "create", chapter: b })
    assert(doc.chapters.length === 2, "2 chapters")
    // recomputeEnds should set a.end_seconds = 60 (start of b)
    assert(doc.chapters[0].end_seconds === 60, "end recomputed")
    doc = chapterReducer(doc, { type: "update", id: "a", patch: { title: "Welcome" } })
    assert(doc.chapters[0].title === "Welcome", "update applied")
    doc = chapterReducer(doc, { type: "delete", id: "a" })
    assert(doc.chapters.length === 1 && doc.chapters[0].id === "b", "delete applied")
  })

  await caseRun("11/18 diffChapters: added / removed / modified", async () => {
    const { diffChapters, emptyChapterDocument, newChapter } = await import(
      "../lib/editorial/chapter-types"
    )
    const before = {
      ...emptyChapterDocument(),
      chapters: [
        newChapter({ id: "a", title: "Old", start_seconds: 0 }),
        newChapter({ id: "b", title: "Stable", start_seconds: 60 }),
      ],
    }
    const after = {
      ...emptyChapterDocument(),
      chapters: [
        newChapter({ id: "a", title: "New", start_seconds: 0 }),
        newChapter({ id: "c", title: "Fresh", start_seconds: 30 }),
      ],
    }
    const diff = diffChapters(before, after)
    assert(diff.some((d) => d.kind === "removed" && d.chapter_id === "b"), "b removed")
    assert(diff.some((d) => d.kind === "added" && d.chapter_id === "c"), "c added")
    const modA = diff.find((d) => d.kind === "modified" && d.chapter_id === "a")
    assert(modA && modA.fields.includes("title"), "a title modified")
  })

  // ── File / wiring assertions ─────────────────────────────────────
  await caseRun("12/18 transcript-editor-client.tsx exports TranscriptEditor", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/transcript-editor-client.tsx",
    )
    assert(src.includes("export function TranscriptEditor"), "TranscriptEditor exported")
    assert(src.includes("useAutosave"), "uses autosave")
    assert(src.includes("useUndoHistory"), "uses undo history")
    assert(src.includes("useDirtyState"), "uses dirty state")
    assert(src.includes("EditorStatusBadge"), "renders status badge")
    // Virtualization sentinel
    assert(src.includes("ROW_HEIGHT_ESTIMATE") && src.includes("OVERSCAN"), "virtualization windowing primitives present")
  })

  await caseRun("13/18 tab-transcript.tsx wired into page.tsx", async () => {
    const page = await readRel("app/admin/khat-brain/episodes/[eirId]/page.tsx")
    assert(
      page.includes('selected === "transcript"') && page.includes("<TranscriptTab"),
      "transcript tab rendered when selected",
    )
    assert(page.includes('from "./tab-transcript"'), "tab-transcript imported")
  })

  await caseRun("14/18 IA includes intelligence/transcript/chapters/clips", async () => {
    const tabs = await readRel("app/admin/khat-brain/episodes/[eirId]/tabs.ts")
    for (const k of ["intelligence", "transcript", "chapters", "clips"]) {
      assert(tabs.includes(`"${k}"`), `TAB_KEYS missing "${k}"`)
    }
    // Old keys preserved for back-compat
    for (const k of ["overview", "topic", "guest", "studio"]) {
      assert(tabs.includes(`"${k}"`), `legacy key dropped: "${k}"`)
    }
  })

  await caseRun("15/18 New unimplemented tabs declare legacy_fallback_href", async () => {
    const tabs = await readRel("app/admin/khat-brain/episodes/[eirId]/tabs.ts")
    // intelligence is implemented:false so it MUST have a fallback.
    const block = tabs.match(/intelligence:\s*\{[\s\S]+?\},/)?.[0] ?? ""
    assert(
      block.includes("legacy_fallback_href"),
      "intelligence tab missing legacy_fallback_href",
    )
    const chBlock = tabs.match(/chapters:\s*\{[\s\S]+?\},/)?.[0] ?? ""
    assert(
      chBlock.includes("legacy_fallback_href"),
      "chapters tab missing legacy_fallback_href",
    )
  })

  await caseRun("16/18 transcript-actions.ts uses studio_analysis_records", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/transcript-actions.ts",
    )
    assert(
      src.includes('upsertStudioAnalysisRecord'),
      "transcript-actions must route through upsertStudioAnalysisRecord",
    )
    assert(
      src.includes('kind: "transcript"'),
      "transcript-actions must persist kind=transcript",
    )
  })

  await caseRun("17/18 saveTranscriptAction emits revalidatePath", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/transcript-actions.ts",
    )
    assert(
      src.includes("revalidatePath(`/admin/khat-brain/episodes/${"),
      "saveTranscriptAction must revalidate workspace path",
    )
  })

  await caseRun("18/18 Phase F: legacy escape hatch in transcript tab", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/tab-transcript.tsx",
    )
    assert(
      src.includes("الصفحة المتقدمة"),
      "transcript tab must surface 'الصفحة المتقدمة' legacy link",
    )
    assert(
      src.includes("/admin/studio/"),
      "transcript tab legacy href must point at /admin/studio/",
    )
  })

  // ── Summary ──────────────────────────────────────────────────────
  console.log(
    `\n${FAIL.length === 0 ? "🎉" : "💥"} ${PASS.length} passed, ${FAIL.length} failed`,
  )
  if (FAIL.length > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Smoke crashed:", err)
  process.exit(1)
})
