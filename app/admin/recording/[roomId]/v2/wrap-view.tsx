"use client"

/**
 * WrapView — the ENDED mode. The take is done; this is a calm wrap surface:
 * a coverage recap, the CSV export promoted, the pre-written closing options
 * for reference, and a markers recap for hand-off to post.
 */

import { useState } from "react"
import { CheckCircle2, Download, Flag, RotateCcw, Mic, Clapperboard, Check } from "lucide-react"
import type { LiveV2Marker } from "@/lib/recording-v2/load"
import type { PrepV2ClosingOption } from "@/lib/preparation/v2/types"
import { markerStyle, formatHms, formatPrecise } from "./recording-shared"
import { OptionList } from "./cockpit-bits"

export function WrapView({
  roomId,
  durationMs,
  sectionsTotal,
  sectionsDone,
  questionsAsked,
  questionsTotal,
  markers,
  closingOptions,
  takeNumber,
  cameraOffsetMs,
  onSetCameraOffset,
  onReset,
  busy,
}: {
  roomId: string
  durationMs: number
  sectionsTotal: number
  sectionsDone: number
  questionsAsked: number
  questionsTotal: number
  markers: LiveV2Marker[]
  closingOptions: PrepV2ClosingOption[]
  takeNumber: number
  cameraOffsetMs: number | null
  onSetCameraOffset: (ms: number) => Promise<boolean>
  onReset: () => void
  busy: boolean
}) {
  const hasMarkers = markers.length > 0
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" dir="rtl">
      <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-6 text-center">
        <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" />
        <h2 className="mt-2 text-[16px] font-semibold text-emerald-700">انتهى التسجيل</h2>
        <div className="mt-1 font-mono text-[26px] font-bold tabular-nums text-foreground" dir="ltr">
          {formatHms(durationMs)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Metric label="التيك" value={String(takeNumber)} />
        <Metric label="الأقسام" value={`${sectionsDone}/${sectionsTotal}`} />
        <Metric label="الأسئلة المطروحة" value={`${questionsAsked}/${questionsTotal}`} />
        <Metric label="العلامات" value={String(markers.length)} />
      </div>

      <CameraOffsetField
        offsetMs={cameraOffsetMs}
        onSave={onSetCameraOffset}
        disabled={busy}
      />

      <ExportPanel
        roomId={roomId}
        markerCount={markers.length}
        // The two exclusion reasons are counted separately because they need
        // different actions from the user: a missing anchor cannot be fixed
        // after the fact, while "before the camera rolled" is usually just a
        // camera-offset value that needs correcting above.
        noAnchorCount={markers.filter((m) => m.camera_ms == null).length}
        beforeStartCount={markers.filter((m) => m.camera_ms != null && m.camera_ms < 0).length}
        takeNumber={takeNumber}
      />

      {closingOptions.length > 0 && (
        <Panel title="خيارات الختام" icon={<Mic className="h-3.5 w-3.5" />}>
          <OptionList items={closingOptions} />
        </Panel>
      )}

      {hasMarkers && (
        <Panel title="ملخّص العلامات · توقيت الكاميرا" icon={<Flag className="h-3.5 w-3.5" />}>
          <MarkersRecap markers={markers} />
        </Panel>
      )}

      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 px-4 py-2 text-[12.5px] font-medium text-muted-foreground transition hover:bg-background/70 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" /> إعادة ضبط لتسجيل جديد
        </button>
      </div>
    </div>
  )
}

/**
 * Camera-sync correction. Nobody presses "ابدأ التسجيل" on the exact frame the
 * camera rolls, so every export is off by that gap until it is measured once.
 * Entered in seconds (the unit the editor actually measures in), stored in ms.
 */
function CameraOffsetField({
  offsetMs,
  onSave,
  disabled,
}: {
  offsetMs: number | null
  onSave: (ms: number) => Promise<boolean>
  disabled: boolean
}) {
  const [value, setValue] = useState(
    offsetMs == null ? "" : String(Math.round(offsetMs) / 1000),
  )
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle")

  // No anchor row => the take never started, so there is nothing to correct.
  if (offsetMs == null) return null

  const seconds = Number(value)
  const valid = value.trim() === "" || Number.isFinite(seconds)

  async function save() {
    if (!valid) return
    setState("saving")
    const ok = await onSave(Math.round((value.trim() === "" ? 0 : seconds) * 1000))
    setState(ok ? "saved" : "error")
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Clapperboard className="h-3.5 w-3.5" /> فرق توقيت الكاميرا
      </div>
      <p className="mb-2.5 text-[12px] leading-relaxed text-foreground/80">
        كم ثانية دارت الكاميرا <strong className="font-semibold">قبل</strong> ضغطة «ابدأ
        التسجيل»؟ اكتبها مرة واحدة وكل توقيتات التصدير تتصحّح. لو الكاميرا دارت بعد
        الضغطة، اكتب رقماً سالباً.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setState("idle")
          }}
          disabled={disabled || state === "saving"}
          aria-label="فرق توقيت الكاميرا بالثواني"
          className="w-28 rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-[13px] tabular-nums text-foreground disabled:opacity-50"
          dir="ltr"
        />
        <span className="text-[11.5px] text-muted-foreground">ثانية</span>
        <button
          type="button"
          onClick={save}
          disabled={disabled || !valid || state === "saving"}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 px-3.5 py-2 text-[12.5px] font-medium text-foreground transition hover:bg-background/70 disabled:opacity-50"
        >
          {state === "saved" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : null}
          {state === "saving" ? "يحفظ…" : state === "saved" ? "محفوظ" : "حفظ"}
        </button>
        {!valid && <span className="text-[11.5px] text-rose-700">رقم غير صحيح</span>}
        {state === "error" && (
          <span className="text-[11.5px] text-rose-700">تعذّر الحفظ</span>
        )}
      </div>
    </div>
  )
}

/**
 * Two exports, not two choices. Resolve silently discards non-Latin text from an
 * EDL, so the Arabic notes cannot ride along with the timeline positions — the
 * editor imports the EDL for the flags and opens the CSV for what they say. The
 * copy states that plainly so nobody downloads one and assumes it is complete.
 */
function ExportPanel({
  roomId,
  markerCount,
  noAnchorCount,
  beforeStartCount,
  takeNumber,
}: {
  roomId: string
  markerCount: number
  /**
   * Markers with no derivable camera time at all (the take has no anchor). The
   * formatter excludes them — a fabricated 00:00 would plant a false cut at the
   * head of the editor's timeline — and the count came back only in a response
   * header, which a plain `<a href>` download never reads. So the screen used
   * to promise markers the file did not contain.
   */
  noAnchorCount: number
  /**
   * Markers whose camera time is negative, i.e. they land before the camera's
   * first frame. Counted apart from `noAnchorCount` because this one is almost
   * always a wrong camera-offset value, and telling the editor "no anchor" sent
   * them hunting for a missing anchor instead of fixing the number above.
   */
  beforeStartCount: number
  takeNumber: number
}) {
  const base = `/api/admin/recording/${roomId}/markers/export`
  const has = markerCount > 0
  const excluded = noAnchorCount + beforeStartCount
  const edlCount = markerCount - excluded
  const linkCls =
    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition"

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="mb-1 text-[12.5px] font-semibold text-foreground/85">
        {has
          ? `${markerCount} علامة جاهزة للمونتاج — تيك ${takeNumber}`
          : `لا توجد علامات لتصديرها — تيك ${takeNumber}`}
      </div>

      {/* Everything below only makes sense when there is something to export.
          The explainer and both download links used to render unconditionally
          under the "لا توجد علامات" heading — the panel contradicted itself, and
          the links, being disabled only by `pointer-events-none`, were still
          reachable by Tab and would download an empty file on Enter. */}
      {!has ? (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          علّم لحظات على الحلقة أثناء التسجيل، وبتلقى هنا ملفَّي التصدير للمونتاج.
        </p>
      ) : (
        <>
          {excluded > 0 && (
            <p className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-800">
              {edlCount} من {markerCount} في الـ EDL.
              {beforeStartCount > 0 && (
                <>
                  {" "}
                  {beforeStartCount} قبل أول فريم من الكاميرا — راجع «فرق توقيت الكاميرا» فوق.
                </>
              )}
              {noAnchorCount > 0 && (
                <> {noAnchorCount} بلا مرساة توقيت.</>
              )}{" "}
              الكل موجود في الـ CSV.
            </p>
          )}
          <p className="mb-3 text-[11.5px] leading-relaxed text-muted-foreground">
            الملفان يصدّران <strong className="font-semibold">تيك {takeNumber}</strong> فقط.
            نزّل الاثنين: الـ EDL يحطّ العلامات على التايم-لاين في DaVinci Resolve، والـ CSV
            فيه الملاحظات العربية كاملة — لأن Resolve يُسقط العربي من ملفات EDL. كل علامة في
            الـ EDL تحمل رقمها في الـ CSV.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`${base}?format=edl`}
              className={linkCls + " border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20"}
            >
              <Download className="h-4 w-4" /> EDL للتايم-لاين
            </a>
            <a
              href={`${base}?format=csv`}
              className={linkCls + " border-border/50 text-foreground hover:bg-background/70"}
            >
              <Download className="h-4 w-4" /> CSV بالملاحظات
            </a>
          </div>
        </>
      )}
    </div>
  )
}

function MarkersRecap({ markers }: { markers: LiveV2Marker[] }) {
  const groups = new Map<string, LiveV2Marker[]>()
  for (const m of markers) {
    const arr = groups.get(m.marker_type) ?? []
    arr.push(m)
    groups.set(m.marker_type, arr)
  }
  return (
    <div className="space-y-2.5">
      {[...groups.entries()].map(([type, ms]) => {
        const st = markerStyle(type)
        const Icon = st.icon
        // Sorted and displayed on CAMERA time — the same clock the exports use.
        // Showing net time here, directly above two buttons that emit camera
        // time, meant the screen and the file disagreed by the total paused
        // duration.
        const sorted = [...ms].sort(
          (a, b) => (a.camera_ms ?? a.net_recording_ms) - (b.camera_ms ?? b.net_recording_ms),
        )
        return (
          <div key={type}>
            <div className={"mb-1 inline-flex items-center gap-1.5 text-[11.5px] font-medium " + st.text}>
              <Icon className="h-3.5 w-3.5" /> {st.label}
              <span className="text-muted-foreground" dir="ltr">
                ({ms.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sorted.map((m) => (
                <span
                  key={m.id}
                  className={"inline-flex items-center gap-1 rounded-full border border-border/40 px-2 py-0.5 text-[10.5px] " + st.soft}
                >
                  <span className="font-mono tabular-nums text-foreground/70" dir="ltr">
                    {m.camera_ms == null ? "— " : formatPrecise(m.camera_ms)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/50 p-3 text-center">
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[18px] font-semibold tabular-nums" dir="ltr">
        {value}
      </div>
    </div>
  )
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="mb-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}
