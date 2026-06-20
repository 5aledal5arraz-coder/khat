"use client"

/**
 * UX-7 Phase A — Workspace transcript editor (client component).
 *
 * Capabilities:
 *   • full transcript read/edit (per-segment textarea)
 *   • speaker label editing (inline pill)
 *   • paragraph split / merge
 *   • search transcript (with match counts + jump-to-next)
 *   • timestamp jump (click a segment → scrolls into view)
 *   • undo/redo via @/components/editorial/use-undo-history
 *   • mark ranges (highlight / quote / cut / chapter_start)
 *   • diff indicator vs original snapshot
 *   • autosave with debounce + optimistic concurrency
 *   • virtualized rendering — only the visible window mounts to DOM
 *   • keyboard shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+S,
 *     Enter (split at cursor), Backspace-on-empty-segment (merge up).
 *
 * Virtualization strategy: simple windowing on a fixed-height row
 * estimate. We don't need pixel-perfect virtual lists for a few
 * thousand segments; we need DOM that doesn't choke at 5k. Each
 * segment renders inside a flex-column where collapsed (off-screen)
 * rows are replaced by a pad div with the same height. Edited /
 * focused rows expand fully and lose their height estimate so the
 * textarea grows naturally.
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
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Film as FilmIcon,
  Highlighter,
  Mic,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Search,
  Split,
  Quote as QuoteIcon,
  X,
  CornerDownLeft,
  ListPlus,
} from "lucide-react"
import {
  EditorStatusBadge,
  EditorToolbar,
  useAutosave,
  useDirtyState,
  useUndoHistory,
} from "@/components/editorial"
import { toast } from "@/lib/use-toast"
import { saveTranscriptAction, type SaveTranscriptResult } from "./transcript-actions"
import { createChapterFromSegmentAction } from "./chapter-actions"
import { createClipFromSegmentAction } from "./clip-actions"
import {
  newSegment,
  recomputeCounts,
  type TranscriptDocument,
  type TranscriptMark,
  type TranscriptSegment,
} from "@/lib/editorial/transcript-types"
import type { StudioAnalysisStatus } from "@/lib/db/schema/studio-analysis"
import { sourceLabel as translateSourceLabel } from "@/lib/operator-language"

const SURFACE_ID = "transcript"
const ROW_HEIGHT_ESTIMATE = 96 // px — collapsed segment row pad height
const OVERSCAN = 6

export interface TranscriptEditorProps {
  eirId: string
  initialDoc: TranscriptDocument
  sourceLabel: "studio_analysis_records" | "studio_transcripts" | "empty"
  recordStatus: StudioAnalysisStatus | "missing"
}

interface EditorState {
  doc: TranscriptDocument
  /** Server-confirmed version (for conflict detection). */
  version: number
}

export function TranscriptEditor({
  eirId,
  initialDoc,
  sourceLabel,
  recordStatus,
}: TranscriptEditorProps) {
  const initial: EditorState = useMemo(
    () => ({ doc: initialDoc, version: initialDoc.version }),
    [initialDoc],
  )

  const [state, setState] = useState<EditorState>(initial)
  const [search, setSearch] = useState("")
  const [activeMatch, setActiveMatch] = useState(0)
  const [focusedSegId, setFocusedSegId] = useState<string | null>(null)
  const [conflictDoc, setConflictDoc] = useState<TranscriptDocument | null>(null)
  const stateRef = useRef(state)
  // Sync the ref AFTER commit (mutating during render is a React 19
  // violation). Layout-effect timing keeps the ref current before any
  // event handler runs in the same tick.
  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])

  const dirty = useDirtyState()
  const undoHistory = useUndoHistory<EditorState>({ capacity: 50 })

  // Original snapshot for the "different from original" badge.
  // Held in state so React's strict ref-access lint stays clean and
  // so we can update it after a conflict resolve.
  const [originalDoc, setOriginalDoc] = useState<TranscriptDocument>(initialDoc)
  const dirtyVsOriginal = useMemo(
    () => isDocChanged(originalDoc, state.doc),
    [originalDoc, state.doc],
  )

  // ── Per-mount editor session id (UX-7.5 Phase E) ────────────────
  // Stable for the lifetime of this React mount. Carried on every
  // save so the server's edited_fields blob records who-was-editing
  // without enabling realtime collaboration yet.
  const editorSessionIdRef = useRef<string>("")
  if (editorSessionIdRef.current === "") {
    editorSessionIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `es-${Math.random().toString(36).slice(2, 14)}`
  }

  // ── Autosave ─────────────────────────────────────────────────────
  const autosave = useAutosave<EditorState>({
    surfaceId: `transcript:${eirId}`,
    saver: async (payload, ctx) => {
      const result: SaveTranscriptResult = await saveTranscriptAction({
        eirId,
        expectedVersion: payload.version,
        doc: payload.doc,
        editorSessionId: editorSessionIdRef.current,
        txnId: ctx?.txnId,
      })
      if (result.ok) {
        // Adopt the new server version, clear dirty.
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
        // Throwing here triggers autosave error UI — user resolves
        // via the conflict banner.
        throw new Error("تعارض في النسخة — راجع البيانات الجديدة")
      }
      throw new Error(
        result.code === "server_error"
          ? result.message
          : result.code === "validation"
            ? result.message
            : result.code === "no_session"
              ? result.message
              : "فشل الحفظ",
      )
    },
    debounceMs: 1500,
    maxAttempts: 3,
  })

  // ── Pushers — wrap every mutation so undo + autosave + dirty stay
  //    in sync without each handler reimplementing the dance. ──────
  const commitState = useCallback(
    (next: EditorState, fieldId: string) => {
      undoHistory.push(stateRef.current)
      setState(next)
      dirty.markDirty(fieldId)
      autosave.request(next)
    },
    [autosave, dirty, undoHistory],
  )

  const updateSegment = useCallback(
    (id: string, patch: Partial<TranscriptSegment>) => {
      const cur = stateRef.current
      const next = {
        ...cur,
        doc: {
          ...cur.doc,
          segments: cur.doc.segments.map((s) =>
            s.id === id ? { ...s, ...patch } : s,
          ),
        },
      }
      commitState(next, `segment-${id}`)
    },
    [commitState],
  )

  const splitSegment = useCallback(
    (id: string, splitIdx: number) => {
      const cur = stateRef.current
      const segs = cur.doc.segments
      const idx = segs.findIndex((s) => s.id === id)
      if (idx < 0) return
      const original = segs[idx]
      const before = original.text.slice(0, splitIdx).trimEnd()
      const after = original.text.slice(splitIdx).trimStart()
      const next = {
        ...cur,
        doc: {
          ...cur.doc,
          segments: [
            ...segs.slice(0, idx),
            { ...original, text: before },
            newSegment({
              text: after,
              speaker: original.speaker,
              start_seconds: original.end_seconds, // best-guess
              end_seconds: original.end_seconds,
            }),
            ...segs.slice(idx + 1),
          ],
        },
      }
      commitState(next, `segment-${id}-split`)
    },
    [commitState],
  )

  const mergeWithPrevious = useCallback(
    (id: string) => {
      const cur = stateRef.current
      const segs = cur.doc.segments
      const idx = segs.findIndex((s) => s.id === id)
      if (idx <= 0) return
      const prev = segs[idx - 1]
      const merged: TranscriptSegment = {
        ...prev,
        text: prev.text + (prev.text && segs[idx].text ? "\n" : "") + segs[idx].text,
        end_seconds: segs[idx].end_seconds ?? prev.end_seconds,
      }
      const next = {
        ...cur,
        doc: {
          ...cur.doc,
          segments: [...segs.slice(0, idx - 1), merged, ...segs.slice(idx + 1)],
        },
      }
      commitState(next, `segment-${id}-merge`)
    },
    [commitState],
  )

  const setMark = useCallback(
    (id: string, mark: TranscriptMark | null) => updateSegment(id, { mark }),
    [updateSegment],
  )

  const addSegmentAtEnd = useCallback(() => {
    const cur = stateRef.current
    const next = {
      ...cur,
      doc: {
        ...cur.doc,
        segments: [...cur.doc.segments, newSegment({ text: "" })],
      },
    }
    commitState(next, "segment-new")
  }, [commitState])

  // ── Undo / Redo ──────────────────────────────────────────────────
  const undo = useCallback(() => {
    const prev = undoHistory.undo(stateRef.current)
    if (!prev) return
    setState(prev)
    dirty.markDirty(SURFACE_ID + "-undo")
    autosave.request(prev)
  }, [autosave, dirty, undoHistory])

  const redo = useCallback(() => {
    const next = undoHistory.redo(stateRef.current)
    if (!next) return
    setState(next)
    dirty.markDirty(SURFACE_ID + "-redo")
    autosave.request(next)
  }, [autosave, dirty, undoHistory])

  // ── Keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault()
        undo()
      } else if (meta && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
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

  // ── Search ──────────────────────────────────────────────────────
  const matches = useMemo(() => {
    if (!search.trim()) return [] as Array<{ segId: string; segIdx: number }>
    const q = search.trim().toLowerCase()
    const out: Array<{ segId: string; segIdx: number }> = []
    state.doc.segments.forEach((s, i) => {
      if (s.text.toLowerCase().includes(q)) out.push({ segId: s.id, segIdx: i })
    })
    return out
  }, [search, state.doc.segments])

  // Clamp the active-match index at read time so the search re-render
  // doesn't try to setState inside an effect (React 19 strict).
  const clampedMatch =
    matches.length === 0 ? 0 : Math.min(activeMatch, matches.length - 1)

  const jumpMatch = useCallback(
    (dir: 1 | -1) => {
      if (matches.length === 0) return
      const next = (clampedMatch + dir + matches.length) % matches.length
      setActiveMatch(next)
      const segId = matches[next].segId
      const el = document.getElementById(rowDomId(segId))
      el?.scrollIntoView({ block: "center", behavior: "smooth" })
      setFocusedSegId(segId)
    },
    [matches, clampedMatch],
  )

  // ── Conflict resolution ─────────────────────────────────────────
  const adoptServerDoc = useCallback(() => {
    if (!conflictDoc) return
    setState({ doc: conflictDoc, version: conflictDoc.version })
    setConflictDoc(null)
    dirty.markClean()
    undoHistory.clear()
    setOriginalDoc(conflictDoc)
    toast({
      title: "تم استرجاع النسخة من الخادم",
      description: "تم تحميل التعديلات الجديدة وتجاهل تغييراتك المحلية.",
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
    toast({
      title: "ستتم الكتابة فوق نسخة الخادم",
      description: "سيُعاد المحاولة الآن.",
      variant: "default",
    })
  }, [autosave, conflictDoc])

  // ── UX-8 Phase C: Create chapter from segment ───────────────────
  // Hits the workspace chapter action and toasts the result. The
  // chapter doc lives in a separate row, so this doesn't interact
  // with the transcript autosave queue. We pass `expectedVersion: -1`
  // (a sentinel we'll fix below to do an "any-version" optimistic
  // create — the action keeps the conflict contract for safety).
  const createChapterAt = useCallback(
    async (segmentId: string) => {
      const r = await createChapterFromSegmentAction({
        eirId,
        segmentId,
        // Use 0 as the optimistic version — the action will surface a
        // version_conflict if the chapter doc has moved. Acceptable
        // for this single-shot operation; the operator just retries.
        expectedVersion: 0,
        editorSessionId: editorSessionIdRef.current,
      })
      if (r.ok) {
        toast({
          title: "تم إنشاء الفصل",
          description: "افتح تبويب الفصول لتعديل العنوان والملخّص.",
          variant: "success",
          duration: 1800,
        })
        return
      }
      if (r.code === "version_conflict") {
        // Retry once with the actual current version.
        const retry = await createChapterFromSegmentAction({
          eirId,
          segmentId,
          expectedVersion: r.currentVersion,
          editorSessionId: editorSessionIdRef.current,
        })
        if (retry.ok) {
          toast({
            title: "تم إنشاء الفصل",
            variant: "success",
            duration: 1800,
          })
          return
        }
      }
      toast({
        title: "تعذّر إنشاء الفصل",
        description: "message" in r ? r.message : "حدث خطأ غير متوقع",
        variant: "error",
      })
    },
    [eirId],
  )

  // ── UX-9 Phase D: Create clip from segment ──────────────────────
  const createClipAt = useCallback(
    async (segmentId: string) => {
      const tryCreate = async (expectedVersion: number) =>
        createClipFromSegmentAction({
          eirId,
          segmentId,
          expectedVersion,
          editorSessionId: editorSessionIdRef.current,
        })
      let r = await tryCreate(0)
      if (!r.ok && r.code === "version_conflict") {
        r = await tryCreate(r.currentVersion)
      }
      if (r.ok) {
        toast({
          title: "تم إنشاء المقطع",
          description: "افتح تبويب المقاطع لتعديل الخطّاف والنشر.",
          variant: "success",
          duration: 1800,
        })
        return
      }
      toast({
        title: "تعذّر إنشاء المقطع",
        description: "message" in r ? r.message : "حدث خطأ غير متوقع",
        variant: "error",
      })
    },
    [eirId],
  )

  // ── UX-8 Phase C: ?seg=<id> deep-link scroll on mount ───────────
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const segParam = params.get("seg")
    if (!segParam) return
    const exists = state.doc.segments.some((s) => s.id === segParam)
    if (!exists) return
    setFocusedSegId(segParam)
    // Defer scroll so the row is in the windowed slice (focus-aware
    // mount in UX-7.5 ensures it stays mounted).
    const t = window.setTimeout(() => {
      const el = document.getElementById(rowDomId(segParam))
      el?.scrollIntoView({ block: "center", behavior: "smooth" })
    }, 80)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Virtualized row windowing ───────────────────────────────────
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(640)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    const onResize = () => setViewportH(el.clientHeight)
    el.addEventListener("scroll", onScroll, { passive: true })
    onResize()
    const ro = new ResizeObserver(onResize)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", onScroll)
      ro.disconnect()
    }
  }, [])

  const total = state.doc.segments.length
  let startIdx = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT_ESTIMATE) - OVERSCAN,
  )
  let endIdx = Math.min(
    total,
    Math.ceil((scrollTop + viewportH) / ROW_HEIGHT_ESTIMATE) + OVERSCAN,
  )
  // UX-7.5 Phase D — guarantee the focused row stays mounted so the
  // textarea doesn't unmount mid-edit (which would lose focus + the
  // current selection / IME composition state). The cost is one
  // extra row in the slice — well worth the stability win.
  if (focusedSegId !== null) {
    const focusIdx = state.doc.segments.findIndex((s) => s.id === focusedSegId)
    if (focusIdx >= 0) {
      startIdx = Math.min(startIdx, Math.max(0, focusIdx - 1))
      endIdx = Math.max(endIdx, Math.min(total, focusIdx + 2))
    }
  }
  const padTop = startIdx * ROW_HEIGHT_ESTIMATE
  const padBottom = Math.max(0, (total - endIdx) * ROW_HEIGHT_ESTIMATE)

  // ── Render ──────────────────────────────────────────────────────
  const counts = useMemo(() => recomputeCounts(state.doc), [state.doc])

  return (
    <div className="space-y-2">
      {/* Conflict banner */}
      {conflictDoc && (
        <ConflictBanner
          onReload={adoptServerDoc}
          onOverwrite={overwriteServer}
          theirVersion={conflictDoc.version}
        />
      )}

      {/* Toolbar */}
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
            id: "add-row",
            label: "إضافة مقطع",
            icon: <ListPlus className="h-3.5 w-3.5" />,
            onClick: addSegmentAtEnd,
          },
        ]}
        trailing={
          <>
            <span
              className="rounded-full border border-border/40 bg-background/40 px-2 py-0.5 text-[10.5px] text-muted-foreground"
              title="عدد الكلمات / الأحرف"
              dir="ltr"
            >
              {counts.word_count} كلمة · {counts.char_count} حرف
            </span>
            {dirtyVsOriginal && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-700">
                مختلف عن الأصلي
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

      {/* Search bar */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-border/40 bg-card/30 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث في النصّ…"
          className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
          dir="auto"
        />
        {search.trim() && (
          <>
            <span className="text-[10.5px] text-muted-foreground" dir="ltr">
              {matches.length === 0
                ? "0 / 0"
                : `${clampedMatch + 1} / ${matches.length}`}
            </span>
            <button
              type="button"
              onClick={() => jumpMatch(-1)}
              disabled={matches.length === 0}
              className="rounded-md p-1 hover:bg-background/40 disabled:opacity-40"
              title="السابق"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => jumpMatch(1)}
              disabled={matches.length === 0}
              className="rounded-md p-1 hover:bg-background/40 disabled:opacity-40"
              title="التالي"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setSearch("")}
              className="rounded-md p-1 hover:bg-background/40"
              title="مسح"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* Empty state */}
      {state.doc.segments.length === 0 && (
        <EmptyState
          sourceLabel={sourceLabel}
          status={recordStatus}
          onAddSegment={addSegmentAtEnd}
        />
      )}

      {/* Virtualized scroller */}
      {state.doc.segments.length > 0 && (
        <div
          ref={scrollerRef}
          className="relative max-h-[70vh] min-h-[420px] overflow-y-auto rounded-2xl border border-border/40 bg-card/20"
          dir="rtl"
          // Containment hint for the browser — limits paint scope.
          style={{ contain: "layout paint style" }}
        >
          <div style={{ height: padTop }} aria-hidden />
          {state.doc.segments.slice(startIdx, endIdx).map((seg, i) => {
            const segIdx = startIdx + i
            const isActiveMatch =
              matches.length > 0 && matches[clampedMatch]?.segId === seg.id
            return (
              <SegmentRow
                key={seg.id}
                seg={seg}
                segIdx={segIdx}
                searchQuery={search.trim().toLowerCase()}
                isActiveMatch={isActiveMatch}
                isFocused={focusedSegId === seg.id}
                onFocus={() => setFocusedSegId(seg.id)}
                onBlur={() => {}}
                onChangeText={(text) => updateSegment(seg.id, { text })}
                onChangeSpeaker={(speaker) =>
                  updateSegment(seg.id, { speaker: speaker || null })
                }
                onSplit={(idx) => splitSegment(seg.id, idx)}
                onMergeUp={() => mergeWithPrevious(seg.id)}
                onMark={(m) => setMark(seg.id, seg.mark === m ? null : m)}
                onCreateChapter={() => void createChapterAt(seg.id)}
                onCreateClip={() => void createClipAt(seg.id)}
              />
            )
          })}
          <div style={{ height: padBottom }} aria-hidden />
        </div>
      )}

      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        المصدر: <span>{translateSourceLabel(sourceLabel)}</span> · عدد المقاطع: {total} ·
        النسخة: {state.version}
      </p>
    </div>
  )
}

// ─── Components ──────────────────────────────────────────────────────

function rowDomId(segId: string): string {
  return `transcript-row-${segId}`
}

interface SegmentRowProps {
  seg: TranscriptSegment
  segIdx: number
  searchQuery: string
  isActiveMatch: boolean
  isFocused: boolean
  onFocus: () => void
  onBlur: () => void
  onChangeText: (next: string) => void
  onChangeSpeaker: (next: string) => void
  onSplit: (caret: number) => void
  onMergeUp: () => void
  onMark: (mark: TranscriptMark) => void
  onCreateChapter: () => void
  onCreateClip: () => void
}

function SegmentRow({
  seg,
  segIdx,
  searchQuery,
  isActiveMatch,
  isFocused,
  onFocus,
  onBlur,
  onChangeText,
  onChangeSpeaker,
  onSplit,
  onMergeUp,
  onMark,
  onCreateChapter,
  onCreateClip,
}: SegmentRowProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  // Auto-grow textarea on focus.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = el.scrollHeight + "px"
  }, [seg.text, isFocused])

  const markCls = (() => {
    switch (seg.mark) {
      case "highlight":
        return "border-amber-500/30 bg-amber-500/5"
      case "quote":
        return "border-violet-500/30 bg-violet-500/5"
      case "cut":
        return "border-rose-500/25 bg-rose-500/5 opacity-70"
      case "redo":
        return "border-blue-500/30 bg-blue-500/5"
      case "chapter_start":
        return "border-emerald-500/40 bg-emerald-500/5"
      default:
        return "border-border/30 bg-background/40"
    }
  })()

  return (
    <div
      id={rowDomId(seg.id)}
      className={
        "group/row mx-2 my-1 rounded-xl border px-2.5 py-2 transition-shadow " +
        markCls +
        (isActiveMatch ? " ring-2 ring-violet-400/50" : "") +
        (isFocused ? " shadow-md" : "")
      }
    >
      {/* Header: index + speaker pill + timestamps + mark menu */}
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <span className="rounded-full bg-background/50 px-1.5 py-0.5 tabular-nums" dir="ltr">
          #{segIdx + 1}
        </span>
        <input
          type="text"
          value={seg.speaker ?? ""}
          onChange={(e) => onChangeSpeaker(e.target.value)}
          placeholder="المتحدّث"
          className="rounded-full border border-border/30 bg-background/40 px-2 py-0.5 text-[10.5px] outline-none focus:border-violet-500/40"
          dir="auto"
          aria-label={`متحدّث المقطع ${segIdx + 1}`}
        />
        {(seg.start_seconds !== null || seg.end_seconds !== null) && (
          <span className="font-mono text-[10px] text-muted-foreground" dir="ltr">
            {fmtTime(seg.start_seconds)} – {fmtTime(seg.end_seconds)}
          </span>
        )}
        <div className="ms-auto inline-flex items-center gap-0.5">
          <MarkBtn icon={<Highlighter className="h-3 w-3" />} active={seg.mark === "highlight"} onClick={() => onMark("highlight")} title="تمييز" />
          <MarkBtn icon={<QuoteIcon className="h-3 w-3" />} active={seg.mark === "quote"} onClick={() => onMark("quote")} title="اقتباس" />
          <MarkBtn icon={<Scissors className="h-3 w-3" />} active={seg.mark === "cut"} onClick={() => onMark("cut")} title="حذف" />
          <MarkBtn icon={<CornerDownLeft className="h-3 w-3" />} active={seg.mark === "chapter_start"} onClick={() => onMark("chapter_start")} title="بداية فصل" />
          <button
            type="button"
            onClick={onCreateChapter}
            title="إنشاء فصل من هذا المقطع"
            className="rounded p-0.5 text-muted-foreground hover:bg-violet-500/10 hover:text-violet-700"
            aria-label="إنشاء فصل من هذا المقطع"
          >
            <BookmarkPlus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onCreateClip}
            title="إنشاء مقطع من هنا"
            className="rounded p-0.5 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-700"
            aria-label="إنشاء مقطع من هنا"
          >
            <FilmIcon className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              const caret = taRef.current?.selectionStart ?? seg.text.length
              onSplit(caret)
            }}
            title="تقسيم عند المؤشّر"
            className="rounded p-0.5 text-muted-foreground hover:bg-background/40 hover:text-foreground"
          >
            <Split className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Body: text */}
      <textarea
        ref={taRef}
        value={seg.text}
        onChange={(e) => onChangeText(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && seg.text.length === 0) {
            e.preventDefault()
            onMergeUp()
          }
        }}
        rows={Math.max(2, Math.min(8, Math.ceil(seg.text.length / 90)))}
        className="block w-full resize-none rounded-md bg-transparent px-1 py-1 text-[12.5px] leading-relaxed text-foreground/90 outline-none placeholder:text-muted-foreground focus:bg-background/30"
        dir="auto"
        placeholder="نصّ المقطع…"
        spellCheck={false}
      />

      {/* Search match highlight (visual only — we keep textarea for editing) */}
      {searchQuery && seg.text.toLowerCase().includes(searchQuery) && (
        <div className="mt-1 text-[10.5px] text-violet-700/70" dir="auto">
          مطابقة في هذا المقطع
        </div>
      )}
    </div>
  )
}

function MarkBtn({
  icon,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        "rounded p-0.5 transition-colors " +
        (active
          ? "bg-violet-500/20 text-violet-700"
          : "text-muted-foreground hover:bg-background/40 hover:text-foreground")
      }
      aria-pressed={active}
    >
      {icon}
    </button>
  )
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
            قام محرّر آخر بتعديل النصّ في الخادم (نسخة {theirVersion}). اختر:
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
            تجاوز وحفظ تعديلاتي
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({
  sourceLabel,
  status,
  onAddSegment,
}: {
  sourceLabel: string
  status: StudioAnalysisStatus | "missing"
  onAddSegment: () => void
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/20 p-6 text-center">
      <Mic className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="mt-2 text-[13px] font-semibold">لا يوجد نصّ بعد</h3>
      <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">
        {status === "missing"
          ? "لم يتم رفع/توليد نصّ للحلقة. يمكنك إضافة مقاطع يدوياً، أو فتح الاستوديو القديم لرفع تسجيل صوتي."
          : `حالة السجلّ: ${status}. مصدر القراءة: ${translateSourceLabel(sourceLabel)}.`}
      </p>
      <button
        type="button"
        onClick={onAddSegment}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-700 hover:bg-violet-500/20"
      >
        <ListPlus className="h-3.5 w-3.5" />
        إضافة مقطع جديد
      </button>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function isDocChanged(a: TranscriptDocument, b: TranscriptDocument): boolean {
  if (a.segments.length !== b.segments.length) return true
  for (let i = 0; i < a.segments.length; i++) {
    const x = a.segments[i]
    const y = b.segments[i]
    if (x.id !== y.id) return true
    if (x.text !== y.text) return true
    if (x.speaker !== y.speaker) return true
    if (x.mark !== y.mark) return true
  }
  return false
}

function fmtTime(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return "—"
  const total = Math.max(0, Math.floor(s))
  const m = Math.floor(total / 60)
  const sec = total % 60
  const h = Math.floor(m / 60)
  const mm = (m % 60).toString().padStart(2, "0")
  const ss = sec.toString().padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

