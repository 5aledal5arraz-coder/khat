"use client"

/**
 * UX-9 — Clip Intelligence editor (client component).
 *
 * "A newsroom + strategy room + editing board."
 *
 * Composition (top → bottom):
 *   • Toolbar       — save, undo/redo, add, AI suggest, queue mode
 *   • Filter bar    — search + min-score + platform + status
 *   • Validation    — document-level summary
 *   • Timeline      — horizontal block strip (status colours)
 *   • Suggestions   — AI cards (Apply / Dismiss)
 *   • Clip cards    — per-clip editable surface (title/hook/scores/
 *                      platforms/thumbnail/hashtags/notes/export-plan)
 *
 * Reuses UX-7.5 / UX-8 primitives unchanged.
 */

import {
  useCallback,
  useEffect,
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
  Flame,
  ListPlus,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
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
  saveClipsAction,
  suggestClipImprovementsAction,
  type ClipAiSuggestion,
  type SaveClipsResult,
} from "./clip-actions"
import {
  CLIP_PLATFORMS,
  CLIP_RATIOS,
  CLIP_STATUSES,
  clipEditorialWeight,
  clipReducer,
  newClip,
  type Clip,
  type ClipDocument,
  type ClipMark,
  type ClipPlatform,
  type ClipRatio,
  type ClipStatus,
} from "@/lib/editorial/clip-types"
import {
  DEFAULT_CLIP_VALIDATION_LIMITS,
  filterClipsForQueue,
  issuesForClip,
  searchAndFilterClips,
  validateClipDocument,
  type ClipQueueMode,
  type ValidationIssue,
} from "@/lib/editorial/clip-validation"

interface EditorState {
  doc: ClipDocument
  version: number
}

export interface TranscriptContext {
  version: number
  segments: Array<{
    id: string
    text: string
    start_seconds: number | null
    end_seconds: number | null
  }>
}

export interface ChapterContext {
  id: string
  title: string
  start_seconds: number
  end_seconds: number | null
}

export interface ClipEditorProps {
  eirId: string
  initialDoc: ClipDocument
  /** Studio deep-link (`/admin/studio?video=…`); null when no session is linked. */
  studioHref: string | null
  transcriptContext: TranscriptContext | null
  chaptersContext: ChapterContext[]
}

export function ClipEditor({
  eirId,
  initialDoc,
  studioHref,
  transcriptContext,
  chaptersContext,
}: ClipEditorProps) {
  const initial: EditorState = useMemo(
    () => ({ doc: initialDoc, version: initialDoc.version }),
    [initialDoc],
  )
  const [state, setState] = useState<EditorState>(initial)
  const [conflictDoc, setConflictDoc] = useState<ClipDocument | null>(null)
  const [suggestions, setSuggestions] = useState<ClipAiSuggestion[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [queueMode, setQueueMode] = useState<ClipQueueMode>("all")
  const [search, setSearch] = useState("")
  const [minScore, setMinScore] = useState(0)
  const [platformFilter, setPlatformFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const stateRef = useRef(state)
  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])

  const dirty = useDirtyState()
  const undoHistory = useUndoHistory<EditorState>({ capacity: 50 })

  const editorSessionIdRef = useRef<string>("")
  if (editorSessionIdRef.current === "") {
    editorSessionIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `es-${Math.random().toString(36).slice(2, 14)}`
  }

  // ── Autosave ─────────────────────────────────────────────────────
  const autosave = useAutosave<EditorState>({
    surfaceId: `clips:${eirId}`,
    saver: async (payload, ctx) => {
      const result: SaveClipsResult = await saveClipsAction({
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
        "message" in result ? result.message : "فشل حفظ المقاطع",
      )
    },
    debounceMs: 1500,
  })

  // ── Mutation helpers ─────────────────────────────────────────────
  const dispatch = useCallback(
    (next: ClipDocument, fieldId: string) => {
      undoHistory.push(stateRef.current)
      setState({ ...stateRef.current, doc: next })
      dirty.markDirty(fieldId)
      autosave.request({ ...stateRef.current, doc: next })
    },
    [autosave, dirty, undoHistory],
  )

  const updateClip = useCallback(
    (id: string, patch: Partial<Clip>) => {
      const next = clipReducer(stateRef.current.doc, {
        type: "update",
        id,
        patch,
      })
      dispatch(next, `clip-${id}`)
    },
    [dispatch],
  )

  const deleteClip = useCallback(
    (id: string) => {
      const next = clipReducer(stateRef.current.doc, { type: "delete", id })
      dispatch(next, `clip-${id}-delete`)
    },
    [dispatch],
  )

  const addClip = useCallback(() => {
    const last = stateRef.current.doc.clips.slice(-1)[0]
    const start = last ? last.end_seconds + 5 : 0
    const c = newClip({
      title: "مقطع جديد",
      hook: "",
      start_seconds: start,
      end_seconds: start + 30,
    })
    const next = clipReducer(stateRef.current.doc, { type: "create", clip: c })
    dispatch(next, `clip-${c.id}-create`)
    setFocusedId(c.id)
  }, [dispatch])

  const moveClip = useCallback(
    (id: string, dir: -1 | 1) => {
      const sorted = [...stateRef.current.doc.clips].sort(
        (a, b) => a.start_seconds - b.start_seconds,
      )
      const i = sorted.findIndex((c) => c.id === id)
      const target = i + dir
      if (i < 0 || target < 0 || target >= sorted.length) return
      const a = sorted[i]
      const b = sorted[target]
      const aLen = a.end_seconds - a.start_seconds
      const bLen = b.end_seconds - b.start_seconds
      const next = clipReducer(stateRef.current.doc, {
        type: "bulk_replace",
        clips: stateRef.current.doc.clips.map((c) => {
          if (c.id === a.id) {
            return {
              ...c,
              start_seconds: b.start_seconds,
              end_seconds: b.start_seconds + aLen,
            }
          }
          if (c.id === b.id) {
            return {
              ...c,
              start_seconds: a.start_seconds,
              end_seconds: a.start_seconds + bLen,
            }
          }
          return c
        }),
      })
      dispatch(next, `clip-${id}-move`)
    },
    [dispatch],
  )

  // ── Undo / Redo ──────────────────────────────────────────────────
  const undo = useCallback(() => {
    const prev = undoHistory.undo(stateRef.current)
    if (!prev) return
    setState(prev)
    dirty.markDirty("clips-undo")
    autosave.request(prev)
  }, [autosave, dirty, undoHistory])

  const redo = useCallback(() => {
    const next = undoHistory.redo(stateRef.current)
    if (!next) return
    setState(next)
    dirty.markDirty("clips-redo")
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
      const r = await suggestClipImprovementsAction(eirId)
      if (r.ok) {
        setSuggestions((prev) => {
          // Dedup with existing local suggestions on patch fingerprint.
          const seen = new Set(
            prev.map(
              (p) => `${p.kind}|${p.clip_id ?? ""}|${JSON.stringify(p.patch)}`,
            ),
          )
          const merged = [...prev]
          for (const s of r.suggestions) {
            const fp = `${s.kind}|${s.clip_id ?? ""}|${JSON.stringify(s.patch)}`
            if (seen.has(fp)) continue
            seen.add(fp)
            merged.push(s)
          }
          return merged
        })
        toast({
          title: `${r.suggestions.length} اقتراح جاهز للمراجعة`,
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
    (s: ClipAiSuggestion) => {
      // Modify-existing kinds: better_hook, shorter_hook, tiktok_first_rewrite,
      // youtube_shorts_rewrite, stronger_emotional_framing.
      const isHookRewrite =
        s.kind === "better_hook" ||
        s.kind === "shorter_hook" ||
        s.kind === "tiktok_first_rewrite" ||
        s.kind === "youtube_shorts_rewrite" ||
        s.kind === "stronger_emotional_framing"
      if (isHookRewrite && s.clip_id && "hook" in s.patch) {
        updateClip(s.clip_id, { hook: s.patch.hook })
      } else if (
        s.kind === "thumbnail_text" &&
        s.clip_id &&
        "thumbnail_text" in s.patch
      ) {
        updateClip(s.clip_id, { thumbnail_text: s.patch.thumbnail_text })
      } else if (
        !s.clip_id &&
        "start_seconds" in s.patch &&
        "title" in s.patch &&
        "hook" in s.patch
      ) {
        const c = newClip({
          title: s.patch.title,
          hook: s.patch.hook,
          summary: s.patch.summary ?? null,
          start_seconds: s.patch.start_seconds,
          end_seconds: s.patch.end_seconds,
          source: "ai_generated",
          status: "draft",
        })
        const next = clipReducer(stateRef.current.doc, {
          type: "create",
          clip: c,
        })
        dispatch(next, `clip-${c.id}-create`)
        setFocusedId(c.id)
      }
      setSuggestions((prev) => prev.filter((p) => p.id !== s.id))
    },
    [dispatch, updateClip],
  )

  const dismissSuggestion = useCallback(
    (id: string) => setSuggestions((prev) => prev.filter((p) => p.id !== id)),
    [],
  )

  // ── Validation ──────────────────────────────────────────────────
  const validation = useMemo(
    () => validateClipDocument(state.doc, DEFAULT_CLIP_VALIDATION_LIMITS),
    [state.doc],
  )

  // ── Filtered + queue-scoped view ─────────────────────────────────
  const visibleClips = useMemo(() => {
    const queueScoped = filterClipsForQueue(state.doc.clips, queueMode)
    return searchAndFilterClips(queueScoped, {
      query: search,
      minScore: minScore || undefined,
      platform: platformFilter || undefined,
      status: statusFilter || undefined,
    }).sort((a, b) => clipEditorialWeight(b) - clipEditorialWeight(a))
  }, [state.doc.clips, queueMode, search, minScore, platformFilter, statusFilter])

  // ── Keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault()
        undo()
      } else if (
        meta &&
        (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))
      ) {
        e.preventDefault()
        redo()
      } else if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void autosave.flush()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [undo, redo, autosave])

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
            label: "مقطع جديد",
            icon: <ListPlus className="h-3.5 w-3.5" />,
            onClick: addClip,
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
              {state.doc.clips.length} مقطع
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

      {/* Queue mode tabs */}
      <QueueModeTabs
        mode={queueMode}
        onChange={setQueueMode}
        counts={{
          all: state.doc.clips.length,
          priority: filterClipsForQueue(state.doc.clips, "priority").length,
          must_publish: filterClipsForQueue(state.doc.clips, "must_publish").length,
          draft: filterClipsForQueue(state.doc.clips, "draft").length,
          approved: filterClipsForQueue(state.doc.clips, "approved").length,
          export_ready: filterClipsForQueue(state.doc.clips, "export_ready").length,
        }}
      />

      {/* Filter bar */}
      <FilterBar
        search={search}
        onSearch={setSearch}
        minScore={minScore}
        onMinScore={setMinScore}
        platformFilter={platformFilter}
        onPlatformFilter={setPlatformFilter}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
      />

      {/* Document-level validation */}
      {validation.issues.filter((i) => i.clip_ids.length === 0).length > 0 && (
        <ValidationSummary
          issues={validation.issues.filter((i) => i.clip_ids.length === 0)}
        />
      )}

      {/* Timeline */}
      <ClipTimeline
        doc={state.doc}
        focusedId={focusedId}
        onFocus={setFocusedId}
      />

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <SuggestionsPanel
          suggestions={suggestions}
          clips={state.doc.clips}
          onApply={applySuggestion}
          onDismiss={dismissSuggestion}
          onClear={() => setSuggestions([])}
        />
      )}

      {/* Clip cards or empty state */}
      {state.doc.clips.length === 0 ? (
        <EmptyState onAdd={addClip} studioHref={studioHref} />
      ) : visibleClips.length === 0 ? (
        <div className="rounded-2xl border border-border/40 bg-card/20 p-4 text-center text-[12px] text-muted-foreground">
          لا توجد مقاطع تطابق الفلاتر الحالية.
        </div>
      ) : (
        <div className="space-y-2" dir="rtl">
          {visibleClips.map((c, i) => (
            <ClipCard
              key={c.id}
              clip={c}
              index={i}
              isFocused={focusedId === c.id}
              isDirty={dirty.isFieldDirty(`clip-${c.id}`)}
              onFocus={() => setFocusedId(c.id)}
              onChange={(patch) => updateClip(c.id, patch)}
              onDelete={() => deleteClip(c.id)}
              onMoveUp={() => moveClip(c.id, -1)}
              onMoveDown={() => moveClip(c.id, 1)}
              issues={issuesForClip(validation, c.id)}
              transcriptContext={transcriptContext}
              chaptersContext={chaptersContext}
              eirId={eirId}
            />
          ))}
        </div>
      )}

      <p className="text-[10.5px] text-muted-foreground">
        النسخة: {state.version} · المدة:{" "}
        {state.doc.total_duration_seconds
          ? formatTime(state.doc.total_duration_seconds)
          : "—"}{" "}
        · النصّ المرتبط: {state.doc.source_transcript_record_id ? "نعم" : "لا"}
      </p>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────

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
            عدّل محرّر آخر المقاطع في الخادم (نسخة {theirVersion}).
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

function QueueModeTabs({
  mode,
  onChange,
  counts,
}: {
  mode: ClipQueueMode
  onChange: (m: ClipQueueMode) => void
  counts: Record<ClipQueueMode, number>
}) {
  const modes: Array<{ key: ClipQueueMode; label: string }> = [
    { key: "all", label: "الكل" },
    { key: "priority", label: "الأولوية" },
    { key: "must_publish", label: "نشر إلزامي" },
    { key: "draft", label: "مسودات" },
    { key: "approved", label: "معتمدة" },
    { key: "export_ready", label: "جاهزة للتصدير" },
  ]
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border/40 pb-1.5">
      {modes.map((m) => {
        const active = mode === m.key
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            className={
              "inline-flex items-center gap-1 rounded-t-lg border-b-2 px-2.5 py-1 text-[11.5px] transition-colors " +
              (active
                ? "border-violet-400 text-violet-700"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {m.label}
            <span
              className={
                "rounded-full px-1.5 py-0 text-[10px] tabular-nums " +
                (active
                  ? "bg-violet-500/20 text-violet-700"
                  : "bg-background/40 text-muted-foreground")
              }
              dir="ltr"
            >
              {counts[m.key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function FilterBar({
  search,
  onSearch,
  minScore,
  onMinScore,
  platformFilter,
  onPlatformFilter,
  statusFilter,
  onStatusFilter,
}: {
  search: string
  onSearch: (s: string) => void
  minScore: number
  onMinScore: (n: number) => void
  platformFilter: string
  onPlatformFilter: (s: string) => void
  statusFilter: string
  onStatusFilter: (s: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-card/30 p-2">
      <div className="flex flex-1 items-center gap-1.5 rounded-xl bg-background/40 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="بحث (عنوان، خطّاف، هاشتاغ، ملاحظات…)"
          className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
          dir="auto"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch("")}
            className="rounded p-0.5 hover:bg-background/40"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <label className="inline-flex items-center gap-1.5 rounded-xl bg-background/40 px-2 py-1 text-[10.5px] text-muted-foreground">
        قوة ≥
        <input
          type="number"
          min={0}
          max={100}
          value={minScore}
          onChange={(e) => onMinScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          className="w-12 rounded-md bg-transparent text-center text-[11.5px] tabular-nums outline-none"
          dir="ltr"
        />
      </label>
      <select
        value={platformFilter}
        onChange={(e) => onPlatformFilter(e.target.value)}
        className="rounded-xl border border-border/40 bg-background/40 px-2 py-1 text-[11px] outline-none"
        aria-label="منصّة"
      >
        <option value="">كلّ المنصّات</option>
        {CLIP_PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {PLATFORM_LABEL[p]}
          </option>
        ))}
      </select>
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilter(e.target.value)}
        className="rounded-xl border border-border/40 bg-background/40 px-2 py-1 text-[11px] outline-none"
        aria-label="حالة"
      >
        <option value="">كلّ الحالات</option>
        {CLIP_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </div>
  )
}

function ClipTimeline({
  doc,
  focusedId,
  onFocus,
}: {
  doc: ClipDocument
  focusedId: string | null
  onFocus: (id: string) => void
}) {
  const total = doc.total_duration_seconds
  const sorted = useMemo(
    () => [...doc.clips].sort((a, b) => a.start_seconds - b.start_seconds),
    [doc.clips],
  )
  if (sorted.length === 0) return null
  const t =
    total !== null && total > 0
      ? total
      : Math.max(...sorted.map((c) => c.end_seconds))
  return (
    <div className="rounded-2xl border border-border/40 bg-card/30 p-3" dir="ltr">
      <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-muted-foreground">
        <span>00:00</span>
        <span className="text-[10.5px] uppercase tracking-wider">
          الخط الزمني للمقاطع
        </span>
        <span>{formatTime(t)}</span>
      </div>
      <div className="relative h-9 overflow-hidden rounded-lg bg-background/40">
        {sorted.map((c) => {
          const left = Math.max(0, Math.min(100, (c.start_seconds / t) * 100))
          const width = Math.max(
            0.5,
            Math.min(100 - left, ((c.end_seconds - c.start_seconds) / t) * 100),
          )
          const weight = clipEditorialWeight(c)
          const cls = blockClasses(c.status, weight, c.mark)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onFocus(c.id)}
              title={`${c.title} · ${formatTime(c.start_seconds)} → ${formatTime(c.end_seconds)} · قوة ${weight}`}
              className={
                "absolute top-0 h-full overflow-hidden border-s border-background/60 px-1 text-[9.5px] text-foreground/95 transition-colors " +
                cls +
                (focusedId === c.id ? " ring-2 ring-white/50" : "")
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

function blockClasses(
  status: ClipStatus,
  weight: number,
  mark: ClipMark,
): string {
  if (mark === "must_publish") {
    return "bg-rose-500/55 hover:bg-rose-500/75"
  }
  if (mark === "priority" || weight >= 70) {
    return "bg-amber-500/55 hover:bg-amber-500/75"
  }
  switch (status) {
    case "exported":
      return "bg-emerald-500/45 hover:bg-emerald-500/65"
    case "approved":
      return "bg-emerald-400/35 hover:bg-emerald-400/55"
    case "reviewed":
      return "bg-violet-500/40 hover:bg-violet-500/60"
    default:
      return "bg-slate-500/35 hover:bg-slate-500/55"
  }
}

interface ClipCardProps {
  clip: Clip
  index: number
  isFocused: boolean
  isDirty: boolean
  onFocus: () => void
  onChange: (patch: Partial<Clip>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  issues: ValidationIssue[]
  transcriptContext: TranscriptContext | null
  chaptersContext: ChapterContext[]
  eirId: string
}

function ClipCard({
  clip,
  index,
  isFocused,
  isDirty,
  onFocus,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  issues,
  transcriptContext,
  chaptersContext,
  eirId,
}: ClipCardProps) {
  const weight = clipEditorialWeight(clip)
  const isHigh = weight >= 70
  const isMust = clip.mark === "must_publish"
  const blockers = issues.filter((i) => i.severity === "blocker")
  const warnings = issues.filter((i) => i.severity === "warning")

  // Pull anchored segment text for context preview.
  const anchoredText = useMemo(() => {
    if (!transcriptContext) return null
    const id = clip.transcript_segment_ids[0]
    if (!id) return null
    const seg = transcriptContext.segments.find((s) => s.id === id)
    return seg?.text ?? null
  }, [clip.transcript_segment_ids, transcriptContext])
  const anchoredChapter = useMemo(() => {
    const id = clip.chapter_ids[0]
    if (!id) return null
    return chaptersContext.find((c) => c.id === id) ?? null
  }, [clip.chapter_ids, chaptersContext])

  // Editorial elevation: when weight >= 70 OR must_publish, the card
  // border + ring "stands out" without being loud.
  const cardCls = isMust
    ? "border-rose-500/40 bg-rose-500/5"
    : isHigh
      ? "border-amber-500/40 bg-amber-500/5"
      : clip.mark === "priority"
        ? "border-violet-500/40 bg-violet-500/5"
        : "border-border/40 bg-card/30"

  return (
    <div
      onClick={onFocus}
      className={
        "rounded-2xl border p-3 transition-shadow " +
        cardCls +
        (isFocused ? " shadow-md ring-1 ring-violet-400/30" : "") +
        (blockers.length > 0 ? " border-rose-500/50" : "")
      }
    >
      {/* Header: rank + range + status + mark */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <span className="rounded-full bg-background/50 px-2 py-0.5 tabular-nums" dir="ltr">
          #{index + 1}
        </span>
        <input
          type="number"
          min={0}
          value={Math.floor(clip.start_seconds)}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (!Number.isFinite(v) || v < 0) return
            onChange({ start_seconds: v })
          }}
          className="w-16 rounded-md border border-border/30 bg-background/40 px-1.5 py-0.5 text-[10.5px] tabular-nums outline-none focus:border-violet-500/40"
          dir="ltr"
          aria-label="بداية بالثواني"
        />
        <span className="text-muted-foreground">→</span>
        <input
          type="number"
          min={Math.floor(clip.start_seconds) + 1}
          value={Math.floor(clip.end_seconds)}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (!Number.isFinite(v) || v <= clip.start_seconds) return
            onChange({ end_seconds: v })
          }}
          className="w-16 rounded-md border border-border/30 bg-background/40 px-1.5 py-0.5 text-[10.5px] tabular-nums outline-none focus:border-violet-500/40"
          dir="ltr"
          aria-label="نهاية بالثواني"
        />
        <span className="text-muted-foreground tabular-nums" dir="ltr">
          {formatTime(clip.start_seconds)} → {formatTime(clip.end_seconds)} (
          {formatTime(clip.end_seconds - clip.start_seconds)})
        </span>
        {clip.source === "ai_generated" && (
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9.5px] text-violet-700">
            AI
          </span>
        )}
        {isHigh && (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] text-amber-700">
            <Flame className="h-2.5 w-2.5" /> {weight}
          </span>
        )}
        {isDirty && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-amber-400"
            aria-label="dirty"
          />
        )}
        {clip.transcript_segment_ids[0] && (
          <a
            href={`/admin/khat-brain/episodes/${eirId}?tab=transcript&seg=${clip.transcript_segment_ids[0]}`}
            className="text-[10.5px] text-violet-700 hover:underline"
          >
            انتقال إلى النصّ ↗
          </a>
        )}
        <div className="ms-auto inline-flex items-center gap-0.5">
          <select
            value={clip.status}
            onChange={(e) => onChange({ status: e.target.value as ClipStatus })}
            className="rounded-md border border-border/30 bg-background/40 px-1.5 py-0.5 text-[10.5px] outline-none"
            aria-label="حالة"
          >
            {CLIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={clip.mark}
            onChange={(e) => onChange({ mark: e.target.value as ClipMark })}
            className="rounded-md border border-border/30 bg-background/40 px-1.5 py-0.5 text-[10.5px] outline-none"
            aria-label="علامة"
          >
            <option value="normal">عاديّ</option>
            <option value="priority">أولوية</option>
            <option value="must_publish">نشر إلزامي</option>
            <option value="archive">أرشفة</option>
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
            title="نقل لأسفل"
            className="rounded p-0.5 text-muted-foreground hover:bg-background/40"
          >
            <ArrowDown className="h-3 w-3" />
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

      {/* Title + hook */}
      <input
        type="text"
        value={clip.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="عنوان المقطع"
        className="mb-2 w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[13px] font-medium outline-none focus:border-violet-500/40"
        dir="auto"
      />
      <textarea
        value={clip.hook}
        onChange={(e) => onChange({ hook: e.target.value })}
        rows={2}
        placeholder="الخطّاف — جملة تشدّ المشاهد في أوّل ثانيتين"
        className="mb-2 w-full resize-y rounded-xl border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-violet-500/50"
        dir="auto"
      />
      {clip.summary !== null && (
        <textarea
          value={clip.summary}
          onChange={(e) => onChange({ summary: e.target.value })}
          rows={2}
          placeholder="ملخّص داخلي"
          className="mb-2 w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[11.5px] leading-relaxed outline-none focus:border-violet-500/40"
          dir="auto"
        />
      )}

      {/* Anchored context preview */}
      {(anchoredText || anchoredChapter) && (
        <div className="mb-2 rounded-xl border border-dashed border-border/40 bg-background/20 px-3 py-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
          {anchoredChapter && (
            <span className="me-2 inline-flex items-center gap-1 text-violet-700">
              <Star className="h-2.5 w-2.5" /> {anchoredChapter.title}
            </span>
          )}
          {anchoredText && <span dir="auto">«{anchoredText.slice(0, 180)}…»</span>}
        </div>
      )}

      {/* Scoring grid */}
      <div className="mb-2 grid grid-cols-5 gap-1.5">
        <ScoreSlider
          label="الخطّاف"
          value={clip.hook_score}
          onChange={(v) => onChange({ hook_score: v })}
          accent="amber"
        />
        <ScoreSlider
          label="عاطفة"
          value={clip.emotional_score}
          onChange={(v) => onChange({ emotional_score: v })}
          accent="rose"
        />
        <ScoreSlider
          label="عُمق"
          value={clip.depth_score}
          onChange={(v) => onChange({ depth_score: v })}
          accent="violet"
        />
        <ScoreSlider
          label="انتشار"
          value={clip.viral_score}
          onChange={(v) => onChange({ viral_score: v })}
          accent="emerald"
        />
        <ScoreSlider
          label="جدل"
          value={clip.controversy_score}
          onChange={(v) => onChange({ controversy_score: v })}
          accent="slate"
        />
      </div>

      {/* Platform + ratio + audience + thumbnail row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <PlatformPicker
          value={clip.platform_targets}
          onChange={(next) => onChange({ platform_targets: next })}
        />
        <select
          value={clip.recommended_ratio}
          onChange={(e) =>
            onChange({ recommended_ratio: e.target.value as ClipRatio })
          }
          className="rounded-lg border border-border/40 bg-background/40 px-2 py-1 text-[10.5px] outline-none"
          aria-label="نسبة العرض"
          dir="ltr"
        >
          {CLIP_RATIOS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={clip.thumbnail_text ?? ""}
          onChange={(e) =>
            onChange({ thumbnail_text: e.target.value || null })
          }
          placeholder="نصّ المصغّرة (≤ 6 كلمات)"
          className="flex-1 rounded-lg border border-border/40 bg-background/40 px-2 py-1 text-[11px] outline-none focus:border-violet-500/40"
          dir="auto"
        />
      </div>

      {/* Hashtags */}
      <HashtagsEditor
        value={clip.hashtags}
        onChange={(next) => onChange({ hashtags: next })}
      />

      {/* Notes (collapsed unless focused) */}
      {(isFocused || clip.editor_notes || clip.export_notes) && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <textarea
            value={clip.editor_notes ?? ""}
            onChange={(e) =>
              onChange({ editor_notes: e.target.value || null })
            }
            rows={2}
            placeholder="ملاحظات تحريرية (داخلية)"
            className="w-full resize-y rounded-xl border border-dashed border-border/30 bg-background/20 px-2 py-1.5 text-[11px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
          <textarea
            value={clip.export_notes ?? ""}
            onChange={(e) =>
              onChange({ export_notes: e.target.value || null })
            }
            rows={2}
            placeholder="تعليمات للتصدير (cuts, color, …)"
            className="w-full resize-y rounded-xl border border-dashed border-border/30 bg-background/20 px-2 py-1.5 text-[11px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </div>
      )}

      {/* Caption (focused only) */}
      {isFocused && (
        <textarea
          value={clip.caption_suggestion ?? ""}
          onChange={(e) =>
            onChange({ caption_suggestion: e.target.value || null })
          }
          rows={2}
          placeholder="نصّ النشر المُقترح (caption)"
          className="mt-2 w-full resize-y rounded-xl border border-border/40 bg-background/40 px-2 py-1.5 text-[11px] outline-none focus:border-violet-500/40"
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

function ScoreSlider({
  label,
  value,
  onChange,
  accent,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  accent: "amber" | "rose" | "violet" | "emerald" | "slate"
}) {
  const accentCls = {
    amber: "accent-amber-400",
    rose: "accent-rose-400",
    violet: "accent-violet-400",
    emerald: "accent-emerald-400",
    slate: "accent-slate-400",
  }[accent]
  const high = value >= 70
  return (
    <label className="block rounded-xl border border-border/40 bg-background/40 px-2 py-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span
          className={
            "tabular-nums " +
            (high ? "font-semibold text-foreground" : "text-muted-foreground")
          }
          dir="ltr"
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={"mt-0.5 w-full cursor-pointer " + accentCls}
        dir="ltr"
      />
    </label>
  )
}

function PlatformPicker({
  value,
  onChange,
}: {
  value: ClipPlatform[]
  onChange: (next: ClipPlatform[]) => void
}) {
  const toggle = (p: ClipPlatform) => {
    if (value.includes(p)) onChange(value.filter((x) => x !== p))
    else onChange([...value, p])
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {CLIP_PLATFORMS.map((p) => {
        const active = value.includes(p)
        return (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            className={
              "rounded-full border px-2 py-0.5 text-[10px] transition-colors " +
              (active
                ? "border-violet-500/40 bg-violet-500/15 text-violet-700"
                : "border-border/40 bg-background/30 text-muted-foreground hover:bg-background/50")
            }
          >
            {PLATFORM_LABEL[p]}
          </button>
        )
      })}
    </div>
  )
}

function HashtagsEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const v = draft.replace(/^#+/, "").trim()
    if (!v) return
    if (value.includes(v)) {
      setDraft("")
      return
    }
    onChange([...value, v])
    setDraft("")
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((h, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/5 px-2 py-0.5 text-[10px] text-violet-700"
          dir="auto"
        >
          #{h}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, k) => k !== i))}
            className="text-violet-700/70 hover:text-rose-700"
            aria-label={`remove ${h}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add()
          }
        }}
        placeholder="هاشتاغ + Enter"
        className="rounded-full border border-dashed border-border/40 bg-background/30 px-2 py-0.5 text-[10px] outline-none focus:border-violet-500/40"
        dir="auto"
        aria-label="إضافة هاشتاغ"
      />
      <button
        type="button"
        onClick={add}
        disabled={!draft.trim()}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-background/40 disabled:opacity-30"
        aria-label="إضافة"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}

function SuggestionsPanel({
  suggestions,
  clips,
  onApply,
  onDismiss,
  onClear,
}: {
  suggestions: ClipAiSuggestion[]
  clips: Clip[]
  onApply: (s: ClipAiSuggestion) => void
  onDismiss: (id: string) => void
  onClear: () => void
}) {
  const byId = new Map(clips.map((c) => [c.id, c]))
  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-violet-700">
          <Sparkles className="h-3.5 w-3.5" /> غرفة العمليات الذكية ·{" "}
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
                {s.clip_id && byId.has(s.clip_id) && (
                  <span className="ms-2 text-muted-foreground">
                    · {byId.get(s.clip_id)!.title || "—"}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-foreground/85">
                {s.reason}
              </p>
              {"hook" in s.patch && (
                <p className="mt-1 text-[11.5px]" dir="auto">
                  <span className="text-muted-foreground">خطّاف مقترح: </span>
                  <span className="text-foreground">{s.patch.hook}</span>
                </p>
              )}
              {"thumbnail_text" in s.patch && (
                <p className="mt-1 text-[11.5px]" dir="auto">
                  <span className="text-muted-foreground">نصّ المصغّرة: </span>
                  <span className="text-foreground">{s.patch.thumbnail_text}</span>
                </p>
              )}
              {!s.clip_id && "title" in s.patch && (
                <>
                  <p className="mt-1 text-[11.5px]" dir="auto">
                    <span className="text-muted-foreground">عنوان مقترح: </span>
                    <span className="text-foreground">{s.patch.title}</span>
                  </p>
                  {"start_seconds" in s.patch && (
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground" dir="ltr">
                      range: {formatTime(s.patch.start_seconds)} →{" "}
                      {formatTime(s.patch.end_seconds)}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => onApply(s)}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-700 hover:bg-violet-500/20"
              >
                <Check className="h-3 w-3" /> تطبيق
              </button>
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

function EmptyState({
  onAdd,
  studioHref,
}: {
  onAdd: () => void
  studioHref: string | null
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/20 p-6 text-center">
      <Film className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="mt-2 text-[13px] font-semibold">
        لا توجد مقاطع بعد — ابدأ بناء حركة الحلقة
      </h3>
      <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">
        أضف مقطعاً يدوياً، أو اطلب من غرفة العمليات الذكية اقتراح أقوى لحظات
        الحلقة. كلّ مقطع يحمل خطّاف، توقيع عاطفي، وخطّة منصّة.
      </p>
      <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-700 hover:bg-violet-500/20"
        >
          <ListPlus className="h-3.5 w-3.5" />
          إضافة مقطع
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

// ─── Constants ───────────────────────────────────────────────────────

const STATUS_LABEL: Record<ClipStatus, string> = {
  draft: "مسوّدة",
  reviewed: "مُراجَع",
  approved: "معتمد",
  exported: "منشور",
}

const PLATFORM_LABEL: Record<ClipPlatform, string> = {
  youtube_shorts: "YT Shorts",
  tiktok: "TikTok",
  instagram_reels: "Reels",
  twitter: "X/Twitter",
  linkedin: "LinkedIn",
  newsletter: "النشرة",
}

const SUGGESTION_LABEL: Record<ClipAiSuggestion["kind"], string> = {
  viral_moment: "لحظة منتشرة",
  emotional_peak: "ذروة عاطفية",
  controversial_moment: "لحظة جدلية",
  philosophical_insight: "رؤية فلسفية",
  retention_hook: "خطّاف يحافظ على الانتباه",
  strong_opener: "افتتاحية قوية",
  short_form_opportunity: "فرصة قصيرة",
  quote_worthy: "قابل للاقتباس",
  better_hook: "خطّاف أقوى",
  shorter_hook: "خطّاف أقصر",
  thumbnail_text: "نصّ مصغّرة",
  tiktok_first_rewrite: "صياغة TikTok-first",
  youtube_shorts_rewrite: "صياغة YT Shorts",
  stronger_emotional_framing: "تأطير عاطفي أقوى",
}

// ─── Helpers ─────────────────────────────────────────────────────────

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
