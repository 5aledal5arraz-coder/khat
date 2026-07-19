"use client"

/**
 * UX-8 Phase B + D + F — Workspace chapter editor (client component).
 *
 * Composes the UX-7.5 editorial primitives:
 *   • useAutosave — debounced save with conflict + telemetry
 *   • useDirtyState — per-chapter dirty indicators
 *   • useUndoHistory — bounded undo/redo
 *   • EditorStatusBadge / EditorToolbar
 *
 * Renders three stacked surfaces:
 *   1. Toolbar (save, undo, redo, add, normalize, AI suggest)
 *   2. Timeline (visual horizontal blocks with overlap/gap markers)
 *   3. Chapter list (one card per chapter, inline edit)
 *   + AI suggestions side panel (Phase E)
 *   + Validation summary (Phase F)
 */

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Film,
  ListPlus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Sparkles,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react"
import {
  EditorStatusBadge,
  EditorToolbar,
  useAutosave,
  useDirtyState,
  useUndoHistory,
} from "@/components/editorial"
import { toast } from "@/lib/use-toast"
import {
  saveChaptersAction,
  suggestChapterImprovementsAction,
  type ChapterAiSuggestion,
  type SaveChaptersResult,
} from "./chapter-actions"
import { generateClipsFromChapterAction } from "./clip-actions"
import {
  CHAPTER_STATUSES,
  chapterReducer,
  newChapter,
  type Chapter,
  type ChapterDocument,
  type ChapterStatus,
} from "@/lib/editorial/chapter-types"
import {
  DEFAULT_VALIDATION_LIMITS,
  issuesForChapter,
  normalizeChapterTimes,
  validateChapterDocument,
  type ValidationIssue,
} from "@/lib/editorial/chapter-validation"

interface EditorState {
  doc: ChapterDocument
  version: number
}

export interface ChapterEditorProps {
  eirId: string
  initialDoc: ChapterDocument
  /** Studio deep-link (`/admin/studio?video=…`); null when no session is linked. */
  studioHref: string | null
}

export function ChapterEditor({
  eirId,
  initialDoc,
  studioHref,
}: ChapterEditorProps) {
  const initial: EditorState = useMemo(
    () => ({ doc: initialDoc, version: initialDoc.version }),
    [initialDoc],
  )
  const [state, setState] = useState<EditorState>(initial)
  const [conflictDoc, setConflictDoc] = useState<ChapterDocument | null>(null)
  const [suggestions, setSuggestions] = useState<ChapterAiSuggestion[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const stateRef = useRef(state)
  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])

  const dirty = useDirtyState()
  const undoHistory = useUndoHistory<EditorState>({ capacity: 50 })

  // Per-mount editor session id (UX-7.5 Phase E pattern).
  const editorSessionIdRef = useRef<string>("")
  if (editorSessionIdRef.current === "") {
    editorSessionIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `es-${Math.random().toString(36).slice(2, 14)}`
  }

  // ── Autosave ─────────────────────────────────────────────────────
  const autosave = useAutosave<EditorState>({
    surfaceId: `chapters:${eirId}`,
    saver: async (payload, ctx) => {
      const result: SaveChaptersResult = await saveChaptersAction({
        eirId,
        expectedVersion: payload.version,
        doc: payload.doc,
        editorSessionId: editorSessionIdRef.current,
        txnId: ctx?.txnId,
      })
      if (result.ok) {
        setState((s) => ({
          ...s,
          version: result.newVersion,
          doc: { ...s.doc, version: result.newVersion },
        }))
        dirty.markClean()
        return
      }
      if (result.code === "version_conflict") {
        setConflictDoc(result.currentDoc)
        throw new Error("تعارض في النسخة")
      }
      throw new Error(
        "message" in result ? result.message : "فشل حفظ الفصول",
      )
    },
    debounceMs: 1500,
  })

  // ── Mutation helpers ─────────────────────────────────────────────
  const dispatch = useCallback(
    (next: ChapterDocument, fieldId: string) => {
      undoHistory.push(stateRef.current)
      setState({ ...stateRef.current, doc: next })
      dirty.markDirty(fieldId)
      autosave.request({ ...stateRef.current, doc: next })
    },
    [autosave, dirty, undoHistory],
  )

  const updateChapter = useCallback(
    (id: string, patch: Partial<Chapter>) => {
      const next = chapterReducer(stateRef.current.doc, {
        type: "update",
        id,
        patch,
      })
      dispatch(next, `chapter-${id}`)
    },
    [dispatch],
  )

  const deleteChapter = useCallback(
    (id: string) => {
      const next = chapterReducer(stateRef.current.doc, { type: "delete", id })
      dispatch(next, `chapter-${id}-delete`)
    },
    [dispatch],
  )

  const addChapter = useCallback(() => {
    const segs = stateRef.current.doc.chapters
    const lastEnd =
      segs.length > 0
        ? (segs[segs.length - 1].end_seconds ?? segs[segs.length - 1].start_seconds + 60)
        : 0
    const ch = newChapter({ start_seconds: lastEnd, title: "فصل جديد" })
    const next = chapterReducer(stateRef.current.doc, {
      type: "create",
      chapter: ch,
    })
    dispatch(next, `chapter-${ch.id}-create`)
    setFocusedId(ch.id)
  }, [dispatch])

  const moveChapter = useCallback(
    (id: string, dir: -1 | 1) => {
      const sorted = [...stateRef.current.doc.chapters].sort(
        (a, b) => a.start_seconds - b.start_seconds,
      )
      const i = sorted.findIndex((c) => c.id === id)
      if (i < 0) return
      const target = i + dir
      if (target < 0 || target >= sorted.length) return
      // Swap start_seconds + recompute via reducer.
      const a = sorted[i]
      const b = sorted[target]
      const swapped = chapterReducer(stateRef.current.doc, {
        type: "bulk_replace",
        chapters: stateRef.current.doc.chapters.map((c) => {
          if (c.id === a.id) return { ...c, start_seconds: b.start_seconds }
          if (c.id === b.id) return { ...c, start_seconds: a.start_seconds }
          return c
        }),
      })
      dispatch(swapped, `chapter-${id}-move`)
    },
    [dispatch],
  )

  const normalizeTimes = useCallback(() => {
    const next = normalizeChapterTimes(stateRef.current.doc)
    dispatch(next, "chapters-normalize")
    toast({
      title: "تمت تسوية الأوقات",
      description: "تم إغلاق الفجوات بين الفصول.",
      variant: "success",
      duration: 1800,
    })
  }, [dispatch])

  // ── Undo/Redo ────────────────────────────────────────────────────
  const undo = useCallback(() => {
    const prev = undoHistory.undo(stateRef.current)
    if (!prev) return
    setState(prev)
    dirty.markDirty("chapters-undo")
    autosave.request(prev)
  }, [autosave, dirty, undoHistory])

  const redo = useCallback(() => {
    const next = undoHistory.redo(stateRef.current)
    if (!next) return
    setState(next)
    dirty.markDirty("chapters-redo")
    autosave.request(next)
  }, [autosave, dirty, undoHistory])

  // ── Conflict resolution ─────────────────────────────────────────
  const adoptServerDoc = useCallback(() => {
    if (!conflictDoc) return
    setState({ doc: conflictDoc, version: conflictDoc.version })
    setConflictDoc(null)
    dirty.markClean()
    undoHistory.clear()
    toast({
      title: "تم استرجاع النسخة من الخادم",
      description: "تم تجاهل تغييراتك المحلية.",
      variant: "warning",
    })
  }, [conflictDoc, dirty, undoHistory])

  const overwriteServer = useCallback(() => {
    if (!conflictDoc) return
    setState((s) => ({ ...s, version: conflictDoc.version }))
    setConflictDoc(null)
    autosave.request({
      ...stateRef.current,
      version: conflictDoc.version,
    })
  }, [autosave, conflictDoc])

  // ── AI suggestions ──────────────────────────────────────────────
  const requestSuggestions = useCallback(async () => {
    setAiBusy(true)
    try {
      const r = await suggestChapterImprovementsAction(eirId)
      if (r.ok) {
        setSuggestions(r.suggestions)
        toast({
          title: `${r.suggestions.length} اقتراح جاهز للمراجعة`,
          variant: "default",
          duration: 1800,
        })
      } else {
        toast({
          title: "تعذّر توليد الاقتراحات",
          description:
            "message" in r ? r.message : "خطأ غير متوقع",
          variant: "error",
        })
      }
    } finally {
      setAiBusy(false)
    }
  }, [eirId])

  const applySuggestion = useCallback(
    (s: ChapterAiSuggestion) => {
      if (s.kind === "title_rewrite" && s.chapter_id && "title" in s.patch) {
        updateChapter(s.chapter_id, { title: s.patch.title })
      } else if (s.kind === "summary_rewrite" && s.chapter_id && "summary" in s.patch) {
        updateChapter(s.chapter_id, { summary: s.patch.summary })
      } else if (
        s.kind === "missing_chapter" &&
        "title" in s.patch &&
        "start_seconds" in s.patch &&
        "summary" in s.patch
      ) {
        const ch = newChapter({
          title: s.patch.title,
          summary: s.patch.summary,
          start_seconds: s.patch.start_seconds,
          source: "ai_generated",
          status: "draft",
        })
        const next = chapterReducer(stateRef.current.doc, {
          type: "create",
          chapter: ch,
        })
        dispatch(next, `chapter-${ch.id}-create`)
        setFocusedId(ch.id)
      }
      setSuggestions((prev) => prev.filter((p) => p.id !== s.id))
    },
    [dispatch, updateChapter],
  )

  const dismissSuggestion = useCallback(
    (id: string) => setSuggestions((prev) => prev.filter((p) => p.id !== id)),
    [],
  )

  // ── UX-9 Phase D: Generate clip from chapter ────────────────────
  // Hits the workspace clip action with the latest expected version,
  // surfacing the resulting clip via toast. The clip doc lives in a
  // separate row so this never collides with the chapter autosave.
  const generateClipFromChapter = useCallback(
    async (chapterId: string) => {
      const tryGen = async (expectedVersion: number) =>
        generateClipsFromChapterAction({
          eirId,
          chapterId,
          expectedVersion,
        })
      let r = await tryGen(0)
      if (!r.ok && r.code === "version_conflict") {
        r = await tryGen(r.currentVersion)
      }
      if (r.ok) {
        toast({
          title: "تم توليد مقطع جديد",
          description: "افتح تبويب المقاطع لمراجعة الخطّاف والنشر.",
          variant: "success",
          duration: 1800,
        })
        return
      }
      toast({
        title: "تعذّر توليد المقطع",
        description: "message" in r ? r.message : "خطأ غير متوقع",
        variant: "error",
      })
    },
    [eirId],
  )

  // ── Validation ──────────────────────────────────────────────────
  const validation = useMemo(
    () => validateChapterDocument(state.doc, DEFAULT_VALIDATION_LIMITS),
    [state.doc],
  )

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {conflictDoc && (
        <ConflictBanner
          theirVersion={conflictDoc.version}
          onReload={adoptServerDoc}
          onOverwrite={overwriteServer}
        />
      )}

      <EditorToolbar
        actions={[
          {
            id: "save",
            label: "حفظ",
            icon: <Save className="h-3.5 w-3.5" />,
            onClick: () => void autosave.flush(),
            shortcut: "Ctrl+S",
            primary: true,
            variant: "primary",
            disabled: autosave.status === "saving",
          },
          {
            id: "undo",
            label: "تراجع",
            icon: <RotateCcw className="h-3.5 w-3.5" />,
            onClick: undo,
            shortcut: "Ctrl+Z",
            primary: true,
            disabled: !undoHistory.canUndo,
          },
          {
            id: "redo",
            label: "إعادة",
            icon: <RotateCw className="h-3.5 w-3.5" />,
            onClick: redo,
            shortcut: "Ctrl+Shift+Z",
            primary: true,
            disabled: !undoHistory.canRedo,
          },
          {
            id: "add",
            label: "فصل جديد",
            icon: <ListPlus className="h-3.5 w-3.5" />,
            onClick: addChapter,
          },
          {
            id: "normalize",
            label: "تسوية الأوقات",
            icon: <Wand2 className="h-3.5 w-3.5" />,
            onClick: normalizeTimes,
            disabled: state.doc.chapters.length < 2,
          },
          {
            id: "ai",
            label: aiBusy ? "جارٍ التوليد…" : "اقتراحات الذكاء",
            icon: <Sparkles className="h-3.5 w-3.5" />,
            onClick: () => void requestSuggestions(),
            disabled: aiBusy,
          },
        ]}
        trailing={
          <>
            <span
              className="rounded-full border border-border/40 bg-background/40 px-2 py-0.5 text-[10.5px] text-muted-foreground"
              dir="ltr"
            >
              {state.doc.chapters.length} فصل
            </span>
            {validation.blockerCount > 0 && (
              <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10.5px] text-rose-700">
                {validation.blockerCount} خطأ
              </span>
            )}
            {validation.warningCount > 0 && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-700">
                {validation.warningCount} تنبيه
              </span>
            )}
            <EditorStatusBadge
              status={autosave.status}
              savedAt={autosave.savedAt}
              error={autosave.error}
              pendingChanges={autosave.pendingChanges}
            />
          </>
        }
      />

      {/* Document-level validation summary */}
      {validation.issues.length > 0 && (
        <ValidationSummary issues={validation.issues.filter((i) => i.chapter_ids.length === 0)} />
      )}

      {/* Timeline */}
      <ChapterTimeline
        doc={state.doc}
        focusedId={focusedId}
        onFocus={setFocusedId}
      />

      {/* AI Suggestions panel */}
      {suggestions.length > 0 && (
        <SuggestionsPanel
          suggestions={suggestions}
          chapters={state.doc.chapters}
          onApply={applySuggestion}
          onDismiss={dismissSuggestion}
          onClear={() => setSuggestions([])}
        />
      )}

      {/* Chapter cards */}
      {state.doc.chapters.length === 0 ? (
        <EmptyState
          onAdd={addChapter}
          studioHref={studioHref}
        />
      ) : (
        <div className="space-y-2" dir="rtl">
          {[...state.doc.chapters]
            .sort((a, b) => a.start_seconds - b.start_seconds)
            .map((c, i, arr) => (
              <ChapterCard
                key={c.id}
                chapter={c}
                index={i}
                totalCount={arr.length}
                isFocused={focusedId === c.id}
                onFocus={() => setFocusedId(c.id)}
                onChangeTitle={(title) => updateChapter(c.id, { title })}
                onChangeSummary={(summary) => updateChapter(c.id, { summary })}
                onChangeStart={(start_seconds) =>
                  updateChapter(c.id, { start_seconds })
                }
                onChangeNotes={(notes) => updateChapter(c.id, { notes })}
                onChangeStatus={(status) => updateChapter(c.id, { status })}
                onMoveUp={() => moveChapter(c.id, -1)}
                onMoveDown={() => moveChapter(c.id, 1)}
                onDelete={() => deleteChapter(c.id)}
                onGenerateClip={() => void generateClipFromChapter(c.id)}
                isDirty={dirty.isFieldDirty(`chapter-${c.id}`)}
                issues={issuesForChapter(validation, c.id)}
                eirId={eirId}
              />
            ))}
        </div>
      )}

      <p className="text-[10.5px] text-muted-foreground">
        النسخة: {state.version} · المدة الكلية:{" "}
        {state.doc.total_duration_seconds
          ? formatTime(state.doc.total_duration_seconds)
          : "—"}{" "}
        · مرتبط بنصّ: {state.doc.source_transcript_record_id ? "نعم" : "لا"}
      </p>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────

interface ChapterCardProps {
  chapter: Chapter
  index: number
  totalCount: number
  isFocused: boolean
  onFocus: () => void
  onChangeTitle: (next: string) => void
  onChangeSummary: (next: string) => void
  onChangeStart: (next: number) => void
  onChangeNotes: (next: string) => void
  onChangeStatus: (next: ChapterStatus) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  /** UX-9 — generate a draft clip from this chapter range. */
  onGenerateClip: () => void
  isDirty: boolean
  issues: ValidationIssue[]
  eirId: string
}

function ChapterCard({
  chapter,
  index,
  totalCount,
  isFocused,
  onFocus,
  onChangeTitle,
  onChangeSummary,
  onChangeStart,
  onChangeNotes,
  onChangeStatus,
  onMoveUp,
  onMoveDown,
  onDelete,
  onGenerateClip,
  isDirty,
  issues,
  eirId,
}: ChapterCardProps) {
  const blockers = issues.filter((i) => i.severity === "blocker")
  const warnings = issues.filter((i) => i.severity === "warning")

  const statusCls =
    chapter.status === "approved"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : chapter.status === "reviewed"
        ? "border-violet-500/30 bg-violet-500/5"
        : "border-border/40 bg-card/30"

  return (
    <div
      onClick={onFocus}
      className={
        "rounded-2xl border p-3 transition-shadow " +
        statusCls +
        (isFocused ? " shadow-md ring-1 ring-violet-400/30" : "") +
        (blockers.length > 0 ? " border-rose-500/40" : "")
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <span className="rounded-full bg-background/50 px-2 py-0.5 tabular-nums" dir="ltr">
          #{index + 1}
        </span>
        <input
          type="text"
          value={Math.floor(chapter.start_seconds)}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (!Number.isFinite(v) || v < 0) return
            onChangeStart(v)
          }}
          className="w-16 rounded-md border border-border/30 bg-background/40 px-1.5 py-0.5 text-[10.5px] tabular-nums outline-none focus:border-violet-500/40"
          dir="ltr"
          aria-label="بداية الفصل بالثواني"
        />
        <span className="text-muted-foreground tabular-nums" dir="ltr">
          {formatTime(chapter.start_seconds)}
          {chapter.end_seconds !== null && ` → ${formatTime(chapter.end_seconds)}`}
          {chapter.end_seconds !== null &&
            ` (${formatTime(chapter.end_seconds - chapter.start_seconds)})`}
        </span>
        {chapter.source === "ai_generated" && (
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9.5px] text-violet-700">
            AI
          </span>
        )}
        {isDirty && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-amber-400"
            aria-label="dirty"
          />
        )}
        {chapter.transcript_segment_id && (
          <a
            href={`/admin/khat-brain/episodes/${eirId}?tab=transcript&seg=${chapter.transcript_segment_id}`}
            className="text-[10.5px] text-violet-700 hover:underline"
          >
            انتقال إلى النصّ ↗
          </a>
        )}
        <div className="ms-auto inline-flex items-center gap-0.5">
          <select
            value={chapter.status}
            onChange={(e) => onChangeStatus(e.target.value as ChapterStatus)}
            className="rounded-md border border-border/30 bg-background/40 px-1.5 py-0.5 text-[10.5px] outline-none"
            aria-label="حالة الفصل"
          >
            {CHAPTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            title="نقل لأعلى"
            className="rounded p-0.5 text-muted-foreground hover:bg-background/40 disabled:opacity-30"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === totalCount - 1}
            title="نقل لأسفل"
            className="rounded p-0.5 text-muted-foreground hover:bg-background/40 disabled:opacity-30"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onGenerateClip}
            title="توليد مقطع من هذا الفصل"
            className="rounded p-0.5 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-700"
            aria-label="توليد مقطع من هذا الفصل"
          >
            <Film className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="حذف"
            className="rounded p-0.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <input
        type="text"
        value={chapter.title}
        onChange={(e) => onChangeTitle(e.target.value)}
        placeholder="عنوان الفصل"
        className="mb-2 w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[13px] font-medium outline-none focus:border-violet-500/40"
        dir="auto"
      />
      <textarea
        value={chapter.summary ?? ""}
        onChange={(e) => onChangeSummary(e.target.value)}
        rows={2}
        placeholder="ملخّص قصير للفصل"
        className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-violet-500/40"
        dir="auto"
      />

      {(chapter.notes !== null || isFocused) && (
        <textarea
          value={chapter.notes ?? ""}
          onChange={(e) => onChangeNotes(e.target.value)}
          rows={1}
          placeholder="ملاحظات داخلية (لا تُنشر)"
          className="mt-2 w-full resize-y rounded-xl border border-dashed border-border/30 bg-background/20 px-3 py-1.5 text-[11.5px] text-muted-foreground outline-none focus:border-violet-500/40"
          dir="auto"
        />
      )}

      {(blockers.length > 0 || warnings.length > 0) && (
        <ul className="mt-2 space-y-0.5">
          {blockers.map((i, k) => (
            <li
              key={`b-${k}`}
              className="inline-flex items-center gap-1.5 text-[10.5px] text-rose-700"
            >
              <XCircle className="h-3 w-3" /> {i.message}
            </li>
          ))}
          {warnings.map((i, k) => (
            <li
              key={`w-${k}`}
              className="inline-flex items-center gap-1.5 text-[10.5px] text-amber-700"
            >
              <AlertTriangle className="h-3 w-3" /> {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const STATUS_LABEL: Record<ChapterStatus, string> = {
  draft: "مسوّدة",
  reviewed: "مُراجَع",
  approved: "معتمد",
}

function ConflictBanner({
  theirVersion,
  onReload,
  onOverwrite,
}: {
  theirVersion: number
  onReload: () => void
  onOverwrite: () => void
}) {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[12.5px] font-semibold text-rose-700">
            تعارض في النسخة
          </h3>
          <p className="mt-0.5 text-[11.5px] text-foreground/85">
            عدّل محرّر آخر الفصول في الخادم (نسخة {theirVersion}).
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onReload}
            className="rounded-xl border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11.5px] text-violet-700 hover:bg-violet-500/20"
          >
            استرجاع نسخة الخادم
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11.5px] text-rose-700 hover:bg-rose-500/20"
          >
            تجاوز وحفظ
          </button>
        </div>
      </div>
    </div>
  )
}

function ValidationSummary({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
        <AlertTriangle className="h-3 w-3" /> ملاحظات على المستند
      </div>
      <ul className="space-y-0.5 text-[11.5px] text-foreground/85">
        {issues.map((i, k) => (
          <li key={k}>{i.message}</li>
        ))}
      </ul>
    </div>
  )
}

interface ChapterTimelineProps {
  doc: ChapterDocument
  focusedId: string | null
  onFocus: (id: string) => void
}

function ChapterTimeline({ doc, focusedId, onFocus }: ChapterTimelineProps) {
  const total = doc.total_duration_seconds
  const sorted = useMemo(
    () => [...doc.chapters].sort((a, b) => a.start_seconds - b.start_seconds),
    [doc.chapters],
  )
  if (sorted.length === 0) return null
  // If we don't have a known total, derive one from the last chapter.
  const t =
    total !== null && total > 0
      ? total
      : Math.max(
          ...sorted.map(
            (c) => c.end_seconds ?? c.start_seconds + 60,
          ),
        )
  return (
    <div className="rounded-2xl border border-border/40 bg-card/30 p-3" dir="ltr">
      <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-muted-foreground">
        <span>00:00</span>
        <span className="text-[10.5px] uppercase tracking-wider">الخط الزمني</span>
        <span>{formatTime(t)}</span>
      </div>
      <div className="relative h-8 overflow-hidden rounded-lg bg-background/40">
        {sorted.map((c) => {
          const left = Math.max(0, Math.min(100, (c.start_seconds / t) * 100))
          const end = c.end_seconds ?? Math.min(t, c.start_seconds + 60)
          const width = Math.max(0.5, Math.min(100 - left, ((end - c.start_seconds) / t) * 100))
          const cls =
            c.status === "approved"
              ? "bg-emerald-500/40 hover:bg-emerald-500/60"
              : c.status === "reviewed"
                ? "bg-violet-500/40 hover:bg-violet-500/60"
                : "bg-amber-500/30 hover:bg-amber-500/50"
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onFocus(c.id)}
              title={`${c.title} · ${formatTime(c.start_seconds)} → ${c.end_seconds !== null ? formatTime(c.end_seconds) : "?"}`}
              className={
                "absolute top-0 h-full overflow-hidden border-s border-background/60 px-1 text-[9.5px] text-foreground/95 transition-colors " +
                cls +
                (focusedId === c.id ? " ring-2 ring-white/40" : "")
              }
              style={{ insetInlineStart: `${left}%`, width: `${width}%` }}
            >
              <span className="truncate">{c.title || "—"}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SuggestionsPanel({
  suggestions,
  chapters,
  onApply,
  onDismiss,
  onClear,
}: {
  suggestions: ChapterAiSuggestion[]
  chapters: Chapter[]
  onApply: (s: ChapterAiSuggestion) => void
  onDismiss: (id: string) => void
  onClear: () => void
}) {
  const byId = new Map(chapters.map((c) => [c.id, c]))
  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-violet-700">
          <Sparkles className="h-3.5 w-3.5" /> اقتراحات الذكاء الاصطناعي ·{" "}
          {suggestions.length}
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="text-[10.5px] text-muted-foreground hover:text-foreground"
        >
          إخفاء الكل
        </button>
      </div>
      <ul className="space-y-1.5">
        {suggestions.map((s) => (
          <li
            key={s.id}
            className="flex items-start gap-2 rounded-xl border border-border/40 bg-background/30 p-2"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-violet-700">
                {SUGGESTION_LABEL[s.kind]}
                {s.chapter_id && byId.has(s.chapter_id) && (
                  <span className="ms-2 text-muted-foreground">
                    · {byId.get(s.chapter_id)!.title || "—"}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-foreground/85">
                {s.reason}
              </p>
              {"title" in s.patch && (
                <p className="mt-1 text-[11.5px]" dir="auto">
                  <span className="text-muted-foreground">عنوان مقترح: </span>
                  <span className="text-foreground">{s.patch.title}</span>
                </p>
              )}
              {"summary" in s.patch && (
                <p className="mt-1 text-[11.5px] text-foreground/85" dir="auto">
                  <span className="text-muted-foreground">ملخّص مقترح: </span>
                  {s.patch.summary}
                </p>
              )}
              {s.kind === "missing_chapter" && "start_seconds" in s.patch && (
                <p className="mt-1 text-[10.5px] text-muted-foreground" dir="ltr">
                  start: {formatTime(s.patch.start_seconds)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {s.kind !== "weak_title_flag" && (
                <button
                  type="button"
                  onClick={() => onApply(s)}
                  className="inline-flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-700 hover:bg-violet-500/20"
                >
                  <Check className="h-3 w-3" /> تطبيق
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismiss(s.id)}
                className="text-[10.5px] text-muted-foreground hover:text-foreground"
              >
                تجاهل
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const SUGGESTION_LABEL: Record<ChapterAiSuggestion["kind"], string> = {
  title_rewrite: "إعادة صياغة عنوان",
  summary_rewrite: "إعادة صياغة ملخّص",
  missing_chapter: "فصل ناقص",
  weak_title_flag: "عنوان ضعيف",
}

function EmptyState({
  onAdd,
  studioHref,
}: {
  onAdd: () => void
  studioHref: string | null
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/20 p-6 text-center">
      <RefreshCw className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="mt-2 text-[13px] font-semibold">لا توجد فصول بعد</h3>
      <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">
        أضف فصلاً يدوياً، أو اطلب اقتراحات الذكاء الاصطناعي لاستخراج فصول
        من النصّ. يمكنك دائماً فتح الاستوديو القديم للمرجع.
      </p>
      <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-700 hover:bg-violet-500/20"
        >
          <ListPlus className="h-3.5 w-3.5" />
          إضافة فصل
        </button>
        {studioHref && (
          <a
            href={studioHref}
            className="inline-flex items-center gap-1 rounded-xl border border-border/40 bg-background/40 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-background/60"
          >
            الصفحة المتقدمة <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatTime(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return "—"
  const total = Math.max(0, Math.floor(s))
  const m = Math.floor(total / 60)
  const sec = total % 60
  const h = Math.floor(m / 60)
  const mm = (m % 60).toString().padStart(2, "0")
  const ss = sec.toString().padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
