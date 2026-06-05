/**
 * UX-8 — Workspace chapter editor smoke.
 *
 * Pure node-side smoke: drives the chapter primitives (reducer +
 * coercion + validation) under realistic editing patterns and
 * asserts on the wiring of the workspace files. No DB, no DOM.
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
  console.log("\n🧪 smoke-khat-brain-chapters — UX-8 verification\n")

  const types = await import("../lib/editorial/chapter-types")
  const validation = await import("../lib/editorial/chapter-validation")
  const {
    chapterReducer,
    coerceChapterDocument,
    diffChapters,
    emptyChapterDocument,
    newChapter,
  } = types
  const {
    DEFAULT_VALIDATION_LIMITS,
    issuesForChapter,
    normalizeChapterTimes,
    validateChapterDocument,
  } = validation

  // ─── Phase A — coercion & reducer ─────────────────────────────────

  await caseRun("1/15 coerceChapterDocument: empty / legacy / new shape", () => {
    const empty = coerceChapterDocument(null)
    assert(empty.chapters.length === 0, "empty doc")
    assert(empty.schema_version === 2, "schema v2")
    const legacy = coerceChapterDocument({
      chapters: [
        { id: "a", title: "intro", start_seconds: 0, end_seconds: 60 },
        { id: "b", title: "body", start_seconds: 60, end_seconds: 240 },
      ],
      language: "ar",
    })
    assert(legacy.chapters.length === 2, "legacy chapters parsed")
    assert(legacy.chapters[0].status === "draft", "default status")
    assert(legacy.chapters[0].source === "manual", "default source")
  })

  await caseRun("2/15 chapterReducer: create → update → delete + recomputeEnds", () => {
    let doc = emptyChapterDocument()
    const a = newChapter({ id: "a", title: "Intro", start_seconds: 0 })
    const b = newChapter({ id: "b", title: "Body", start_seconds: 60 })
    const c = newChapter({ id: "c", title: "Outro", start_seconds: 200 })
    doc = chapterReducer(doc, { type: "create", chapter: a })
    doc = chapterReducer(doc, { type: "create", chapter: b })
    doc = chapterReducer(doc, { type: "create", chapter: c })
    assert(doc.chapters.length === 3, "3 chapters")
    assert(doc.chapters[0].end_seconds === 60, "a.end recomputed")
    assert(doc.chapters[1].end_seconds === 200, "b.end recomputed")
    doc = chapterReducer(doc, {
      type: "update",
      id: "b",
      patch: { title: "Body Reworked" },
    })
    assert(doc.chapters[1].title === "Body Reworked", "update applied")
    doc = chapterReducer(doc, { type: "delete", id: "a" })
    assert(doc.chapters.length === 2 && doc.chapters[0].id === "b", "delete + reorder")
  })

  await caseRun("3/15 reorder via bulk_replace updates ordering", () => {
    let doc = emptyChapterDocument()
    doc = chapterReducer(doc, {
      type: "create",
      chapter: newChapter({ id: "a", start_seconds: 0 }),
    })
    doc = chapterReducer(doc, {
      type: "create",
      chapter: newChapter({ id: "b", start_seconds: 60 }),
    })
    // Swap start_seconds via bulk_replace.
    doc = chapterReducer(doc, {
      type: "bulk_replace",
      chapters: doc.chapters.map((c) =>
        c.id === "a"
          ? { ...c, start_seconds: 60 }
          : c.id === "b"
            ? { ...c, start_seconds: 0 }
            : c,
      ),
    })
    assert(doc.chapters[0].id === "b", "b first after swap")
    assert(doc.chapters[1].id === "a", "a last after swap")
  })

  await caseRun("4/15 diffChapters detects added / removed / modified", () => {
    const a = newChapter({ id: "a", title: "Old", start_seconds: 0 })
    const b = newChapter({ id: "b", title: "Stable", start_seconds: 60 })
    const before = { ...emptyChapterDocument(), chapters: [a, b] }
    const after = {
      ...emptyChapterDocument(),
      chapters: [
        { ...a, title: "Renamed", summary: "new summary" },
        newChapter({ id: "c", start_seconds: 30 }),
      ],
    }
    const d = diffChapters(before, after)
    const added = d.filter((x) => x.kind === "added").map((x) => x.chapter_id)
    const removed = d.filter((x) => x.kind === "removed").map((x) => x.chapter_id)
    const modified = d.filter((x) => x.kind === "modified")
    assert(added.includes("c"), "c added")
    assert(removed.includes("b"), "b removed")
    const aMod = modified.find((m) => m.chapter_id === "a")
    assert(aMod && aMod.fields.includes("title"), "a title modified")
    assert(aMod && aMod.fields.includes("summary"), "a summary modified")
  })

  // ─── Phase F — validation ─────────────────────────────────────────

  await caseRun("5/15 validation: detect overlap (blocker)", () => {
    const doc = {
      ...emptyChapterDocument(),
      chapters: [
        newChapter({ id: "a", title: "A", start_seconds: 0, end_seconds: 100 }),
        newChapter({ id: "b", title: "B", start_seconds: 60, end_seconds: 200 }),
      ],
    }
    const r = validateChapterDocument(doc)
    const overlap = r.issues.find((i) => i.code === "overlap")
    assert(overlap?.severity === "blocker", "overlap is blocker")
    assert(!r.canApprove, "cannot approve with overlap")
  })

  await caseRun("6/15 validation: detect gap (warning)", () => {
    const doc = {
      ...emptyChapterDocument(),
      chapters: [
        newChapter({ id: "a", title: "A long enough", start_seconds: 0, end_seconds: 60 }),
        newChapter({ id: "b", title: "B another", start_seconds: 200, end_seconds: 240 }),
      ],
    }
    const r = validateChapterDocument(doc)
    const gap = r.issues.find((i) => i.code === "gap_too_large")
    assert(gap?.severity === "warning", "gap is warning")
    assert(r.canApprove, "gap doesn't block approval")
  })

  await caseRun("7/15 validation: empty title is blocker", () => {
    const doc = {
      ...emptyChapterDocument(),
      chapters: [newChapter({ id: "a", title: "", start_seconds: 0 })],
    }
    const r = validateChapterDocument(doc)
    assert(
      r.issues.some((i) => i.code === "empty_title" && i.severity === "blocker"),
      "empty title flagged",
    )
    assert(!r.canApprove, "blocks approval")
  })

  await caseRun("8/15 validation: too-short / too-long warnings", () => {
    const limits = { ...DEFAULT_VALIDATION_LIMITS, min_chapter_seconds: 30 }
    const doc = {
      ...emptyChapterDocument(),
      chapters: [
        newChapter({ id: "a", title: "tiny", start_seconds: 0, end_seconds: 5 }),
        newChapter({
          id: "b",
          title: "huge",
          start_seconds: 5,
          end_seconds: 5 + limits.max_chapter_seconds + 1,
        }),
      ],
    }
    const r = validateChapterDocument(doc, limits)
    assert(r.issues.some((i) => i.code === "too_short"), "too short")
    assert(r.issues.some((i) => i.code === "too_long"), "too long")
  })

  await caseRun("9/15 validation: approve-with-blocker is itself a blocker", () => {
    const doc = {
      ...emptyChapterDocument(),
      chapters: [
        newChapter({ id: "a", title: "", status: "approved", start_seconds: 0 }),
      ],
    }
    const r = validateChapterDocument(doc)
    assert(
      r.issues.some((i) => i.code === "approved_with_blocker" && i.severity === "blocker"),
      "approval-with-blocker raised",
    )
  })

  await caseRun("10/15 normalizeChapterTimes closes gaps", () => {
    const doc = {
      ...emptyChapterDocument(),
      chapters: [
        // Start at 0.5s (within the 1s pad threshold) → should snap to 0.
        newChapter({ id: "a", title: "A", start_seconds: 0.5, end_seconds: 30 }),
        newChapter({ id: "b", title: "B", start_seconds: 100, end_seconds: 200 }),
      ],
    }
    const norm = normalizeChapterTimes(doc)
    assert(norm.chapters[0].start_seconds === 0, "first start padded to 0")
    assert(norm.chapters[0].end_seconds === 100, "first end snapped to next start")

    // Stronger assertion: first start > 1s should NOT be padded.
    const doc2 = {
      ...emptyChapterDocument(),
      chapters: [
        newChapter({ id: "a", title: "A", start_seconds: 5, end_seconds: 30 }),
        newChapter({ id: "b", title: "B", start_seconds: 100, end_seconds: 200 }),
      ],
    }
    const norm2 = normalizeChapterTimes(doc2)
    assert(norm2.chapters[0].start_seconds === 5, "first start preserved when > 1s")
    assert(norm2.chapters[0].end_seconds === 100, "first end still snaps to next start")
  })

  await caseRun("11/15 issuesForChapter scopes correctly", () => {
    const doc = {
      ...emptyChapterDocument(),
      chapters: [
        newChapter({ id: "a", title: "", start_seconds: 0 }),
        newChapter({ id: "b", title: "fine title", start_seconds: 60 }),
      ],
    }
    const r = validateChapterDocument(doc)
    const aIssues = issuesForChapter(r, "a")
    const bIssues = issuesForChapter(r, "b")
    assert(aIssues.some((i) => i.code === "empty_title"), "a has empty_title")
    assert(!bIssues.some((i) => i.code === "empty_title"), "b clean")
  })

  // ─── File-level wiring ─────────────────────────────────────────────

  await caseRun("12/15 chapter-actions.ts uses studio_analysis_records kind=chapters", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/chapter-actions.ts",
    )
    assert(src.includes("upsertStudioAnalysisRecord"), "uses repo")
    assert(src.includes('kind: "chapters"'), "writes kind=chapters")
    assert(
      src.includes("revalidatePath(`/admin/khat-brain/episodes/${"),
      "saves call revalidatePath",
    )
    assert(
      src.includes("version_conflict"),
      "conflict path present",
    )
  })

  await caseRun("13/15 tab-chapters.tsx wired into page.tsx + tabs.ts implemented", async () => {
    const page = await readRel("app/admin/khat-brain/episodes/[eirId]/page.tsx")
    assert(page.includes('selected === "chapters"'), "chapters branch in page.tsx")
    assert(page.includes("<ChaptersTab"), "ChaptersTab rendered")
    const tabs = await readRel("app/admin/khat-brain/episodes/[eirId]/tabs.ts")
    const block = tabs.match(/chapters:\s*\{[\s\S]+?\},/)?.[0] ?? ""
    assert(block.includes("implemented: true"), "chapters now implemented:true")
    assert(block.includes("legacy_fallback_href"), "legacy fallback preserved")
  })

  await caseRun("14/15 chapter-editor-client uses editorial primitives", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/chapter-editor-client.tsx",
    )
    assert(src.includes("useAutosave"), "autosave reused")
    assert(src.includes("useDirtyState"), "dirty-state reused")
    assert(src.includes("useUndoHistory"), "undo reused")
    assert(src.includes("EditorStatusBadge"), "status badge reused")
    assert(src.includes("EditorToolbar"), "toolbar reused")
    assert(src.includes("validateChapterDocument"), "validation surfaced")
    assert(src.includes("ChapterTimeline"), "timeline rendered")
    assert(src.includes("SuggestionsPanel"), "AI suggestions panel mounted")
  })

  await caseRun(
    "15/15 transcript editor: Create-chapter button + ?seg= deep-link",
    async () => {
      const src = await readRel(
        "app/admin/khat-brain/episodes/[eirId]/transcript-editor-client.tsx",
      )
      assert(
        src.includes("createChapterFromSegmentAction"),
        "transcript imports createChapter action",
      )
      assert(
        src.includes("BookmarkPlus"),
        "create-chapter icon present in toolbar",
      )
      assert(
        src.includes('params.get("seg")'),
        "?seg= deep-link handler present",
      )
    },
  )

  // ─── Summary ───────────────────────────────────────────────────────
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
