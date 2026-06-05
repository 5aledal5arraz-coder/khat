/**
 * UX-9 — Workspace Clip Intelligence smoke.
 *
 * Pure node-side smoke: drives clip primitives (reducer + coercion +
 * validation + queue/filter helpers) under realistic editing patterns
 * and asserts on the wiring of the workspace files. No DB, no DOM.
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
  console.log("\n🧪 smoke-khat-brain-clips — UX-9 Clip Intelligence verification\n")

  const types = await import("../lib/editorial/clip-types")
  type Clip = ReturnType<typeof types.newClip>
  const validation = await import("../lib/editorial/clip-validation")
  const {
    clipReducer,
    clipEditorialWeight,
    coerceClipDocument,
    diffClips,
    emptyClipDocument,
    newClip,
  } = types
  const {
    DEFAULT_CLIP_VALIDATION_LIMITS,
    filterClipsForQueue,
    issuesForClip,
    searchAndFilterClips,
    validateClipDocument,
  } = validation

  // ─── Phase A — coercion / reducer / scoring ──────────────────────

  await caseRun("1/20 coerceClipDocument: empty + legacy + new shape", () => {
    const empty = coerceClipDocument(null)
    assert(empty.clips.length === 0, "empty doc")
    assert(empty.schema_version === 1, "schema v1")
    const legacy = coerceClipDocument({
      clips: [
        {
          id: "a",
          title: "intro",
          hook: "...",
          start_seconds: 0,
          end_seconds: 30,
        },
      ],
      language: "ar",
    })
    assert(legacy.clips[0].status === "draft", "default status")
    assert(legacy.clips[0].source === "manual", "default source")
    assert(legacy.clips[0].emotional_score === 50, "default emotional")
    assert(legacy.clips[0].recommended_ratio === "9:16", "default ratio")
  })

  await caseRun("2/20 clipReducer: create / update / delete + sort by start", () => {
    let doc = emptyClipDocument()
    const a = newClip({ id: "a", title: "A", start_seconds: 0, end_seconds: 30 })
    const b = newClip({ id: "b", title: "B", start_seconds: 60, end_seconds: 95 })
    const c = newClip({ id: "c", title: "C", start_seconds: 30, end_seconds: 55 })
    doc = clipReducer(doc, { type: "create", clip: a })
    doc = clipReducer(doc, { type: "create", clip: b })
    doc = clipReducer(doc, { type: "create", clip: c })
    assert(doc.clips.map((x) => x.id).join(",") === "a,c,b", "sorted by start")
    doc = clipReducer(doc, {
      type: "update",
      id: "b",
      patch: { title: "B-Reworked", hook_score: 90 },
    })
    assert(doc.clips.find((x) => x.id === "b")?.hook_score === 90, "score update")
    doc = clipReducer(doc, { type: "delete", id: "a" })
    assert(doc.clips.length === 2 && doc.clips[0].id === "c", "delete + sort")
  })

  await caseRun("3/20 diffClips detects added / removed / modified scores", () => {
    const a = newClip({
      id: "a",
      title: "A",
      hook: "h",
      start_seconds: 0,
      end_seconds: 30,
      hook_score: 50,
    })
    const b = newClip({
      id: "b",
      title: "B",
      hook: "h2",
      start_seconds: 60,
      end_seconds: 80,
    })
    const before = { ...emptyClipDocument(), clips: [a, b] }
    const after = {
      ...emptyClipDocument(),
      clips: [
        { ...a, hook_score: 80, platform_targets: ["tiktok"] as Clip["platform_targets"] },
        newClip({ id: "c", start_seconds: 100, end_seconds: 130 }),
      ],
    }
    const d = diffClips(before, after)
    assert(d.some((x) => x.kind === "added" && x.clip_id === "c"), "c added")
    assert(d.some((x) => x.kind === "removed" && x.clip_id === "b"), "b removed")
    const mod = d.find((x) => x.kind === "modified" && x.clip_id === "a")
    assert(mod && mod.fields.includes("hook_score"), "a hook_score")
    assert(mod && mod.fields.includes("platform_targets"), "a platform")
  })

  await caseRun("4/20 clipEditorialWeight uses weighted blend", () => {
    const c = newClip({
      hook_score: 90,
      emotional_score: 80,
      depth_score: 70,
      viral_score: 60,
      controversy_score: 50,
    })
    const expected = Math.round(90 * 0.32 + 80 * 0.28 + 70 * 0.18 + 60 * 0.14 + 50 * 0.08)
    assert(clipEditorialWeight(c) === expected, `weight=${clipEditorialWeight(c)}, expected ${expected}`)
    // Hook contribution: equal-delta bumps should reflect the
    // weighting (0.32 vs 0.08). Use a flat baseline so headroom is
    // identical for the comparison.
    const flat = newClip({
      hook_score: 50,
      emotional_score: 50,
      depth_score: 50,
      viral_score: 50,
      controversy_score: 50,
    })
    const hookBoost =
      clipEditorialWeight({ ...flat, hook_score: 60 }) - clipEditorialWeight(flat)
    const controversyBoost =
      clipEditorialWeight({ ...flat, controversy_score: 60 }) - clipEditorialWeight(flat)
    assert(
      hookBoost > controversyBoost,
      `hook weight bump ${hookBoost} should exceed controversy ${controversyBoost}`,
    )
  })

  // ─── Phase F — validation ─────────────────────────────────────────

  await caseRun("5/20 validation: invalid range is blocker", () => {
    const doc = {
      ...emptyClipDocument(),
      clips: [
        newClip({
          id: "a",
          title: "title here ok",
          hook: "hook with enough words for validation",
          start_seconds: 30,
          end_seconds: 30,
        }),
      ],
    }
    const r = validateClipDocument(doc)
    assert(
      r.issues.some((i) => i.code === "invalid_range" && i.severity === "blocker"),
      "invalid_range raised",
    )
    assert(!r.canApprove, "cannot approve")
  })

  await caseRun("6/20 validation: empty title blocker, weak hook warning", () => {
    const doc = {
      ...emptyClipDocument(),
      clips: [
        newClip({ id: "a", title: "", hook: "tiny", start_seconds: 0, end_seconds: 30 }),
      ],
    }
    const r = validateClipDocument(doc)
    assert(
      r.issues.some((i) => i.code === "empty_title" && i.severity === "blocker"),
      "empty title blocker",
    )
    assert(r.issues.some((i) => i.code === "short_hook"), "short_hook warning")
  })

  await caseRun("7/20 validation: too-short / too-long warnings", () => {
    const limits = DEFAULT_CLIP_VALIDATION_LIMITS
    const doc = {
      ...emptyClipDocument(),
      clips: [
        newClip({
          id: "tiny",
          title: "tiny clip ok",
          hook: "this hook is long enough",
          start_seconds: 0,
          end_seconds: limits.min_clip_seconds - 2,
        }),
        newClip({
          id: "huge",
          title: "huge clip ok",
          hook: "this hook is long enough",
          start_seconds: limits.min_clip_seconds,
          end_seconds: limits.min_clip_seconds + limits.max_clip_seconds + 5,
        }),
      ],
    }
    const r = validateClipDocument(doc)
    assert(r.issues.some((i) => i.code === "too_short"), "tiny → too_short")
    assert(r.issues.some((i) => i.code === "too_long"), "huge → too_long")
  })

  await caseRun("8/20 validation: low hook score + no platform target", () => {
    const doc = {
      ...emptyClipDocument(),
      clips: [
        newClip({
          id: "a",
          title: "ok title here",
          hook: "this hook is long enough words",
          start_seconds: 0,
          end_seconds: 30,
          hook_score: 30,
          platform_targets: [],
        }),
      ],
    }
    const r = validateClipDocument(doc)
    assert(r.issues.some((i) => i.code === "low_hook_score"), "low_hook_score")
    assert(r.issues.some((i) => i.code === "no_platform_target"), "no_platform_target")
  })

  await caseRun("9/20 validation: approved without thumbnail text warning", () => {
    const doc = {
      ...emptyClipDocument(),
      clips: [
        newClip({
          id: "a",
          title: "ok title here",
          hook: "this hook is long enough words",
          start_seconds: 0,
          end_seconds: 30,
          hook_score: 80,
          platform_targets: ["tiktok"],
          status: "approved",
          thumbnail_text: null,
        }),
      ],
    }
    const r = validateClipDocument(doc)
    assert(
      r.issues.some((i) => i.code === "approved_without_thumbnail_text"),
      "approved_without_thumbnail_text",
    )
  })

  await caseRun("10/20 validation: approve-with-blocker is itself a blocker", () => {
    const doc = {
      ...emptyClipDocument(),
      clips: [
        newClip({
          id: "a",
          title: "",
          hook: "h",
          start_seconds: 0,
          end_seconds: 30,
          status: "approved",
        }),
      ],
    }
    const r = validateClipDocument(doc)
    assert(
      r.issues.some((i) => i.code === "approved_with_blocker" && i.severity === "blocker"),
      "approved_with_blocker raised",
    )
  })

  await caseRun("11/20 validation: duplicate range warning", () => {
    const doc = {
      ...emptyClipDocument(),
      clips: [
        newClip({
          id: "a",
          title: "alpha title here",
          hook: "this hook is long enough words",
          start_seconds: 10,
          end_seconds: 40,
        }),
        newClip({
          id: "b",
          title: "beta title here",
          hook: "this hook is long enough words",
          start_seconds: 10,
          end_seconds: 40,
        }),
      ],
    }
    const r = validateClipDocument(doc)
    assert(r.issues.some((i) => i.code === "duplicate_range"), "duplicate_range raised")
  })

  await caseRun("12/20 issuesForClip scopes correctly", () => {
    const doc = {
      ...emptyClipDocument(),
      clips: [
        newClip({ id: "a", title: "", hook: "h", start_seconds: 0, end_seconds: 30 }),
        newClip({
          id: "b",
          title: "ok title here",
          hook: "this hook is long enough words",
          start_seconds: 60,
          end_seconds: 90,
          hook_score: 80,
          platform_targets: ["tiktok"],
        }),
      ],
    }
    const r = validateClipDocument(doc)
    const aIssues = issuesForClip(r, "a")
    const bIssues = issuesForClip(r, "b")
    assert(aIssues.some((i) => i.code === "empty_title"), "a empty_title")
    assert(!bIssues.some((i) => i.code === "empty_title"), "b clean")
  })

  // ─── Queue + filter helpers ─────────────────────────────────────

  await caseRun("13/20 filterClipsForQueue: priority weight + must_publish + export_ready", () => {
    const lowScore = newClip({
      id: "low",
      title: "low",
      hook: "h",
      start_seconds: 0,
      end_seconds: 30,
      hook_score: 30,
      emotional_score: 30,
      depth_score: 30,
      viral_score: 30,
      controversy_score: 30,
    })
    const highScore = newClip({
      id: "high",
      title: "high",
      hook: "h",
      start_seconds: 30,
      end_seconds: 60,
      hook_score: 90,
      emotional_score: 80,
      depth_score: 70,
      viral_score: 60,
      controversy_score: 50,
    })
    const mustPublish = newClip({
      id: "must",
      title: "must",
      hook: "h",
      start_seconds: 60,
      end_seconds: 90,
      mark: "must_publish",
    })
    const exportReady = newClip({
      id: "exp",
      title: "exp",
      hook: "h",
      start_seconds: 90,
      end_seconds: 120,
      status: "approved",
      thumbnail_text: "go",
      platform_targets: ["tiktok"],
    })
    const list = [lowScore, highScore, mustPublish, exportReady]
    const priority = filterClipsForQueue(list, "priority").map((c) => c.id)
    assert(priority.includes("high"), "priority includes high score")
    assert(!priority.includes("low"), "priority excludes low score")
    const must = filterClipsForQueue(list, "must_publish").map((c) => c.id)
    assert(must.length === 1 && must[0] === "must", "must_publish exact")
    const expReady = filterClipsForQueue(list, "export_ready").map((c) => c.id)
    assert(expReady.length === 1 && expReady[0] === "exp", "export_ready requires thumbnail+platform")
  })

  await caseRun("14/20 searchAndFilterClips: query + minScore + platform + status", () => {
    const a = newClip({
      id: "a",
      title: "هوية وانتماء",
      hook: "ما الذي يجعلك أنت؟",
      hook_score: 90,
      emotional_score: 90,
      depth_score: 80,
      viral_score: 80,
      controversy_score: 60,
      platform_targets: ["tiktok"],
      status: "draft",
    })
    const b = newClip({
      id: "b",
      title: "نقاش جدلي",
      hook: "...",
      hook_score: 30,
      platform_targets: ["youtube_shorts"],
      status: "approved",
    })
    const list = [a, b]
    const q = searchAndFilterClips(list, { query: "هوية" })
    assert(q.length === 1 && q[0].id === "a", "query filter")
    const m = searchAndFilterClips(list, { minScore: 70 })
    assert(m.length === 1 && m[0].id === "a", "minScore filter")
    const p = searchAndFilterClips(list, { platform: "youtube_shorts" })
    assert(p.length === 1 && p[0].id === "b", "platform filter")
    const s = searchAndFilterClips(list, { status: "approved" })
    assert(s.length === 1 && s[0].id === "b", "status filter")
  })

  // ─── Wiring assertions ────────────────────────────────────────────

  await caseRun("15/20 clip-actions.ts uses studio_analysis_records kind=clips + revalidates", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/clip-actions.ts",
    )
    assert(src.includes("upsertStudioAnalysisRecord"), "uses repo")
    assert(src.includes('kind: "clips"'), "writes kind=clips")
    assert(
      src.includes("revalidatePath(`/admin/khat-brain/episodes/${"),
      "saves call revalidatePath",
    )
    assert(src.includes("version_conflict"), "conflict path present")
    assert(src.includes("createClipFromSegmentAction"), "transcript-anchor action exported")
    assert(src.includes("generateClipsFromChapterAction"), "chapter-based action exported")
    assert(src.includes("suggestClipImprovementsAction"), "AI action exported")
  })

  await caseRun("16/20 tab-clips wired into page.tsx + tabs.ts implemented", async () => {
    const page = await readRel("app/admin/khat-brain/episodes/[eirId]/page.tsx")
    assert(page.includes('selected === "clips"'), "clips branch in page.tsx")
    assert(page.includes("<ClipsTab"), "ClipsTab rendered")
    const tabs = await readRel("app/admin/khat-brain/episodes/[eirId]/tabs.ts")
    const block = tabs.match(/clips:\s*\{[\s\S]+?\},/)?.[0] ?? ""
    assert(block.includes("implemented: true"), "clips now implemented:true")
    assert(block.includes("legacy_fallback_href"), "legacy fallback preserved")
  })

  await caseRun("17/20 clip-editor-client uses editorial primitives + queue modes + filters", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/clip-editor-client.tsx",
    )
    assert(src.includes("useAutosave"), "autosave reused")
    assert(src.includes("useDirtyState"), "dirty-state reused")
    assert(src.includes("useUndoHistory"), "undo reused")
    assert(src.includes("EditorStatusBadge"), "status badge reused")
    assert(src.includes("EditorToolbar"), "toolbar reused")
    assert(src.includes("validateClipDocument"), "validation surfaced")
    assert(src.includes("ClipTimeline"), "timeline rendered")
    assert(src.includes("SuggestionsPanel"), "AI suggestions panel mounted")
    assert(src.includes("QueueModeTabs"), "queue mode tabs present")
    assert(src.includes("FilterBar"), "filter bar present")
    assert(src.includes("PlatformPicker"), "platform multi-select present")
    assert(src.includes("HashtagsEditor"), "hashtags editor present")
    assert(src.includes("ScoreSlider"), "scoring sliders present")
  })

  await caseRun(
    "18/20 transcript editor exposes Create-clip button + clip action import",
    async () => {
      const src = await readRel(
        "app/admin/khat-brain/episodes/[eirId]/transcript-editor-client.tsx",
      )
      assert(
        src.includes("createClipFromSegmentAction"),
        "transcript imports createClipFromSegmentAction",
      )
      assert(
        src.includes("title=\"إنشاء مقطع من هنا\""),
        "create-clip button present in segment toolbar",
      )
    },
  )

  await caseRun(
    "19/20 chapter editor exposes Generate-clip button + clip action import",
    async () => {
      const src = await readRel(
        "app/admin/khat-brain/episodes/[eirId]/chapter-editor-client.tsx",
      )
      assert(
        src.includes("generateClipsFromChapterAction"),
        "chapter editor imports generateClipsFromChapterAction",
      )
      assert(
        src.includes("title=\"توليد مقطع من هذا الفصل\""),
        "generate-clip button present in chapter card",
      )
    },
  )

  await caseRun("20/20 AI suggestion shapes are typed + dedup-friendly", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/clip-actions.ts",
    )
    // 14 AI kinds enumerated.
    for (const k of [
      "viral_moment",
      "emotional_peak",
      "controversial_moment",
      "philosophical_insight",
      "retention_hook",
      "strong_opener",
      "short_form_opportunity",
      "quote_worthy",
      "better_hook",
      "shorter_hook",
      "thumbnail_text",
      "tiktok_first_rewrite",
      "youtube_shorts_rewrite",
      "stronger_emotional_framing",
    ]) {
      assert(src.includes(`"${k}"`), `AI kind "${k}" enumerated`)
    }
    assert(src.includes("seen.add(fp)"), "AI suggestion dedup present")
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
