"use client"

/**
 * Phase 3 — Trusted Sources client UI.
 *
 * - Top bar: search + filter chips + sort dropdown + "إضافة مصدر"
 * - Inline form for new + edit (toggled per row)
 * - Per-card actions: تفعيل/إيقاف · أرشفة/استعادة · تعديل · ملاحظات
 * - Trust + alignment sliders update via debounced server actions
 * - Preview pane: linked count + mean score + approval ratio +
 *   latest activity + last 3 linked signals
 *
 * Arabic-only operator copy. All toasts go through window-level alerts
 * to keep the surface compact for Phase 3.
 */

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Edit3,
  Archive,
  RotateCcw,
  Pause,
  Play,
  Save,
  X as XIcon,
  Sliders,
  StickyNote,
  Activity,
  ExternalLink,
} from "lucide-react"
import {
  createSourceAction,
  updateSourceAction,
  setActiveAction,
  archiveSourceAction,
  restoreSourceAction,
  adjustTrustAction,
  adjustAlignmentAction,
  setNotesAction,
} from "./source-actions"
import {
  PAGE_COPY,
  SOURCE_TYPE_LABEL,
  SOURCE_TYPE_REQUIRES_URL,
  FILTER_LABEL,
  SORT_LABEL,
  SOURCE_LANGUAGES_HINT,
  relativeArabic,
} from "./copy"
import {
  TRUSTED_SOURCE_TYPES,
  type TrustedSourceType,
} from "@/lib/db/schema/editorial-intelligence"
import {
  SOURCE_FILTER_KEYS,
  SOURCE_SORT_KEYS,
  type SourceFilterKey,
  type SourceRow,
  type SourceSortKey,
} from "@/lib/market-intelligence/sources-types"

type FormDraft = {
  source_type: TrustedSourceType
  identifier: string
  display_name: string
  language: string
  geography: string
  trust_score: number
  editorial_alignment_score: number
  active: boolean
  notes: string
}

function emptyDraft(): FormDraft {
  return {
    source_type: "youtube",
    identifier: "",
    display_name: "",
    language: "ar",
    geography: "",
    trust_score: 0.5,
    editorial_alignment_score: 0.5,
    active: true,
    notes: "",
  }
}

function draftFromRow(r: SourceRow): FormDraft {
  return {
    source_type: r.source_type,
    identifier: r.identifier,
    display_name: r.display_name,
    language: r.language,
    geography: r.geography ?? "",
    trust_score: r.trust_score,
    editorial_alignment_score: r.editorial_alignment_score,
    active: r.active,
    notes: r.notes ?? "",
  }
}

export function SourcesClient({
  sources,
  filter,
  sort,
  search,
  typeFilter,
  languageFilter,
  geographyFilter,
  availableGeos,
  availableLangs,
}: {
  sources: SourceRow[]
  filter: SourceFilterKey
  sort: SourceSortKey
  search: string
  typeFilter: string
  languageFilter: string
  geographyFilter: string
  availableGeos: string[]
  availableLangs: string[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState<FormDraft>(emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<FormDraft | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const updateUrl = (params: Record<string, string | null>) => {
    const sp = new URLSearchParams()
    const keep = {
      filter: filter !== "all" ? filter : null,
      sort: sort !== "newest" ? sort : null,
      type: typeFilter || null,
      language: languageFilter || null,
      geography: geographyFilter || null,
      search: search || null,
      ...params,
    }
    for (const [k, v] of Object.entries(keep)) {
      if (v && v.length > 0) sp.set(k, v)
    }
    const qs = sp.toString()
    router.push(
      `/admin/khat-brain/market/sources${qs ? `?${qs}` : ""}`,
    )
  }

  const submitAdd = () => {
    setFormError(null)
    start(async () => {
      const r = await createSourceAction({
        source_type: addDraft.source_type,
        identifier: addDraft.identifier,
        display_name: addDraft.display_name,
        language: addDraft.language,
        geography: addDraft.geography || null,
        trust_score: addDraft.trust_score,
        editorial_alignment_score: addDraft.editorial_alignment_score,
        active: addDraft.active,
        notes: addDraft.notes || null,
      })
      if (!r.ok) {
        setFormError(r.message)
        return
      }
      setAdding(false)
      setAddDraft(emptyDraft())
      router.refresh()
    })
  }

  const submitEdit = (id: string) => {
    if (!editDraft) return
    setFormError(null)
    start(async () => {
      const r = await updateSourceAction({
        id,
        source_type: editDraft.source_type,
        identifier: editDraft.identifier,
        display_name: editDraft.display_name,
        language: editDraft.language,
        geography: editDraft.geography || null,
        trust_score: editDraft.trust_score,
        editorial_alignment_score: editDraft.editorial_alignment_score,
        notes: editDraft.notes || null,
      })
      if (!r.ok) {
        setFormError(r.message)
        return
      }
      setEditingId(null)
      setEditDraft(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-card/30 p-2"
        data-toolbar
      >
        {SOURCE_FILTER_KEYS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => updateUrl({ filter: f === "all" ? null : f })}
            data-filter-key={f}
            data-active={f === filter}
            className={
              "rounded-xl px-2.5 py-1 text-[11.5px] font-medium transition-colors " +
              (f === filter
                ? "border border-primary/30 bg-primary/10 text-primary"
                : "border border-transparent text-muted-foreground hover:border-border/40 hover:bg-background/60")
            }
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
        <div className="flex-1" />
        <select
          value={typeFilter}
          onChange={(e) => updateUrl({ type: e.target.value || null })}
          className="rounded-lg border border-border/40 bg-background/40 px-2 py-1 text-[11.5px] text-foreground/80"
          data-type-filter
        >
          <option value="">{PAGE_COPY.filters.allTypes}</option>
          {(TRUSTED_SOURCE_TYPES as readonly TrustedSourceType[]).map((t) => (
            <option key={t} value={t}>
              {SOURCE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          value={languageFilter}
          onChange={(e) => updateUrl({ language: e.target.value || null })}
          className="rounded-lg border border-border/40 bg-background/40 px-2 py-1 text-[11.5px] text-foreground/80"
          data-language-filter
        >
          <option value="">{PAGE_COPY.filters.allLanguages}</option>
          {availableLangs.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={geographyFilter}
          onChange={(e) => updateUrl({ geography: e.target.value || null })}
          className="rounded-lg border border-border/40 bg-background/40 px-2 py-1 text-[11.5px] text-foreground/80"
          data-geography-filter
        >
          <option value="">{PAGE_COPY.filters.allGeographies}</option>
          {availableGeos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => updateUrl({ sort: e.target.value })}
          className="rounded-lg border border-border/40 bg-background/40 px-2 py-1 text-[11.5px] text-foreground/80"
          data-sort
        >
          {SOURCE_SORT_KEYS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setAdding(true)
            setAddDraft(emptyDraft())
            setFormError(null)
          }}
          className="inline-flex items-center gap-1 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11.5px] font-medium text-violet-200 hover:bg-violet-500/20"
          data-add-source
        >
          <Plus className="h-3 w-3" />
          {PAGE_COPY.addSource}
        </button>
      </div>

      {/* ── Add form ────────────────────────────────────────────── */}
      {adding && (
        <div
          className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4"
          data-add-form
        >
          <h3 className="mb-3 text-[13px] font-semibold text-violet-100">
            {PAGE_COPY.newSource}
          </h3>
          <SourceForm
            draft={addDraft}
            onChange={setAddDraft}
            includeActive
          />
          {formError && (
            <p className="mt-2 text-[11.5px] text-rose-300" data-form-error>
              {formError}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={submitAdd}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11.5px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
              data-add-submit
            >
              <Save className="h-3 w-3" />
              {PAGE_COPY.saveSource}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setFormError(null)
              }}
              className="rounded-lg border border-border/40 bg-background/40 px-3 py-1 text-[11.5px] text-muted-foreground hover:bg-muted/30"
            >
              {PAGE_COPY.cancel}
            </button>
          </div>
        </div>
      )}

      {/* ── List ────────────────────────────────────────────────── */}
      {sources.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-border/40 bg-card/20 px-6 py-12 text-center text-[12.5px] text-muted-foreground"
          data-empty
        >
          {filter === "all" && !search && !typeFilter && !languageFilter && !geographyFilter
            ? PAGE_COPY.empty
            : PAGE_COPY.emptyForFilter}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sources.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              isEditing={editingId === s.id}
              editDraft={editingId === s.id ? editDraft : null}
              startEdit={() => {
                setEditingId(s.id)
                setEditDraft(draftFromRow(s))
                setFormError(null)
              }}
              cancelEdit={() => {
                setEditingId(null)
                setEditDraft(null)
                setFormError(null)
              }}
              updateEditDraft={setEditDraft}
              submitEdit={() => submitEdit(s.id)}
              pending={pending}
              formError={editingId === s.id ? formError : null}
              onRefresh={() => router.refresh()}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function SourceCard({
  source,
  isEditing,
  editDraft,
  startEdit,
  cancelEdit,
  updateEditDraft,
  submitEdit,
  pending,
  formError,
  onRefresh,
}: {
  source: SourceRow
  isEditing: boolean
  editDraft: FormDraft | null
  startEdit: () => void
  cancelEdit: () => void
  updateEditDraft: (d: FormDraft) => void
  submitEdit: () => void
  pending: boolean
  formError: string | null
  onRefresh: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesDraft, setNotesDraft] = useState(source.notes ?? "")

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      onRefresh()
    } finally {
      setBusy(false)
    }
  }

  const stateBadge = useMemo(() => {
    if (source.archived_at) {
      return {
        label: PAGE_COPY.stats.statusArchived,
        cls: "border-slate-500/30 bg-slate-500/10 text-slate-200",
      }
    }
    if (source.active) {
      return {
        label: PAGE_COPY.stats.statusActive,
        cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      }
    }
    return {
      label: PAGE_COPY.stats.statusInactive,
      cls: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    }
  }, [source.archived_at, source.active])

  return (
    <li
      className="rounded-2xl border border-border/40 bg-card/30 p-4"
      data-source-card
      data-source-id={source.id}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span
              className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 " + stateBadge.cls}
            >
              {stateBadge.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/30 px-2 py-0.5 text-muted-foreground">
              {SOURCE_TYPE_LABEL[source.source_type]}
            </span>
            {source.language && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/30 bg-background/30 px-2 py-0.5 text-muted-foreground" dir="ltr">
                {source.language}
              </span>
            )}
            {source.geography && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/30 bg-background/30 px-2 py-0.5 text-muted-foreground">
                {source.geography}
              </span>
            )}
          </div>
          <h3 className="text-[14px] font-semibold leading-snug text-foreground">
            {source.display_name}
          </h3>
          <p
            className="mt-0.5 truncate text-[11px] text-muted-foreground"
            dir="ltr"
            title={source.identifier}
          >
            {source.identifier}
          </p>
        </div>
        {SOURCE_TYPE_REQUIRES_URL[source.source_type] &&
          /^https?:\/\//i.test(source.identifier) && (
            <a
              href={source.identifier}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
              aria-label="فتح في تبويب جديد"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
      </div>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <dl
        className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border border-border/30 bg-background/30 p-2.5 text-[11px]"
        data-source-stats
      >
        <Stat label={PAGE_COPY.stats.linked} value={source.linked_count} ltr />
        <Stat
          label={PAGE_COPY.stats.meanScore}
          value={
            source.mean_signal_score === null
              ? "—"
              : source.mean_signal_score.toFixed(2)
          }
          ltr
        />
        <Stat
          label={PAGE_COPY.stats.approvalRatio}
          value={
            source.approval_ratio === null
              ? "—"
              : `${Math.round(source.approval_ratio * 100)}%`
          }
          ltr
        />
        <Stat
          label={PAGE_COPY.stats.latestActivity}
          value={relativeArabic(source.latest_signal_at)}
        />
      </dl>

      {/* ── Trust + alignment sliders ───────────────────────────── */}
      <div className="mt-2 grid grid-cols-1 gap-2">
        <Slider
          label={PAGE_COPY.form.trustScore}
          value={source.trust_score}
          onChange={(score) =>
            run(() => adjustTrustAction({ id: source.id, score }))
          }
          disabled={busy || pending || !!source.archived_at}
          testId="trust"
        />
        <Slider
          label={PAGE_COPY.form.alignmentScore}
          value={source.editorial_alignment_score}
          onChange={(score) =>
            run(() => adjustAlignmentAction({ id: source.id, score }))
          }
          disabled={busy || pending || !!source.archived_at}
          testId="alignment"
        />
      </div>

      {/* ── Latest signals preview ─────────────────────────────── */}
      <div className="mt-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {PAGE_COPY.stats.latestSignals}
        </div>
        {source.latest_signals.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/70">
            {PAGE_COPY.stats.noLinkedSignals}
          </p>
        ) : (
          <ul className="space-y-1 text-[11.5px]" data-latest-signals>
            {source.latest_signals.map((sig) => (
              <li
                key={sig.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate text-foreground/85">{sig.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground/70">
                  {relativeArabic(sig.collected_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Notes ──────────────────────────────────────────────── */}
      {!notesOpen && source.notes && (
        <div className="mt-2 rounded-lg border border-border/30 bg-background/30 p-2 text-[11px] text-foreground/80">
          {source.notes}
        </div>
      )}
      {notesOpen && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[11.5px] text-foreground placeholder:text-muted-foreground/60"
            placeholder={PAGE_COPY.form.notesPlaceholder}
            dir="rtl"
            data-notes-input
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={busy || pending}
              onClick={() =>
                run(async () => {
                  await setNotesAction({ id: source.id, notes: notesDraft })
                  setNotesOpen(false)
                })
              }
              className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
            >
              {PAGE_COPY.actions.saveNotes}
            </button>
            <button
              type="button"
              onClick={() => {
                setNotesOpen(false)
                setNotesDraft(source.notes ?? "")
              }}
              className="rounded-md border border-border/40 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/30"
            >
              {PAGE_COPY.cancel}
            </button>
          </div>
        </div>
      )}

      {/* ── Action row ─────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {!source.archived_at && source.active && (
          <ActionBtn
            tone="muted"
            icon={<Pause className="h-3 w-3" />}
            label={PAGE_COPY.actions.deactivate}
            disabled={busy || pending}
            onClick={() => run(() => setActiveAction({ id: source.id, active: false }))}
            testId="deactivate"
          />
        )}
        {!source.archived_at && !source.active && (
          <ActionBtn
            tone="ok"
            icon={<Play className="h-3 w-3" />}
            label={PAGE_COPY.actions.activate}
            disabled={busy || pending}
            onClick={() => run(() => setActiveAction({ id: source.id, active: true }))}
            testId="activate"
          />
        )}
        {!source.archived_at && (
          <ActionBtn
            tone="warn"
            icon={<Archive className="h-3 w-3" />}
            label={PAGE_COPY.actions.archive}
            disabled={busy || pending}
            onClick={() => run(() => archiveSourceAction({ id: source.id }))}
            testId="archive"
          />
        )}
        {source.archived_at && (
          <ActionBtn
            tone="ok"
            icon={<RotateCcw className="h-3 w-3" />}
            label={PAGE_COPY.actions.restore}
            disabled={busy || pending}
            onClick={() => run(() => restoreSourceAction({ id: source.id }))}
            testId="restore"
          />
        )}
        {!isEditing && !source.archived_at && (
          <ActionBtn
            tone="muted"
            icon={<Edit3 className="h-3 w-3" />}
            label={PAGE_COPY.actions.edit}
            disabled={busy || pending}
            onClick={startEdit}
            testId="edit"
          />
        )}
        {!notesOpen && (
          <ActionBtn
            tone="muted"
            icon={<StickyNote className="h-3 w-3" />}
            label={PAGE_COPY.actions.notes}
            disabled={busy || pending}
            onClick={() => setNotesOpen(true)}
            testId="notes"
          />
        )}
      </div>

      {/* ── Edit form ──────────────────────────────────────────── */}
      {isEditing && editDraft && (
        <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3" data-edit-form>
          <SourceForm draft={editDraft} onChange={updateEditDraft} />
          {formError && (
            <p className="mt-2 text-[11.5px] text-rose-300">{formError}</p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={submitEdit}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11.5px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
              data-edit-submit
            >
              <Save className="h-3 w-3" />
              {PAGE_COPY.saveSource}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-border/40 bg-background/40 px-3 py-1 text-[11.5px] text-muted-foreground hover:bg-muted/30"
            >
              {PAGE_COPY.cancel}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function SourceForm({
  draft,
  onChange,
  includeActive = false,
}: {
  draft: FormDraft
  onChange: (d: FormDraft) => void
  includeActive?: boolean
}) {
  const urlRequired = SOURCE_TYPE_REQUIRES_URL[draft.source_type]
  const set = <K extends keyof FormDraft>(k: K, v: FormDraft[K]) =>
    onChange({ ...draft, [k]: v })
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <FormField label={PAGE_COPY.form.displayName}>
        <input
          type="text"
          value={draft.display_name}
          onChange={(e) => set("display_name", e.target.value)}
          dir="rtl"
          className="w-full rounded-lg border border-border/40 bg-background/40 p-1.5 text-[12px]"
          data-form-display-name
          required
        />
      </FormField>
      <FormField label={PAGE_COPY.form.type}>
        <select
          value={draft.source_type}
          onChange={(e) =>
            set("source_type", e.target.value as TrustedSourceType)
          }
          className="w-full rounded-lg border border-border/40 bg-background/40 p-1.5 text-[12px]"
          data-form-type
        >
          {(TRUSTED_SOURCE_TYPES as readonly TrustedSourceType[]).map((t) => (
            <option key={t} value={t}>
              {SOURCE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label={PAGE_COPY.form.identifier}
        hint={urlRequired ? PAGE_COPY.form.urlHint : undefined}
        wide
      >
        <input
          type="text"
          value={draft.identifier}
          onChange={(e) => set("identifier", e.target.value)}
          dir="ltr"
          placeholder={urlRequired ? "https://…" : "@handle"}
          className="w-full rounded-lg border border-border/40 bg-background/40 p-1.5 text-[12px]"
          data-form-identifier
          required
        />
      </FormField>
      <FormField label={PAGE_COPY.form.language}>
        <input
          type="text"
          value={draft.language}
          onChange={(e) => set("language", e.target.value)}
          dir="ltr"
          list="lang-options"
          placeholder={PAGE_COPY.form.languagePlaceholder}
          className="w-full rounded-lg border border-border/40 bg-background/40 p-1.5 text-[12px]"
          data-form-language
        />
        <datalist id="lang-options">
          {SOURCE_LANGUAGES_HINT.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </FormField>
      <FormField label={PAGE_COPY.form.geography}>
        <input
          type="text"
          value={draft.geography}
          onChange={(e) => set("geography", e.target.value)}
          dir="rtl"
          placeholder={PAGE_COPY.form.geographyPlaceholder}
          className="w-full rounded-lg border border-border/40 bg-background/40 p-1.5 text-[12px]"
          data-form-geography
        />
      </FormField>
      <FormField
        label={PAGE_COPY.form.trustScore}
        hint={PAGE_COPY.form.rangeHint}
      >
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={draft.trust_score}
          onChange={(e) => set("trust_score", Number(e.target.value))}
          dir="ltr"
          className="w-full rounded-lg border border-border/40 bg-background/40 p-1.5 text-[12px]"
          data-form-trust
        />
      </FormField>
      <FormField
        label={PAGE_COPY.form.alignmentScore}
        hint={PAGE_COPY.form.rangeHint}
      >
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={draft.editorial_alignment_score}
          onChange={(e) =>
            set("editorial_alignment_score", Number(e.target.value))
          }
          dir="ltr"
          className="w-full rounded-lg border border-border/40 bg-background/40 p-1.5 text-[12px]"
          data-form-alignment
        />
      </FormField>
      {includeActive && (
        <FormField label={PAGE_COPY.form.active}>
          <label className="inline-flex items-center gap-2 text-[12px] text-foreground/80">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => set("active", e.target.checked)}
              className="h-3.5 w-3.5 accent-violet-500"
              data-form-active
            />
            {PAGE_COPY.stats.statusActive}
          </label>
        </FormField>
      )}
      <FormField label={PAGE_COPY.form.notes} wide>
        <textarea
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          dir="rtl"
          placeholder={PAGE_COPY.form.notesPlaceholder}
          className="w-full rounded-lg border border-border/40 bg-background/40 p-1.5 text-[12px]"
          data-form-notes
        />
      </FormField>
    </div>
  )
}

function FormField({
  label,
  hint,
  wide,
  children,
}: {
  label: string
  hint?: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={"flex flex-col gap-0.5 " + (wide ? "sm:col-span-2" : "")}>
      <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[10.5px] text-muted-foreground/70">{hint}</span>
      )}
    </label>
  )
}

function Stat({
  label,
  value,
  ltr,
}: {
  label: string
  value: string | number
  ltr?: boolean
}) {
  return (
    <>
      <dt className="text-muted-foreground/70">{label}</dt>
      <dd className="text-foreground/85" dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </>
  )
}

function Slider({
  label,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  testId: string
}) {
  return (
    <label className="flex items-center gap-2 text-[11.5px]" data-slider={testId}>
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-violet-500"
        data-slider-input={testId}
      />
      <span className="w-10 shrink-0 text-end font-mono text-foreground/80" dir="ltr">
        {value.toFixed(2)}
      </span>
    </label>
  )
}

function ActionBtn({
  tone,
  icon,
  label,
  disabled,
  onClick,
  testId,
}: {
  tone: "ok" | "danger" | "warn" | "muted"
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
  testId: string
}) {
  const cls = {
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
    danger: "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
    muted: "border-border/40 bg-background/40 text-muted-foreground hover:bg-muted/30",
  }[tone]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-action={testId}
      className={
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium disabled:opacity-40 " +
        cls
      }
    >
      {icon}
      {label}
    </button>
  )
}

// Suppress unused — Sliders+Activity icons reserved for future preview slot.
void Sliders
void Activity
void XIcon
