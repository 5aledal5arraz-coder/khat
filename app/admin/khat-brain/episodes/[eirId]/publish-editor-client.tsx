"use client"

/**
 * UX-10 — Publishing / Website-Package editor (client component).
 *
 * "A premium editorial newsroom + documentary publishing suite."
 *
 * Composition (top → bottom):
 *   • Conflict banner
 *   • Toolbar           — save, undo/redo, AI suggest, seed-from-context, status, visibility
 *   • Readiness Dashboard — composite score + per-section ring +
 *                            blocker/warning summary + recommendation
 *   • Validation summary
 *   • AI Suggestions    — Apply / Dismiss per card
 *   • Narrative section — final_title, subtitle, slug, descriptions,
 *                          takeaways, quotes, keywords
 *   • SEO section
 *   • Multi-platform sections (YouTube / Newsletter / Social) —
 *     collapsible
 *   • Sponsor + Release strategy + Analytics expectation
 *   • Website preview
 *
 * Reuses UX-7.5 / UX-8 / UX-9 primitives unchanged.
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
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Globe,
  Info,
  Mail,
  Megaphone,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  XCircle,
  Youtube,
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
  savePublishPackageAction,
  seedPublishPackageFromContextAction,
  suggestPublishImprovementsAction,
  type PublishAiSuggestion,
  type SavePublishPackageResult,
} from "./publish-actions"
import {
  FEATURED_PRIORITY,
  PRIMARY_PLATFORMS,
  PUBLISH_STATUSES,
  PUBLISH_VISIBILITY,
  RELEASE_PRIORITIES,
  SEARCH_INTENTS,
  publishReducer,
  slugifyTitle,
  type FeaturedPriority,
  type PrimaryPlatform,
  type PublishStatus,
  type PublishVisibility,
  type ReleasePriority,
  type SearchIntent,
  type WebsitePackageDocument,
} from "@/lib/editorial/publish-types"
import {
  DEFAULT_PUBLISH_LIMITS,
  issuesForField,
  validateWebsitePackageDocument,
  type ValidationIssue,
} from "@/lib/editorial/publish-validation"

interface EditorState {
  doc: WebsitePackageDocument
  version: number
}

export interface PublishEditorProps {
  eirId: string
  initialDoc: WebsitePackageDocument
  siblingSlugs: string[]
  /** Counts only, for the readiness dashboard cross-context status. */
  context: {
    transcript: boolean
    transcriptVersion: number | null
    chapters: number
    clips: number
  }
}

export function PublishPackageEditor({
  eirId,
  initialDoc,
  siblingSlugs,
  context,
}: PublishEditorProps) {
  const initial: EditorState = useMemo(
    () => ({ doc: initialDoc, version: initialDoc.version }),
    [initialDoc],
  )
  const [state, setState] = useState<EditorState>(initial)
  const [conflictDoc, setConflictDoc] = useState<WebsitePackageDocument | null>(
    null,
  )
  const [suggestions, setSuggestions] = useState<PublishAiSuggestion[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [seedBusy, setSeedBusy] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    narrative: true,
    seo: true,
    youtube: false,
    newsletter: false,
    social: false,
    sponsor: false,
    release: false,
    preview: false,
  })
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
    surfaceId: `publish:${eirId}`,
    saver: async (payload, ctx) => {
      const result: SavePublishPackageResult = await savePublishPackageAction({
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
        "message" in result ? result.message : "فشل حفظ الحزمة",
      )
    },
    debounceMs: 1500,
  })

  // ── Mutation helpers ─────────────────────────────────────────────
  const commit = useCallback(
    (next: WebsitePackageDocument, fieldId: string) => {
      undoHistory.push(stateRef.current)
      setState({ ...stateRef.current, doc: next })
      dirty.markDirty(fieldId)
      autosave.request({ ...stateRef.current, doc: next })
    },
    [autosave, dirty, undoHistory],
  )

  const patchWebsite = useCallback(
    (patch: Partial<WebsitePackageDocument["website_package"]>) => {
      commit(
        publishReducer(stateRef.current.doc, {
          type: "patch_website",
          patch,
        }),
        "website",
      )
    },
    [commit],
  )
  const patchYoutube = useCallback(
    (patch: Partial<WebsitePackageDocument["youtube_package"]>) => {
      commit(
        publishReducer(stateRef.current.doc, {
          type: "patch_youtube",
          patch,
        }),
        "youtube",
      )
    },
    [commit],
  )
  const patchSocial = useCallback(
    (patch: Partial<WebsitePackageDocument["social_package"]>) => {
      commit(
        publishReducer(stateRef.current.doc, {
          type: "patch_social",
          patch,
        }),
        "social",
      )
    },
    [commit],
  )
  const patchNewsletter = useCallback(
    (patch: Partial<WebsitePackageDocument["newsletter_package"]>) => {
      commit(
        publishReducer(stateRef.current.doc, {
          type: "patch_newsletter",
          patch,
        }),
        "newsletter",
      )
    },
    [commit],
  )
  const patchSeo = useCallback(
    (patch: Partial<WebsitePackageDocument["seo_package"]>) => {
      commit(
        publishReducer(stateRef.current.doc, { type: "patch_seo", patch }),
        "seo",
      )
    },
    [commit],
  )
  const patchSponsor = useCallback(
    (patch: Partial<WebsitePackageDocument["sponsor_package"]>) => {
      commit(
        publishReducer(stateRef.current.doc, {
          type: "patch_sponsor",
          patch,
        }),
        "sponsor",
      )
    },
    [commit],
  )
  const patchAnalytics = useCallback(
    (patch: Partial<WebsitePackageDocument["analytics_expectation"]>) => {
      commit(
        publishReducer(stateRef.current.doc, {
          type: "patch_analytics",
          patch,
        }),
        "analytics",
      )
    },
    [commit],
  )
  const patchRelease = useCallback(
    (patch: Partial<WebsitePackageDocument["release_strategy"]>) => {
      commit(
        publishReducer(stateRef.current.doc, {
          type: "patch_release",
          patch,
        }),
        "release",
      )
    },
    [commit],
  )
  const setStatus = useCallback(
    (status: PublishStatus) => {
      commit(
        publishReducer(stateRef.current.doc, { type: "set_status", status }),
        "status",
      )
    },
    [commit],
  )
  const setVisibility = useCallback(
    (visibility: PublishVisibility) => {
      commit(
        publishReducer(stateRef.current.doc, {
          type: "set_visibility",
          visibility,
        }),
        "visibility",
      )
    },
    [commit],
  )
  const setFeatured = useCallback(
    (priority: FeaturedPriority) => {
      commit(
        publishReducer(stateRef.current.doc, {
          type: "set_featured",
          priority,
        }),
        "featured",
      )
    },
    [commit],
  )

  // ── Undo / Redo ──────────────────────────────────────────────────
  const undo = useCallback(() => {
    const prev = undoHistory.undo(stateRef.current)
    if (!prev) return
    setState(prev)
    dirty.markDirty("publish-undo")
    autosave.request(prev)
  }, [autosave, dirty, undoHistory])

  const redo = useCallback(() => {
    const next = undoHistory.redo(stateRef.current)
    if (!next) return
    setState(next)
    dirty.markDirty("publish-redo")
    autosave.request(next)
  }, [autosave, dirty, undoHistory])

  // ── Conflict resolution ─────────────────────────────────────────
  const adoptServer = useCallback(() => {
    if (!conflictDoc) return
    setState({ doc: conflictDoc, version: conflictDoc.version })
    setConflictDoc(null)
    dirty.markClean()
    undoHistory.clear()
    toast({
      title: "تم استرجاع نسخة الخادم",
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

  // ── Seed-from-context + AI suggest ──────────────────────────────
  const seedFromContext = useCallback(async () => {
    setSeedBusy(true)
    try {
      const tryOnce = async (v: number) =>
        seedPublishPackageFromContextAction({
          eirId,
          expectedVersion: v,
          editorSessionId: editorSessionIdRef.current,
        })
      let r = await tryOnce(state.version)
      if (!r.ok && r.code === "version_conflict") {
        r = await tryOnce(r.currentVersion)
      }
      if (r.ok) {
        if (r.seededFields.length === 0) {
          toast({
            title: "لا توجد حقول فارغة لملئها",
            variant: "default",
            duration: 1800,
          })
        } else {
          toast({
            title: `تمت تعبئة ${r.seededFields.length} حقل`,
            description: r.seededFields.slice(0, 4).join("، "),
            variant: "success",
            duration: 2400,
          })
        }
        // Force a refetch by reloading the page state from server —
        // the simplest path is to let revalidatePath trigger a soft
        // refresh; we update local version optimistically.
        if (r.newVersion !== state.version) {
          setState((s) => ({
            ...s,
            version: r.newVersion,
            doc: { ...s.doc, version: r.newVersion },
          }))
          // Encourage the server-rendered tab to refetch on next nav.
          if (typeof window !== "undefined") {
            window.location.reload()
          }
        }
      } else {
        toast({
          title: "تعذّر التعبئة من السياق",
          description: "message" in r ? r.message : "خطأ غير متوقع",
          variant: "error",
        })
      }
    } finally {
      setSeedBusy(false)
    }
  }, [eirId, state.version])

  const requestSuggestions = useCallback(async () => {
    setAiBusy(true)
    try {
      const r = await suggestPublishImprovementsAction(eirId)
      if (r.ok) {
        setSuggestions((prev) => {
          const seen = new Set(
            prev.map(
              (p) =>
                `${p.kind}|${p.field}|${JSON.stringify(p.patch)}`,
            ),
          )
          const merged = [...prev]
          for (const s of r.suggestions) {
            const fp = `${s.kind}|${s.field}|${JSON.stringify(s.patch)}`
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
          description: "message" in r ? r.message : "خطأ غير متوقع",
          variant: "error",
        })
      }
    } finally {
      setAiBusy(false)
    }
  }, [eirId])

  const applySuggestion = useCallback(
    (s: PublishAiSuggestion) => {
      const value = "value" in s.patch ? s.patch.value : null
      const values = "values" in s.patch ? s.patch.values : null
      switch (s.field) {
        case "website.final_title":
          if (value !== null) patchWebsite({ final_title: value })
          break
        case "website.canonical_description":
          if (value !== null) patchWebsite({ canonical_description: value })
          break
        case "website.episode_summary":
          if (value !== null) patchWebsite({ episode_summary: value })
          break
        case "website.subtitle":
          if (value !== null) patchWebsite({ subtitle: value })
          break
        case "website.key_takeaways":
          if (values) patchWebsite({ key_takeaways: values })
          break
        case "website.quote_highlights":
          if (values) patchWebsite({ quote_highlights: values })
          break
        case "youtube.youtube_title":
          if (value !== null) patchYoutube({ youtube_title: value })
          break
        case "youtube.thumbnail_direction":
          if (value !== null) patchYoutube({ thumbnail_direction: value })
          break
        case "youtube.hook_opening_line":
          if (value !== null) patchYoutube({ hook_opening_line: value })
          break
        case "newsletter.newsletter_subject":
          if (value !== null) patchNewsletter({ newsletter_subject: value })
          break
        case "newsletter.featured_quote":
          if (value !== null) patchNewsletter({ featured_quote: value })
          break
        case "seo.ranking_angle":
          if (value !== null) patchSeo({ ranking_angle: value })
          break
      }
      setSuggestions((prev) => prev.filter((p) => p.id !== s.id))
    },
    [patchWebsite, patchYoutube, patchNewsletter, patchSeo],
  )

  const dismissSuggestion = useCallback(
    (id: string) => setSuggestions((prev) => prev.filter((p) => p.id !== id)),
    [],
  )

  // ── Validation + readiness ──────────────────────────────────────
  const validation = useMemo(
    () =>
      validateWebsitePackageDocument(
        state.doc,
        siblingSlugs,
        DEFAULT_PUBLISH_LIMITS,
      ),
    [state.doc, siblingSlugs],
  )

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

  const toggle = (k: string) =>
    setOpenSections((p) => ({ ...p, [k]: !p[k] }))

  const w = state.doc.website_package
  const y = state.doc.youtube_package
  const seo = state.doc.seo_package
  const nl = state.doc.newsletter_package
  const so = state.doc.social_package
  const sp = state.doc.sponsor_package
  const ax = state.doc.analytics_expectation
  const rs = state.doc.release_strategy

  return (
    <div className="space-y-3">
      {conflictDoc && (
        <ConflictBanner
          theirVersion={conflictDoc.version}
          onReload={adoptServer}
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
            id: "seed",
            label: seedBusy ? "جارٍ التعبئة…" : "تعبئة من السياق",
            icon: <RefreshCw className="h-3.5 w-3.5" />,
            onClick: () => void seedFromContext(),
            disabled: seedBusy,
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
              v{state.version}
            </span>
            <select
              value={state.doc.publish_status}
              onChange={(e) => setStatus(e.target.value as PublishStatus)}
              className="rounded-full border border-border/40 bg-background/40 px-2 py-0.5 text-[10.5px] outline-none"
              aria-label="حالة النشر"
              data-publish-status
            >
              {PUBLISH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              value={state.doc.visibility}
              onChange={(e) => setVisibility(e.target.value as PublishVisibility)}
              className="rounded-full border border-border/40 bg-background/40 px-2 py-0.5 text-[10.5px] outline-none"
              aria-label="الظهور"
            >
              {PUBLISH_VISIBILITY.map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_LABEL[v]}
                </option>
              ))}
            </select>
            <select
              value={state.doc.featured_priority}
              onChange={(e) => setFeatured(e.target.value as FeaturedPriority)}
              className="rounded-full border border-border/40 bg-background/40 px-2 py-0.5 text-[10.5px] outline-none"
              aria-label="الأولوية"
            >
              {FEATURED_PRIORITY.map((p) => (
                <option key={p} value={p}>
                  {FEATURED_LABEL[p]}
                </option>
              ))}
            </select>
            <EditorStatusBadge
              status={autosave.status}
              savedAt={autosave.savedAt}
              error={autosave.error}
              pendingChanges={autosave.pendingChanges}
            />
          </>
        }
      />

      {/* Readiness Dashboard */}
      <ReadinessDashboard
        validation={validation}
        context={context}
        publishStatus={state.doc.publish_status}
      />

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <SuggestionsPanel
          suggestions={suggestions}
          onApply={applySuggestion}
          onDismiss={dismissSuggestion}
          onClear={() => setSuggestions([])}
        />
      )}

      {/* Narrative section */}
      <Section
        id="narrative"
        title="القصّ التحريري"
        icon={<Compass className="h-3.5 w-3.5 text-violet-700" />}
        open={openSections.narrative}
        onToggle={() => toggle("narrative")}
      >
        <Field
          label="العنوان النهائي"
          required
          dirty={dirty.isFieldDirty("website")}
          issues={issuesForField(validation, "website_package.final_title")}
        >
          <input
            type="text"
            value={w.final_title}
            onChange={(e) => patchWebsite({ final_title: e.target.value })}
            placeholder="عنوان تحريري ـ ٥ إلى ١٢ كلمة"
            className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[13.5px] font-medium outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <Field
          label="العنوان الفرعي"
          issues={issuesForField(validation, "website_package.subtitle")}
        >
          <input
            type="text"
            value={w.subtitle}
            onChange={(e) => patchWebsite({ subtitle: e.target.value })}
            placeholder="جملة تكمّل الصورة"
            className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <Field
          label="Slug"
          required
          issues={issuesForField(validation, "website_package.slug")}
        >
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={w.slug}
              onChange={(e) => patchWebsite({ slug: e.target.value.trim() })}
              placeholder="kuwait-podcast-episode-title"
              className="flex-1 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() =>
                patchWebsite({ slug: slugifyTitle(w.final_title || w.subtitle) })
              }
              disabled={!w.final_title.trim() && !w.subtitle.trim()}
              title="إعادة توليد من العنوان"
              className="rounded-xl border border-border/40 bg-background/40 px-2 py-1.5 text-[10.5px] text-muted-foreground hover:bg-background/60 disabled:opacity-40"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        </Field>
        <Field
          label="الوصف الأساسي"
          required
          issues={issuesForField(
            validation,
            "website_package.canonical_description",
          )}
        >
          <textarea
            value={w.canonical_description}
            onChange={(e) =>
              patchWebsite({ canonical_description: e.target.value })
            }
            rows={3}
            placeholder="فقرة تشرح ما تطرحه هذه الحلقة على القارئ"
            className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <Field label="ملخّص الحلقة">
          <textarea
            value={w.episode_summary}
            onChange={(e) => patchWebsite({ episode_summary: e.target.value })}
            rows={3}
            placeholder="ملخّص أطول للقراء الذين يفتحون الصفحة"
            className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <ListField
          label="الخلاصات (Takeaways)"
          values={w.key_takeaways}
          onChange={(next) => patchWebsite({ key_takeaways: next })}
          placeholder="خلاصة + Enter"
          issues={issuesForField(validation, "website_package.key_takeaways")}
        />
        <ListField
          label="الاقتباسات البارزة"
          values={w.quote_highlights}
          onChange={(next) => patchWebsite({ quote_highlights: next })}
          placeholder="«اقتباس» + Enter"
          issues={issuesForField(validation, "website_package.quote_highlights")}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ListField
            label="كلمات عاطفية"
            values={w.emotional_keywords}
            onChange={(next) => patchWebsite({ emotional_keywords: next })}
            placeholder="حنين + Enter"
            issues={issuesForField(
              validation,
              "website_package.emotional_keywords",
            )}
          />
          <ListField
            label="كلمات موضوعية"
            values={w.topic_keywords}
            onChange={(next) => patchWebsite({ topic_keywords: next })}
            placeholder="هوية + Enter"
            issues={issuesForField(
              validation,
              "website_package.topic_keywords",
            )}
          />
        </div>
      </Section>

      {/* SEO section */}
      <Section
        id="seo"
        title="الاكتشاف الذكي (SEO)"
        icon={<Network className="h-3.5 w-3.5 text-emerald-700" />}
        open={openSections.seo}
        onToggle={() => toggle("seo")}
      >
        <Field
          label="meta_title"
          issues={issuesForField(validation, "seo_package.meta_title")}
        >
          <input
            type="text"
            value={seo.meta_title}
            onChange={(e) => patchSeo({ meta_title: e.target.value })}
            className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <Field
          label="meta_description"
          issues={issuesForField(validation, "seo_package.meta_description")}
        >
          <textarea
            value={seo.meta_description}
            onChange={(e) => patchSeo({ meta_description: e.target.value })}
            rows={2}
            className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="og_title">
            <input
              type="text"
              value={seo.og_title}
              onChange={(e) => patchSeo({ og_title: e.target.value })}
              className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="auto"
            />
          </Field>
          <Field label="og_description">
            <input
              type="text"
              value={seo.og_description}
              onChange={(e) => patchSeo({ og_description: e.target.value })}
              className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="auto"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="search_intent">
            <select
              value={seo.search_intent}
              onChange={(e) =>
                patchSeo({ search_intent: e.target.value as SearchIntent })
              }
              className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none"
            >
              {SEARCH_INTENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ranking_angle">
            <input
              type="text"
              value={seo.ranking_angle}
              onChange={(e) => patchSeo({ ranking_angle: e.target.value })}
              placeholder="الزاوية التي تتفوّق فيها على البقية"
              className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="auto"
            />
          </Field>
        </div>
      </Section>

      {/* YouTube section */}
      <Section
        id="youtube"
        title="حزمة YouTube"
        icon={<Youtube className="h-3.5 w-3.5 text-rose-700" />}
        open={openSections.youtube}
        onToggle={() => toggle("youtube")}
      >
        <Field
          label="عنوان YouTube"
          issues={issuesForField(validation, "youtube_package.youtube_title")}
        >
          <input
            type="text"
            value={y.youtube_title}
            onChange={(e) => patchYoutube({ youtube_title: e.target.value })}
            className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12.5px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <Field label="وصف YouTube">
          <textarea
            value={y.youtube_description}
            onChange={(e) =>
              patchYoutube({ youtube_description: e.target.value })
            }
            rows={3}
            className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="جملة الافتتاح (Hook)">
            <input
              type="text"
              value={y.hook_opening_line}
              onChange={(e) => patchYoutube({ hook_opening_line: e.target.value })}
              className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="auto"
            />
          </Field>
          <Field label="اتجاه المصغّرة">
            <input
              type="text"
              value={y.thumbnail_direction}
              onChange={(e) => patchYoutube({ thumbnail_direction: e.target.value })}
              placeholder="وصف بصري للمصمّم"
              className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="auto"
            />
          </Field>
        </div>
        <ListField
          label="نصوص المصغّرة (خيارات)"
          values={y.thumbnail_text_options}
          onChange={(next) => patchYoutube({ thumbnail_text_options: next })}
          placeholder="نصّ مصغّرة + Enter"
        />
        <ListField
          label="وسوم YouTube"
          values={y.tags}
          onChange={(next) => patchYoutube({ tags: next })}
          placeholder="وسم + Enter"
        />
        <Field label="تعليق مثبّت">
          <textarea
            value={y.pinned_comment}
            onChange={(e) => patchYoutube({ pinned_comment: e.target.value })}
            rows={2}
            className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
      </Section>

      {/* Newsletter section */}
      <Section
        id="newsletter"
        title="حزمة النشرة"
        icon={<Mail className="h-3.5 w-3.5 text-amber-700" />}
        open={openSections.newsletter}
        onToggle={() => toggle("newsletter")}
      >
        <Field
          label="عنوان الرسالة"
          issues={issuesForField(
            validation,
            "newsletter_package.newsletter_subject",
          )}
        >
          <input
            type="text"
            value={nl.newsletter_subject}
            onChange={(e) =>
              patchNewsletter({ newsletter_subject: e.target.value })
            }
            className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12.5px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <Field label="معاينة (preview)">
          <input
            type="text"
            value={nl.newsletter_preview}
            onChange={(e) =>
              patchNewsletter({ newsletter_preview: e.target.value })
            }
            className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <Field label="نصّ الرسالة">
          <textarea
            value={nl.newsletter_body}
            onChange={(e) =>
              patchNewsletter({ newsletter_body: e.target.value })
            }
            rows={6}
            className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="اقتباس مميّز">
            <input
              type="text"
              value={nl.featured_quote}
              onChange={(e) =>
                patchNewsletter({ featured_quote: e.target.value })
              }
              className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="auto"
            />
          </Field>
          <Field label="الزاوية العاطفية">
            <input
              type="text"
              value={nl.emotional_angle}
              onChange={(e) =>
                patchNewsletter({ emotional_angle: e.target.value })
              }
              className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="auto"
            />
          </Field>
        </div>
      </Section>

      {/* Social section */}
      <Section
        id="social"
        title="حزم التواصل الاجتماعي"
        icon={<Megaphone className="h-3.5 w-3.5 text-violet-700" />}
        open={openSections.social}
        onToggle={() => toggle("social")}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Instagram caption">
            <textarea
              value={so.instagram_caption}
              onChange={(e) =>
                patchSocial({ instagram_caption: e.target.value })
              }
              rows={3}
              className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="auto"
            />
          </Field>
          <Field label="LinkedIn post">
            <textarea
              value={so.linkedin_post}
              onChange={(e) => patchSocial({ linkedin_post: e.target.value })}
              rows={3}
              className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="auto"
            />
          </Field>
          <Field label="TikTok caption">
            <textarea
              value={so.tiktok_caption}
              onChange={(e) => patchSocial({ tiktok_caption: e.target.value })}
              rows={2}
              className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="auto"
            />
          </Field>
          <ListField
            label="X / Twitter thread"
            values={so.x_thread}
            onChange={(next) => patchSocial({ x_thread: next })}
            placeholder="تغريدة + Enter"
          />
          <ListField
            label="جمل افتتاح Reels"
            values={so.reel_hook_lines}
            onChange={(next) => patchSocial({ reel_hook_lines: next })}
            placeholder="جملة + Enter"
          />
          <ListField
            label="نصوص Carousel"
            values={so.carousel_slide_copy}
            onChange={(next) => patchSocial({ carousel_slide_copy: next })}
            placeholder="نصّ شريحة + Enter"
          />
          <ListField
            label="CTAs اجتماعية"
            values={so.social_ctas}
            onChange={(next) => patchSocial({ social_ctas: next })}
            placeholder="CTA + Enter"
          />
        </div>
      </Section>

      {/* Sponsor section */}
      <Section
        id="sponsor"
        title="حزمة الرعاة"
        icon={<Megaphone className="h-3.5 w-3.5 text-rose-700" />}
        open={openSections.sponsor}
        onToggle={() => toggle("sponsor")}
      >
        <ListField
          label="ذكر الرعاة"
          values={sp.sponsor_mentions}
          onChange={(next) => patchSponsor({ sponsor_mentions: next })}
          placeholder="اسم الراعي + Enter"
        />
        <ListField
          label="CTAs الرعاة"
          values={sp.sponsor_cta_copy}
          onChange={(next) => patchSponsor({ sponsor_cta_copy: next })}
          placeholder="CTA الراعي + Enter"
          issues={issuesForField(validation, "sponsor_package.sponsor_cta_copy")}
        />
        <Field label="ملاحظات امتثال">
          <textarea
            value={sp.compliance_notes}
            onChange={(e) => patchSponsor({ compliance_notes: e.target.value })}
            rows={2}
            className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
      </Section>

      {/* Release strategy section */}
      <Section
        id="release"
        title="استراتيجية الإطلاق"
        icon={<Send className="h-3.5 w-3.5 text-emerald-700" />}
        open={openSections.release}
        onToggle={() => toggle("release")}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="أولوية الإطلاق">
            <select
              value={rs.release_priority}
              onChange={(e) =>
                patchRelease({ release_priority: e.target.value as ReleasePriority })
              }
              className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none"
            >
              {RELEASE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="نافذة الإطلاق">
            <input
              type="text"
              value={rs.release_window ?? ""}
              onChange={(e) =>
                patchRelease({ release_window: e.target.value || null })
              }
              placeholder="2026-05-30"
              className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
              dir="ltr"
            />
          </Field>
          <Field label="المنصّة الرئيسية">
            <select
              value={rs.primary_platform}
              onChange={(e) =>
                patchRelease({ primary_platform: e.target.value as PrimaryPlatform })
              }
              className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none"
            >
              {PRIMARY_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="سبب الإطلاق">
          <textarea
            value={rs.release_reason}
            onChange={(e) => patchRelease({ release_reason: e.target.value })}
            rows={2}
            className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <Field label="الجمهور المستهدف">
          <input
            type="text"
            value={rs.audience_target}
            onChange={(e) => patchRelease({ audience_target: e.target.value })}
            className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>
        <Field label="ملاحظات استراتيجية">
          <textarea
            value={rs.strategic_notes}
            onChange={(e) => patchRelease({ strategic_notes: e.target.value })}
            rows={2}
            className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
        </Field>

        {/* Analytics expectation sliders */}
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <ScoreSlider
            label="احتفاظ"
            value={ax.expected_retention}
            onChange={(v) => patchAnalytics({ expected_retention: v })}
          />
          <ScoreSlider
            label="مقاطع"
            value={ax.expected_clip_strength}
            onChange={(v) => patchAnalytics({ expected_clip_strength: v })}
          />
          <ScoreSlider
            label="نقاش"
            value={ax.expected_discussion_level}
            onChange={(v) => patchAnalytics({ expected_discussion_level: v })}
          />
          <ScoreSlider
            label="مشاركة"
            value={ax.expected_shareability}
            onChange={(v) => patchAnalytics({ expected_shareability: v })}
          />
          <ScoreSlider
            label="جدل"
            value={ax.expected_controversy}
            onChange={(v) => patchAnalytics({ expected_controversy: v })}
          />
          <ScoreSlider
            label="ثقة"
            value={ax.confidence}
            onChange={(v) => patchAnalytics({ confidence: v })}
          />
        </div>
      </Section>

      {/* Preview */}
      <Section
        id="preview"
        title="معاينة الموقع + الـ SEO snippet"
        icon={<Globe className="h-3.5 w-3.5 text-violet-700" />}
        open={openSections.preview}
        onToggle={() => toggle("preview")}
      >
        <WebsitePreview doc={state.doc} />
      </Section>

      <p className="text-[10.5px] text-muted-foreground">
        v{state.version} · نصّ مرتبط: {context.transcript ? "نعم" : "لا"} ·
        فصول: {context.chapters} · مقاطع: {context.clips}
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
            عدّل محرّر آخر الحزمة في الخادم (نسخة {theirVersion}).
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

function ReadinessDashboard({
  validation,
  context,
  publishStatus,
}: {
  validation: ReturnType<typeof validateWebsitePackageDocument>
  context: PublishEditorProps["context"]
  publishStatus: PublishStatus
}) {
  const { readiness, blockerCount, warningCount, infoCount } = validation
  const ringColor =
    readiness.score >= 85
      ? "text-emerald-700"
      : readiness.score >= 65
        ? "text-violet-700"
        : readiness.score >= 40
          ? "text-amber-700"
          : "text-rose-700"
  return (
    <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/5 via-rose-500/5 to-transparent p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex shrink-0 flex-col items-center justify-center">
          <div
            className={
              "rounded-full border-4 px-5 py-3 text-center font-bold tabular-nums " +
              "border-violet-500/30 " +
              ringColor
            }
            dir="ltr"
            data-readiness-score
          >
            <div className="text-[28px] leading-none">{readiness.score}</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
              readiness
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/30 px-2 py-0.5 text-muted-foreground">
              <ArrowRight className="h-2.5 w-2.5" /> {STATUS_LABEL[publishStatus]}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 " +
                (context.transcript
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                  : "border border-rose-500/30 bg-rose-500/10 text-rose-700")
              }
            >
              نصّ {context.transcript ? "✓" : "✗"}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 " +
                (context.chapters > 0
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                  : "border border-rose-500/30 bg-rose-500/10 text-rose-700")
              }
            >
              فصول {context.chapters}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 " +
                (context.clips > 0
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                  : "border border-rose-500/30 bg-rose-500/10 text-rose-700")
              }
            >
              مقاطع {context.clips}
            </span>
            {blockerCount > 0 && (
              <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-700">
                {blockerCount} عائق
              </span>
            )}
            {warningCount > 0 && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700">
                {warningCount} تنبيه
              </span>
            )}
            {infoCount > 0 && (
              <span className="rounded-full border border-border/40 bg-background/30 px-2 py-0.5 text-muted-foreground">
                {infoCount} ملاحظة
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/90">
            {readiness.recommendation}
          </p>
          {/* Per-section bars */}
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4">
            {(
              [
                ["website", "الموقع"],
                ["identity", "الهوية"],
                ["seo", "SEO"],
                ["youtube", "YouTube"],
                ["newsletter", "النشرة"],
                ["social", "اجتماعي"],
                ["sponsor", "رعاة"],
                ["release", "إطلاق"],
              ] as const
            ).map(([k, label]) => {
              const v = readiness.breakdown[k]
              const cls =
                v >= 80
                  ? "bg-emerald-400"
                  : v >= 55
                    ? "bg-violet-400"
                    : v >= 30
                      ? "bg-amber-400"
                      : "bg-rose-400"
              return (
                <div key={k} className="text-[10.5px]">
                  <div className="mb-0.5 flex items-center justify-between text-muted-foreground">
                    <span>{label}</span>
                    <span className="tabular-nums" dir="ltr">
                      {v}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-background/40">
                    <div className={"h-full " + cls} style={{ width: `${v}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {/* Blocker list */}
      {validation.issues.some((i) => i.severity === "blocker") && (
        <ul className="mt-3 space-y-0.5 border-t border-border/30 pt-2 text-[11.5px]">
          {validation.issues
            .filter((i) => i.severity === "blocker")
            .slice(0, 8)
            .map((i, k) => (
              <li key={k} className="inline-flex items-center gap-1.5 text-rose-700">
                <XCircle className="h-3 w-3" /> {i.message}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

function SuggestionsPanel({
  suggestions,
  onApply,
  onDismiss,
  onClear,
}: {
  suggestions: PublishAiSuggestion[]
  onApply: (s: PublishAiSuggestion) => void
  onDismiss: (id: string) => void
  onClear: () => void
}) {
  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-violet-700">
          <Sparkles className="h-3.5 w-3.5" /> غرفة العمليات التحريرية ·{" "}
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
                <span className="ms-2 font-normal text-muted-foreground" dir="ltr">
                  → {s.field}
                </span>
              </div>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-foreground/85">
                {s.reason}
              </p>
              {"value" in s.patch && (
                <p className="mt-1 text-[11.5px] text-foreground" dir="auto">
                  {s.patch.value}
                </p>
              )}
              {"values" in s.patch && (
                <ul className="mt-1 list-inside list-disc text-[11.5px] text-foreground/85">
                  {s.patch.values.map((v, k) => (
                    <li key={k} dir="auto">
                      {v}
                    </li>
                  ))}
                </ul>
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

function Section({
  id,
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  icon: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-[12.5px] font-semibold"
        aria-expanded={open}
        aria-controls={`sec-${id}`}
      >
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div id={`sec-${id}`} className="space-y-2 border-t border-border/30 p-3">
          {children}
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  required,
  dirty,
  issues,
  children,
}: {
  label: string
  required?: boolean
  dirty?: boolean
  issues?: ValidationIssue[]
  children: React.ReactNode
}) {
  const blockers = (issues ?? []).filter((i) => i.severity === "blocker")
  const warnings = (issues ?? []).filter((i) => i.severity === "warning")
  return (
    <div>
      <label className="mb-1 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-rose-700">*</span>}
        {dirty && (
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="dirty" />
        )}
      </label>
      {children}
      {(blockers.length > 0 || warnings.length > 0) && (
        <ul className="mt-1 space-y-0.5">
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

function ListField({
  label,
  values,
  onChange,
  placeholder,
  issues,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  issues?: ValidationIssue[]
}) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (values.includes(v)) {
      setDraft("")
      return
    }
    onChange([...values, v])
    setDraft("")
  }
  const blockers = (issues ?? []).filter((i) => i.severity === "blocker")
  const warnings = (issues ?? []).filter((i) => i.severity === "warning")
  return (
    <div>
      <label className="mb-1 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="space-y-1">
        {values.map((v, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <textarea
              value={v}
              onChange={(e) => {
                const next = values.slice()
                next[i] = e.target.value
                onChange(next)
              }}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-border/40 bg-background/40 px-3 py-1.5 text-[12px] outline-none focus:border-violet-500/40"
              dir="auto"
            />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, k) => k !== i))}
              className="mt-1 rounded-md p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700"
              aria-label="حذف"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
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
            placeholder={placeholder}
            className="flex-1 rounded-xl border border-dashed border-border/40 bg-background/30 px-3 py-1.5 text-[11.5px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="rounded-xl border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-700 hover:bg-violet-500/20 disabled:opacity-40"
            aria-label="إضافة"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      {(blockers.length > 0 || warnings.length > 0) && (
        <ul className="mt-1 space-y-0.5">
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
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block rounded-xl border border-border/40 bg-background/40 px-2 py-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums" dir="ltr">
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
        className="mt-0.5 w-full cursor-pointer accent-violet-400"
        dir="ltr"
      />
    </label>
  )
}

function WebsitePreview({ doc }: { doc: WebsitePackageDocument }) {
  const w = doc.website_package
  const seo = doc.seo_package
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* Episode page mock */}
      <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
        <div className="mb-1 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
          <Info className="h-2.5 w-2.5" /> معاينة صفحة الحلقة
        </div>
        <h4 className="text-[16px] font-bold leading-tight" dir="auto">
          {w.final_title || "—"}
        </h4>
        {w.subtitle && (
          <p className="mt-0.5 text-[12px] text-muted-foreground" dir="auto">
            {w.subtitle}
          </p>
        )}
        <p className="mt-2 text-[12px] leading-relaxed text-foreground/85" dir="auto">
          {w.canonical_description || "—"}
        </p>
        {w.key_takeaways.length > 0 && (
          <ul className="mt-3 list-inside list-disc space-y-0.5 text-[11.5px] text-foreground/80">
            {w.key_takeaways.slice(0, 4).map((t, i) => (
              <li key={i} dir="auto">
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* SEO snippet mock */}
      <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
        <div className="mb-1 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
          <Info className="h-2.5 w-2.5" /> معاينة Google snippet
        </div>
        <div className="text-[11px] text-blue-700" dir="ltr">
          khatpodcast.com/episodes/{w.slug || "—"}
        </div>
        <h5 className="mt-0.5 truncate text-[14px] text-blue-700" dir="auto">
          {seo.meta_title || w.final_title || "—"}
        </h5>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground" dir="auto">
          {(seo.meta_description || w.canonical_description || "—").slice(0, 160)}
        </p>
      </div>
    </div>
  )
}

// ─── Constants ──────────────────────────────────────────────────────

const STATUS_LABEL: Record<PublishStatus, string> = {
  draft: "مسوّدة",
  in_review: "قيد المراجعة",
  ready: "جاهزة",
  scheduled: "مجدولة",
  published: "منشورة",
  archived: "مؤرشفة",
}

const VISIBILITY_LABEL: Record<PublishVisibility, string> = {
  public: "عام",
  unlisted: "غير مدرج",
  members_only: "للأعضاء",
  private: "خاص",
}

const FEATURED_LABEL: Record<FeaturedPriority, string> = {
  normal: "عاديّ",
  priority: "أولوية",
  headline: "بارز",
}

const SUGGESTION_LABEL: Record<PublishAiSuggestion["kind"], string> = {
  stronger_title: "عنوان أقوى",
  more_philosophical_framing: "تأطير فلسفي",
  emotional_reframing: "إعادة تأطير عاطفي",
  controversy_softening: "تخفيف الجدل",
  controversy_amplification: "تعميق الجدل",
  seo_improvement: "تحسين SEO",
  stronger_newsletter_angle: "زاوية نشرة أقوى",
  stronger_opening_hook: "خطّاف افتتاحي أقوى",
  better_thumbnail_direction: "اتجاه مصغّرة أفضل",
  deeper_takeaway_extraction: "خلاصات أعمق",
  stronger_quote_extraction: "اقتباسات أقوى",
  audience_specific_rewrite: "إعادة صياغة لجمهور محدّد",
  kuwait_specific_framing: "تأطير كويتي",
  arab_world_framing: "تأطير عربي",
}
