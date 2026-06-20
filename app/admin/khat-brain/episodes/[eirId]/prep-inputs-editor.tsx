"use client"

/**
 * UX-7 Phase B — Prep inputs editor (client component).
 *
 * Workspace-native form for the high-traffic prep inputs:
 *   • title              (required, single-line)
 *   • guest_name         (optional, single-line)
 *   • short_description  (optional, multi-line)
 *   • episode_goal       (optional, multi-line)
 *   • key_questions      (string[], inline list editor)
 *
 * Composes the editorial primitives:
 *   • useDirtyState — per-field unsaved-change indicator
 *   • useAutosave  — debounced save with retry/backoff
 *   • EditorStatusBadge — saving / saved / error
 *
 * Sends ONLY changed fields per save (the action accepts a partial
 * patch). The editor never blocks the operator: failed saves surface
 * an inline error banner; the operator can keep typing.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Plus, Trash2 } from "lucide-react"
import {
  EditorStatusBadge,
  useAutosave,
  useDirtyState,
} from "@/components/editorial"
import { toast } from "@/lib/use-toast"
import {
  savePrepInputsAction,
  type SavePrepInputsResult,
} from "./prep-inputs-actions"

interface PrepInputsState {
  title: string
  guest_name: string
  short_description: string
  episode_goal: string
  key_questions: string[]
}

type Field =
  | "title"
  | "guest_name"
  | "short_description"
  | "episode_goal"
  | "key_questions"

export interface PrepInputsEditorProps {
  preparationId: string
  /** Optional EIR id — used as a stable suffix for the editor debug
   *  surface id. */
  eirId?: string
  initial: {
    title: string
    guest_name: string | null
    short_description: string | null
    episode_goal: string | null
    key_questions: string[]
  }
}

export function PrepInputsEditor({
  preparationId,
  eirId,
  initial,
}: PrepInputsEditorProps) {
  const initialState: PrepInputsState = useMemo(
    () => ({
      title: initial.title,
      guest_name: initial.guest_name ?? "",
      short_description: initial.short_description ?? "",
      episode_goal: initial.episode_goal ?? "",
      key_questions: initial.key_questions ?? [],
    }),
    [initial],
  )
  const [state, setState] = useState<PrepInputsState>(initialState)
  const [validationError, setValidationError] = useState<{
    field: Field | null
    message: string
  } | null>(null)
  const stateRef = useRef(state)
  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])
  // Track which fields differ from the initial server snapshot.
  const initialRef = useRef(initialState)

  const dirty = useDirtyState()

  // Build a partial patch of only the dirty fields. Mirrors the
  // server action's contract.
  const buildPatch = useCallback(
    (s: PrepInputsState): Parameters<typeof savePrepInputsAction>[0]["patch"] => {
      const patch: Parameters<typeof savePrepInputsAction>[0]["patch"] = {}
      const init = initialRef.current
      if (s.title !== init.title) patch.title = s.title
      if (s.guest_name !== init.guest_name)
        patch.guest_name = s.guest_name === "" ? null : s.guest_name
      if (s.short_description !== init.short_description)
        patch.short_description =
          s.short_description === "" ? null : s.short_description
      if (s.episode_goal !== init.episode_goal)
        patch.episode_goal = s.episode_goal === "" ? null : s.episode_goal
      if (
        s.key_questions.length !== init.key_questions.length ||
        s.key_questions.some((q, i) => q !== init.key_questions[i])
      ) {
        patch.key_questions = s.key_questions
      }
      return patch
    },
    [],
  )

  const autosave = useAutosave<PrepInputsState>({
    surfaceId: `prep-inputs:${eirId ?? preparationId}`,
    saver: async (payload) => {
      const patch = buildPatch(payload)
      if (Object.keys(patch).length === 0) return
      const result: SavePrepInputsResult = await savePrepInputsAction({
        preparationId,
        patch,
      })
      if (result.ok) {
        // Adopt server state — anything in the patch is now the truth.
        initialRef.current = { ...payload }
        dirty.markClean()
        setValidationError(null)
        return
      }
      if (result.code === "validation") {
        setValidationError({
          field: result.field ?? null,
          message: result.message,
        })
        // Don't throw — autosave will retry, but validation errors
        // won't fix themselves. We let the user correct & re-trigger.
        // Using a thrown error makes the autosave manager flag this
        // as a non-recoverable failure for clarity.
        throw new Error(result.message)
      }
      throw new Error(
        "message" in result ? result.message : "فشل حفظ مدخلات الإعداد",
      )
    },
    debounceMs: 1500,
  })

  const updateField = useCallback(
    <K extends keyof PrepInputsState>(field: K, value: PrepInputsState[K]) => {
      setState((s) => {
        const next = { ...s, [field]: value }
        autosave.request(next)
        return next
      })
      dirty.markDirty(field as string)
    },
    [autosave, dirty],
  )

  // Toast on first successful save (UX nicety — operators want to feel
  // their first edit "stuck").
  const firstSaveDoneRef = useRef(false)
  useEffect(() => {
    if (autosave.status === "saved" && !firstSaveDoneRef.current) {
      firstSaveDoneRef.current = true
      toast({
        title: "محفوظ",
        description: "تم حفظ مدخلات الإعداد.",
        variant: "success",
        duration: 1800,
      })
    }
  }, [autosave.status])

  return (
    <div className="space-y-3 rounded-2xl border border-border/40 bg-card/30 p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-[12.5px] font-semibold">مدخلات الإعداد</h3>
        <EditorStatusBadge
          status={autosave.status}
          savedAt={autosave.savedAt}
          error={autosave.error}
          pendingChanges={autosave.pendingChanges}
          compact
        />
      </div>

      <FieldRow
        id="title"
        label="العنوان"
        required
        dirty={dirty.isFieldDirty("title")}
        validationError={
          validationError?.field === "title" ? validationError.message : null
        }
      >
        <input
          type="text"
          value={state.title}
          onChange={(e) => updateField("title", e.target.value)}
          className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12.5px] outline-none focus:border-violet-500/40"
          dir="auto"
          maxLength={200}
        />
      </FieldRow>

      <FieldRow
        id="guest_name"
        label="اسم الضيف"
        dirty={dirty.isFieldDirty("guest_name")}
      >
        <input
          type="text"
          value={state.guest_name}
          onChange={(e) => updateField("guest_name", e.target.value)}
          className="w-full rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12.5px] outline-none focus:border-violet-500/40"
          dir="auto"
          placeholder="—"
        />
      </FieldRow>

      <FieldRow
        id="short_description"
        label="وصف مختصر"
        dirty={dirty.isFieldDirty("short_description")}
      >
        <textarea
          value={state.short_description}
          onChange={(e) => updateField("short_description", e.target.value)}
          rows={3}
          className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-violet-500/40"
          dir="auto"
          placeholder="جملة أو اثنتان عن الحلقة"
        />
      </FieldRow>

      <FieldRow
        id="episode_goal"
        label="الهدف من الحلقة"
        dirty={dirty.isFieldDirty("episode_goal")}
      >
        <textarea
          value={state.episode_goal}
          onChange={(e) => updateField("episode_goal", e.target.value)}
          rows={3}
          className="w-full resize-y rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-violet-500/40"
          dir="auto"
        />
      </FieldRow>

      <FieldRow
        id="key_questions"
        label="الأسئلة الأساسية"
        dirty={dirty.isFieldDirty("key_questions")}
        validationError={
          validationError?.field === "key_questions"
            ? validationError.message
            : null
        }
      >
        <KeyQuestionsList
          value={state.key_questions}
          onChange={(next) => updateField("key_questions", next)}
        />
      </FieldRow>
    </div>
  )
}

function FieldRow({
  id,
  label,
  required,
  dirty,
  validationError,
  children,
}: {
  id: string
  label: string
  required?: boolean
  dirty: boolean
  validationError?: string | null
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground"
      >
        {label}
        {required && <span className="text-rose-700">*</span>}
        {dirty && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-amber-400"
            title="تغيير غير محفوظ"
            aria-label="dirty"
          />
        )}
      </label>
      {children}
      {validationError && (
        <p className="mt-1 text-[10.5px] text-rose-700">{validationError}</p>
      )}
    </div>
  )
}

function KeyQuestionsList({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="space-y-1.5">
      {value.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/40 bg-background/20 px-3 py-2 text-[11.5px] text-muted-foreground">
          لا توجد أسئلة بعد. اضغط «إضافة سؤال» لتبدأ.
        </p>
      )}
      {value.map((q, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span
            className="mt-2 inline-block w-5 shrink-0 text-[10.5px] tabular-nums text-muted-foreground"
            dir="ltr"
          >
            {i + 1}.
          </span>
          <textarea
            value={q}
            onChange={(e) => {
              const next = value.slice()
              next[i] = e.target.value
              onChange(next)
            }}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border/40 bg-background/40 px-3 py-1.5 text-[12px] outline-none focus:border-violet-500/40"
            dir="auto"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className="mt-1 rounded-md p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700"
            title="حذف السؤال"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, ""])}
        className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11.5px] text-violet-700 hover:bg-violet-500/20"
      >
        <Plus className="h-3 w-3" />
        إضافة سؤال
      </button>
    </div>
  )
}
