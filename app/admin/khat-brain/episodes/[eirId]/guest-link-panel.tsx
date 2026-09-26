"use client"

/**
 * «نسخة الضيف» — the admin card on the episode prep tab.
 *
 *   link lifecycle (create / copy / rotate / revoke) · details (name, home
 *   address, map, house photo) · questionnaire answers · sample-question
 *   curation · preview (the guest's own component) · publish + stale badge ·
 *   suggestions inbox · a ready-to-copy WhatsApp message.
 *
 * The raw token exists only in this component's state right after create or
 * rotate — the DB keeps its hash — so the link can be copied once. Lost it?
 * Rotate (the old URL stops working).
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Pin,
  RefreshCw,
  Send,
  Upload,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/use-toast"
import { formatArabicCount, formatDateTime } from "@/lib/shared/formatters"
import { GuestPrepViewPanel } from "@/components/guest-link/guest-prep-view"
import { runAction } from "@/app/admin/components/run-action"
import type { GuestLinkAdminState, StaleReason } from "@/lib/guest-link/admin"
import type { SectionKind } from "@/lib/preparation/v2/types"
import {
  createGuestLinkAction,
  decideGuestSuggestionAction,
  publishGuestLinkAction,
  removeHousePhotoAction,
  revokeGuestLinkAction,
  rotateGuestLinkAction,
  saveGuestLinkDetailsAction,
  setSampleOverrideAction,
  type GuestLinkActionResult,
} from "./guest-link-actions"
import { addGuestQuestionToPrepAction } from "./prep-actions"

const STALE_LABEL: Record<StaleReason, string> = {
  prep: "الإعداد تغيّر",
  schedule: "الموعد تغيّر",
  location: "المكان أو الصورة تغيّرت",
  content: "الأمثلة تغيّرت",
}

const DAY_LABEL: Record<string, string> = {
  sunday: "الأحد",
  monday: "الاثنين",
  tuesday: "الثلاثاء",
  wednesday: "الأربعاء",
  thursday: "الخميس",
  friday: "الجمعة",
  saturday: "السبت",
}

const TIME_LABEL: Record<string, string> = {
  morning: "الصبح",
  afternoon: "الظهر",
  evening: "العصر والمغرب",
}

function whatsappMessage(name: string, url: string): string {
  return [
    `حيّاك الله ${name}،`,
    "هذا رابطك الخاص لتحضير حلقتك في بودكاست خط:",
    url,
    "الرابط خاص فيك، افتحه من جوالك متى ما ناسبك.",
  ].join("\n")
}

export function GuestLinkPanel({ state }: { state: GuestLinkAdminState }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [token, setToken] = useState<string | null>(null)
  const link = state.link

  function run(fn: () => Promise<GuestLinkActionResult>, onOk?: (r: GuestLinkActionResult) => void) {
    startTransition(async () => {
      // runAction never rejects — a gateway cut or a stale tab becomes a
      // message instead of a transition that never settles.
      const outcome = await runAction(fn)
      const r: GuestLinkActionResult = outcome.ok ? outcome.data : { ok: false, message: outcome.message }
      toast({ title: r.message, variant: r.ok ? "default" : "destructive" })
      if (r.ok) {
        onOk?.(r)
        router.refresh()
      }
    })
  }

  const url = token && typeof window !== "undefined" ? `${window.location.origin}/prepare/${token}` : null

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5" data-guest-link-panel>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Link2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[13.5px] font-bold tracking-tight text-foreground">نسخة الضيف</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              رابط خاص للضيف: استبيان، ترحيب، ثم ملامح الحلقة بعد النشر.
            </p>
          </div>
        </div>
        {link && (
          <StatusPill access={link.access} publishedAt={link.published_at} stale={state.stale} />
        )}
      </header>

      {!link ? (
        <CreateForm
          defaultName={state.defaultDisplayName}
          disabled={pending}
          onCreate={(name) =>
            run(() => createGuestLinkAction(state.eirId, name), (r) => setToken(r.ok ? r.token ?? null : null))
          }
        />
      ) : (
        <div className="space-y-5 text-[12px]">
          <LinkBox
            url={url}
            name={link.guest_display_name}
            expiresAt={link.expires_at}
            openCount={link.open_count}
            lastOpenedAt={link.last_opened_at}
            disabled={pending}
            onRotate={() =>
              run(() => rotateGuestLinkAction(state.eirId), (r) => setToken(r.ok ? r.token ?? null : null))
            }
            onRevoke={() => run(() => revokeGuestLinkAction(state.eirId), () => setToken(null))}
          />

          <DetailsForm state={state} disabled={pending} run={run} />

          <QuestionnaireBlock state={state} />

          {state.hasPrepV2 ? (
            <>
              <SampleCuration state={state} disabled={pending} run={run} />
              <PreviewBlock state={state} disabled={pending} run={run} />
            </>
          ) : (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-amber-800">
              ما فيه إعداد مولَّد بعد — الضيف يقدر يعبّي الاستبيان، وبيشوف «نثبّت التفاصيل ونرسل لك» لين
              تنشر.
            </p>
          )}

          <SuggestionsInbox state={state} disabled={pending} run={run} />
        </div>
      )}
    </section>
  )
}

// ─── Pieces ────────────────────────────────────────────────────────────

type Run = (fn: () => Promise<GuestLinkActionResult>, onOk?: (r: GuestLinkActionResult) => void) => void

function StatusPill({
  access,
  publishedAt,
  stale,
}: {
  access: "ok" | "expired" | "revoked"
  publishedAt: string | null
  stale: StaleReason[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span
        className={cn(
          "rounded-full px-2 py-0.5 font-medium",
          access === "ok" ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700",
        )}
      >
        {access === "ok" ? "فعّال" : access === "expired" ? "منتهي" : "ملغى"}
      </span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
        {publishedAt ? `منشور ${formatDateTime(publishedAt)}` : "غير منشور"}
      </span>
      {stale.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-800">
          <AlertTriangle className="h-3 w-3" />
          يحتاج إعادة نشر: {stale.map((s) => STALE_LABEL[s]).join("، ")}
        </span>
      )}
    </div>
  )
}

function CreateForm({
  defaultName,
  disabled,
  onCreate,
}: {
  defaultName: string
  disabled: boolean
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState(defaultName)
  return (
    <div className="flex flex-wrap items-end gap-2 text-[12px]">
      <label className="flex min-w-56 flex-1 flex-col gap-1">
        <span className="text-muted-foreground">اسم الضيف كما نناديه في الترحيب</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className="rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
        />
      </label>
      <button
        type="button"
        disabled={disabled || name.trim().length < 2}
        onClick={() => onCreate(name)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
      >
        <Link2 className="h-3.5 w-3.5" /> إنشاء رابط
      </button>
    </div>
  )
}

function LinkBox({
  url,
  name,
  expiresAt,
  openCount,
  lastOpenedAt,
  disabled,
  onRotate,
  onRevoke,
}: {
  url: string | null
  name: string
  expiresAt: string
  openCount: number
  lastOpenedAt: string | null
  disabled: boolean
  onRotate: () => void
  onRevoke: () => void
}) {
  const [copied, setCopied] = useState<"url" | "msg" | null>(null)
  async function copy(text: string, what: "url" | "msg") {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast({ title: "تعذّر النسخ — انسخه يدوياً", variant: "destructive" })
    }
  }
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3">
      {url ? (
        <>
          <p className="font-medium text-amber-800">
            انسخ الرابط الحين — نحفظ بصمته فقط، وما نقدر نعرضه مرة ثانية.
          </p>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 truncate rounded-lg bg-background px-2 py-1.5 text-[11.5px]">
              {url}
            </code>
            <button
              type="button"
              onClick={() => copy(url, "url")}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5"
            >
              {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} نسخ
            </button>
          </div>
          <div>
            <p className="mb-1 text-muted-foreground">رسالة واتساب جاهزة (ترسلها من جوالك):</p>
            <pre className="whitespace-pre-wrap rounded-lg bg-background p-2 font-sans text-[12px]">
              {whatsappMessage(name, url)}
            </pre>
            <button
              type="button"
              onClick={() => copy(whatsappMessage(name, url), "msg")}
              className="mt-1 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5"
            >
              {copied === "msg" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} نسخ الرسالة
            </button>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">
          الرابط يظهر مرة وحدة عند الإنشاء أو التجديد. إذا ضاع، جدّده (الرابط القديم يتوقف).
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          ينتهي {formatDateTime(expiresAt)} ·{" "}
          {openCount === 0 ? "لم يُفتح بعد" : `فُتح ${formatArabicCount(openCount, "مرة")}`}
          {lastOpenedAt ? ` · آخر فتح ${formatDateTime(lastOpenedAt)}` : ""}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (confirm("تجديد الرابط يوقف الرابط الحالي. إذا أرسلته للضيف لازم ترسل له الجديد. نكمل؟")) onRotate()
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-foreground disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" /> تجديد الرابط
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (confirm("إلغاء الرابط؟ الضيف ما بيقدر يفتحه بعدها.")) onRevoke()
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2 py-1 text-rose-700 disabled:opacity-50"
          >
            <X className="h-3 w-3" /> إلغاء الرابط
          </button>
        </span>
      </div>
    </div>
  )
}

function DetailsForm({ state, disabled, run }: { state: GuestLinkAdminState; disabled: boolean; run: Run }) {
  const link = state.link!
  const router = useRouter()
  const [name, setName] = useState(link.guest_display_name)
  const [label, setLabel] = useState(link.location_label ?? "")
  const [address, setAddress] = useState(link.address ?? "")
  const [mapUrl, setMapUrl] = useState(link.map_url ?? "")
  const [showSchedule, setShowSchedule] = useState(link.show_schedule)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/admin/guest-links/${state.eirId}/house-photo`, { method: "POST", body: fd })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) toast({ title: data.error ?? "تعذّر رفع الصورة", variant: "destructive" })
      else {
        toast({ title: "رُفعت الصورة" })
        router.refresh()
      }
    } finally {
      setUploading(false)
    }
  }

  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
  return (
    <div className="space-y-3">
      <h3 className="text-[12.5px] font-semibold text-foreground">التفاصيل اللي يشوفها الضيف بعد النشر</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">اسم الضيف في الترحيب (قبل ما يكتب كنيته)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">اسم المكان (مثال: بيت بو فهد — اليرموك)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} className={input} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-muted-foreground">العنوان الكامل</span>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={500} className={input} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-muted-foreground">رابط الخريطة (Google Maps أو Apple Maps، https فقط)</span>
          <input dir="ltr" value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} maxLength={1000} className={cn(input, "text-start")} />
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={showSchedule} onChange={(e) => setShowSchedule(e.target.checked)} />
        <span>أظهر موعد التصوير للضيف</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            run(() =>
              saveGuestLinkDetailsAction(state.eirId, {
                guest_display_name: name,
                location_label: label,
                address,
                map_url: mapUrl,
                show_schedule: showSchedule,
              }),
            )
          }
          className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          حفظ التفاصيل
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "جاري الرفع…" : link.has_house_photo ? "تغيير صورة البيت" : "رفع صورة البيت"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ""
            }}
          />
        </label>
        {link.has_house_photo && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => run(() => removeHousePhotoAction(state.eirId))}
            className="text-rose-700 underline-offset-2 hover:underline disabled:opacity-50"
          >
            إزالة الصورة
          </button>
        )}
      </div>
    </div>
  )
}

function QuestionnaireBlock({ state }: { state: GuestLinkAdminState }) {
  const link = state.link!
  const q = link.questionnaire
  if (!link.questionnaire_submitted_at || !q) {
    return (
      <p className="text-muted-foreground">
        الاستبيان: {link.has_draft ? "بدأ الضيف بالتعبئة ولم يرسل بعد." : "لم يُعبّأ بعد."}
      </p>
    )
  }
  const rows: [string, string | null][] = [
    ["الاسم", [q.honorific, q.full_name].filter(Boolean).join(" ")],
    ["الكنية", q.kunya],
    ["النطق", q.pronunciation_notes],
    ["واتساب", q.phone_whatsapp],
    ["المشروب", q.preferred_drink],
    ["الأيام", (q.preferred_filming_days ?? []).map((d) => DAY_LABEL[d] ?? d).join("، ")],
    ["الوقت", TIME_LABEL[q.preferred_filming_time] ?? q.preferred_filming_time],
    ["قيود المواعيد", q.scheduling_restrictions],
    ["احتياجات تقنية", q.technical_needs],
    ["يتحمس للحديث عن", q.topics_excited_about],
    ["يفضّل تجنّب", q.sensitivities_to_avoid],
    ["ملاحظة للفريق", q.team_notes],
  ]
  return (
    <div className="space-y-2">
      <h3 className="text-[12.5px] font-semibold text-foreground">
        إجابات الضيف <span className="font-normal text-muted-foreground">({formatDateTime(link.questionnaire_submitted_at)})</span>
      </h3>
      {state.answersAfterPrep && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-amber-800">
          إجابات الضيف وصلت بعد توليد الإعداد الحالي — فكّر تعيد التوليد عشان تدخل «يتحمس له» و«يفضّل تجنّبه».
        </p>
      )}
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
        {rows
          .filter(([, v]) => v && v.trim())
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="whitespace-pre-line text-foreground">
                {k === "واتساب" ? <bdi dir="ltr">{v}</bdi> : v}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  )
}

function SampleCuration({ state, disabled, run }: { state: GuestLinkAdminState; disabled: boolean; run: Run }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  if (state.candidates.length === 0) {
    return <p className="text-muted-foreground">ما فيه أسئلة منخفضة الحساسية تصلح أمثلة للضيف.</p>
  }
  return (
    <details className="rounded-xl border border-border/60 p-3">
      <summary className="cursor-pointer text-[12.5px] font-semibold text-foreground">
        اختيار الأمثلة ({state.candidates.filter((c) => c.included).length} ظاهرة — الحد 12، و3 لكل محور)
      </summary>
      <p className="mt-2 text-muted-foreground">
        تظهر فقط الأسئلة منخفضة الحساسية وغير المواجِهة. ثبّت، أخفِ، أو عدّل النص اللي يشوفه الضيف.
      </p>
      <ul className="mt-3 space-y-2">
        {state.candidates.map((c) => (
          <li key={c.id} className={cn("rounded-lg border border-border/60 p-2", c.hidden && "opacity-60")}>
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{c.section_label}</span>
              {c.must_ask && <span>· أساسي</span>}
              {c.included && <span className="font-medium text-emerald-700">· ظاهر للضيف</span>}
            </div>
            {editing === c.id ? (
              <div className="space-y-1">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={300}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12.5px]" />
                <div className="flex gap-2">
                  <button type="button" disabled={disabled}
                    onClick={() => run(() => setSampleOverrideAction(state.eirId, c.id, { text: draft }), () => setEditing(null))}
                    className="rounded-lg bg-primary px-2 py-1 text-primary-foreground">حفظ</button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-border px-2 py-1">إلغاء</button>
                  {c.override_text && (
                    <button type="button" disabled={disabled}
                      onClick={() => run(() => setSampleOverrideAction(state.eirId, c.id, { text: null }), () => setEditing(null))}
                      className="text-muted-foreground underline-offset-2 hover:underline">رجّع النص الأصلي</button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-foreground">{c.override_text ?? c.text}</p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
              <button type="button" disabled={disabled}
                onClick={() => run(() => setSampleOverrideAction(state.eirId, c.id, { pinned: !c.pinned }))}
                className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5", c.pinned ? "border-primary/40 text-primary" : "border-border")}>
                <Pin className="h-3 w-3" /> {c.pinned ? "مثبّت" : "ثبّت"}
              </button>
              <button type="button" disabled={disabled}
                onClick={() => run(() => setSampleOverrideAction(state.eirId, c.id, { hidden: !c.hidden }))}
                className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5">
                {c.hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} {c.hidden ? "أظهر" : "أخفِ"}
              </button>
              <button type="button" onClick={() => { setEditing(c.id); setDraft(c.override_text ?? c.text) }}
                className="rounded-md border border-border px-1.5 py-0.5">عدّل النص</button>
            </div>
          </li>
        ))}
      </ul>
    </details>
  )
}

function PreviewBlock({ state, disabled, run }: { state: GuestLinkAdminState; disabled: boolean; run: Run }) {
  const link = state.link!
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[12.5px] font-semibold text-foreground">معاينة — نفس اللي بيشوفه الضيف</h3>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (confirm("نشر هذه النسخة للضيف؟ بيشوفها أول ما يفتح الرابط.")) run(() => publishGuestLinkAction(state.eirId))
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> {link.published_at ? "إعادة النشر" : "نشر للضيف"}
        </button>
      </div>
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-background p-4">
        <GuestPrepViewPanel
          view={state.preview}
          identity={
            link.questionnaire
              ? {
                  full_name: link.questionnaire.full_name ?? null,
                  honorific: link.questionnaire.honorific ?? null,
                  kunya: link.questionnaire.kunya ?? null,
                  pronunciation_notes: link.questionnaire.pronunciation_notes ?? null,
                }
              : null
          }
          greetingName={link.questionnaire?.kunya || link.guest_display_name}
          suggestions={[]}
          token={null}
          housePhotoSrc={link.has_house_photo ? `/api/admin/guest-links/${state.eirId}/house-photo` : null}
          calendarHref="#"
        />
      </div>
    </div>
  )
}

function SuggestionsInbox({ state, disabled, run }: { state: GuestLinkAdminState; disabled: boolean; run: Run }) {
  if (state.suggestions.length === 0) {
    return <p className="text-muted-foreground">صندوق الاقتراحات: ما فيه اقتراحات من الضيف.</p>
  }
  const typeLabel = { edit: "تعديل على محور", comment: "ملاحظة", new_question: "سؤال مقترح" } as const
  const statusLabel = { new: "جديد", accepted: "مقبول", rejected: "مرفوض" } as const
  return (
    <div className="space-y-2">
      <h3 className="text-[12.5px] font-semibold text-foreground">
        صندوق اقتراحات الضيف ({state.suggestions.filter((s) => s.status === "new").length} جديد)
      </h3>
      <ul className="space-y-2">
        {state.suggestions.map((s) => (
          <li key={s.id} className="rounded-lg border border-border/60 p-2">
            <div className="mb-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              <span>{typeLabel[s.suggestion_type]}</span>
              {s.target_label && <span>· {s.target_label}</span>}
              <span>· {statusLabel[s.status]}</span>
              <span>· {formatDateTime(s.created_at)}</span>
            </div>
            <p className="whitespace-pre-line text-foreground">{s.body}</p>
            {s.status === "new" && (
              <div className="mt-1.5 flex gap-2 text-[11px]">
                <button type="button" disabled={disabled}
                  onClick={() => run(() => decideGuestSuggestionAction(state.eirId, s.id, "accepted"))}
                  className="rounded-md bg-emerald-600/10 px-2 py-0.5 text-emerald-800">قبول</button>
                <button type="button" disabled={disabled}
                  onClick={() => run(() => decideGuestSuggestionAction(state.eirId, s.id, "rejected"))}
                  className="rounded-md bg-rose-500/10 px-2 py-0.5 text-rose-700">رفض</button>
              </div>
            )}
            {s.status === "accepted" && state.prepId && state.hasPrepV2 && (
              <ApplyToPrep
                prepId={state.prepId}
                sections={state.sections}
                defaultSection={s.target_section}
                defaultText={s.body}
                disabled={disabled}
                run={run}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ApplyToPrep({
  prepId,
  sections,
  defaultSection,
  defaultText,
  disabled,
  run,
}: {
  prepId: string
  sections: { kind: SectionKind; label: string }[]
  defaultSection: SectionKind | null
  defaultText: string
  disabled: boolean
  run: Run
}) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<SectionKind>(defaultSection ?? sections[0]?.kind ?? "opening")
  const [text, setText] = useState(defaultText)
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1.5 text-[11px] text-primary underline-offset-2 hover:underline">
        أضف كسؤال في الإعداد…
      </button>
    )
  }
  return (
    <div className="mt-2 space-y-1.5">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={500}
        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12.5px]" />
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <select value={section} onChange={(e) => setSection(e.target.value as SectionKind)}
          className="rounded-md border border-border bg-background px-1.5 py-1">
          {sections.map((s) => (
            <option key={s.kind} value={s.kind}>{s.label}</option>
          ))}
        </select>
        <button type="button" disabled={disabled}
          onClick={() =>
            run(async () => {
              const r = await addGuestQuestionToPrepAction(prepId, section, text)
              return r.ok ? { ok: true, message: r.message } : { ok: false, message: r.message }
            }, () => setOpen(false))
          }
          className="rounded-md bg-primary px-2 py-1 text-primary-foreground">أضف للإعداد</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-2 py-1">إلغاء</button>
      </div>
    </div>
  )
}
