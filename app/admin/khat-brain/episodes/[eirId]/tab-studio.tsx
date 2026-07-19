/**
 * UX-3b — Studio tab.
 *
 * Pragmatic summary view (NOT a full studio re-mount). Shows:
 *   - session row meta when present
 *   - 6-card grid for the major output kinds (transcript, chapters,
 *     clips, website_package, deep_analysis, guest_intelligence) with
 *     status, last-generated time, and an "open in legacy Studio" link
 *     for editing
 *   - markers strip (unified quick-marker taxonomy — clip / quote /
 *     highlight / cut / retake / tech_issue / break_start / break_end /
 *     chapter) rendered via the shared markerStyle() when room is linked
 *   - push-log preview
 *   - "Open full Studio" fallback link
 *   - empty state when no session yet, with explicit recording-required
 *     guidance
 */

import Link from "next/link"
import {
  Mic,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  Star,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react"
import { markerStyle } from "@/app/admin/recording/[roomId]/v2/recording-shared"
import type {
  WorkspaceStudioSummary,
  WorkspaceMarker,
} from "@/lib/khat-brain/workspace-tabs"
import type { EpisodePhase } from "@/lib/db/schema/eir"
import { formatDateTime } from "@/lib/shared/formatters"
import { StudioQuickEdit } from "./studio-quick-edit"
import { studioDeepLink } from "./studio-href"

const KIND_LABEL_AR: Record<string, string> = {
  transcript: "النصّ المنسوخ",
  chapters: "الفصول",
  clips: "المقاطع",
  website_package: "حزمة الموقع",
  deep_analysis: "تحليل عميق",
  guest_intelligence: "ذكاء الضيف",
}

const PHASE_ORDER: EpisodePhase[] = [
  "idea",
  "guest_discovery",
  "guest_assigned",
  "approved",
  "researching",
  "prepared",
  "ready_to_record",
  "recording",
  "recorded",
  "producing",
  "ready_to_publish",
  "published",
  "analyzing",
  "learned",
  "archived",
]
function phaseAtLeast(actual: EpisodePhase, threshold: EpisodePhase): boolean {
  return PHASE_ORDER.indexOf(actual) >= PHASE_ORDER.indexOf(threshold)
}

export function StudioTab({
  eirId,
  studio,
  markers,
  currentPhase,
}: {
  eirId: string
  studio: WorkspaceStudioSummary
  markers: WorkspaceMarker[]
  currentPhase: EpisodePhase
}) {
  // Recording must be done before Studio is meaningful.
  if (!studio.session && !phaseAtLeast(currentPhase, "recorded")) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
        <Mic className="mx-auto h-6 w-6 text-amber-700" />
        <h3 className="mt-2 text-[13px] font-semibold">التسجيل مطلوب قبل الاستوديو</h3>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-foreground/85">
          ستتاح أدوات الاستوديو فور إنهاء التسجيل. حالياً المرحلة: «{currentPhase}».
        </p>
        <Link
          href={`/admin/khat-brain/episodes/${eirId}?tab=recording`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-700 hover:bg-violet-500/20"
        >
          الانتقال إلى التسجيل <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    )
  }

  // No session row yet — surface a CTA.
  if (!studio.session) {
    return (
      <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-6 text-center">
        <Mic className="mx-auto h-6 w-6 text-violet-700" />
        <h3 className="mt-2 text-[13px] font-semibold">لا توجد جلسة استديو بعد</h3>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-foreground/85">
          أنشئ جلسة من صفحة الاستديو لربط النصّ والفصول والمقاطع بهذه
          الحلقة. سيُربط المسار تلقائياً بمعرّف EIR.
        </p>
        <Link
          href="/admin/studio"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-700 hover:bg-violet-500/20"
        >
          فتح صفحة الاستديو <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    )
  }

  // Deep-link to the full studio workspace (`?video=` — there is no
  // per-session studio route). Falls back to the studio list for
  // audio-upload sessions that have no video id.
  const studioHref = studioDeepLink(studio.session.video_id)

  return (
    <div className="space-y-4">
      {/* Session meta + open-legacy link */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/40 bg-card/30 p-3 text-[11.5px]">
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground" dir="ltr">
            session{" "}
            <span className="text-foreground">{studio.session.id.slice(0, 8)}</span>
            {studio.session.video_title && (
              <span className="ms-2 text-foreground/85">
                {studio.session.video_title.slice(0, 60)}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-muted-foreground" dir="ltr">
            status: {studio.session.status} · source: {studio.session.source}
            {studio.session.duration_seconds &&
              ` · ${Math.round(studio.session.duration_seconds / 60)}m`}
          </div>
        </div>
        <Link
          href={studioHref}
          className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-muted-foreground"
          data-legacy-link
        >
          <ExternalLink className="h-2.5 w-2.5" /> فتح صفحة الاستوديو
        </Link>
      </div>

      {/* UX-5.2 — workspace-native quick edit for the high-traffic
          website-package fields. Renders only when a package exists. */}
      <StudioQuickEdit eirId={eirId} studio={studio} />

      {/* Output status grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {studio.outputs.map((o) => (
          <OutputCard key={o.kind} output={o} studioHref={studioHref} />
        ))}
      </div>

      {/* Markers strip */}
      {markers.length > 0 && (
        <MarkersStrip markers={markers} />
      )}

      {/* Push log */}
      {studio.push_log.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card/30 p-4">
          <div className="mb-2 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" /> سجلّ الدفع
          </div>
          <ul className="space-y-1.5 text-[11.5px]">
            {studio.push_log.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-background/30 px-2 py-1"
              >
                <span className="truncate text-foreground/85">
                  {p.episode_title}
                </span>
                <span className="text-muted-foreground" dir="ltr">
                  {p.pushed_fields.slice(0, 3).join(", ")}
                  {p.pushed_fields.length > 3 && "…"}
                </span>
                <span className="text-muted-foreground" dir="ltr">
                  {p.pushed_at ? formatDateTime(p.pushed_at) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Output status card ──────────────────────────────────────────────

function OutputCard({
  output,
  studioHref,
}: {
  output: WorkspaceStudioSummary["outputs"][number]
  studioHref: string
}) {
  const tone = toneFor(output.status)
  const Icon = iconFor(output.status)
  return (
    <div className={"rounded-2xl border p-3 " + tone.frame}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold">
          {KIND_LABEL_AR[output.kind] ?? output.kind}
        </div>
        <span className={"inline-flex items-center gap-1 text-[10.5px] " + tone.text}>
          <Icon className="h-3 w-3" /> {output.status}
        </span>
      </div>
      <div className="text-[10.5px] text-muted-foreground" dir="ltr">
        {output.generated_at ? formatDateTime(output.generated_at) : "—"}
      </div>
      {output.error && (
        <div className="mt-1 text-[10.5px] text-rose-700" dir="ltr">
          {output.error.slice(0, 80)}
        </div>
      )}
      <Link
        href={studioHref}
        className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-violet-700 hover:underline"
      >
        فتح في الاستديو <ExternalLink className="h-2.5 w-2.5" />
      </Link>
    </div>
  )
}

function toneFor(status: string) {
  if (status === "ready") {
    return {
      frame: "border-emerald-500/30 bg-emerald-500/5",
      text: "text-emerald-700",
    }
  }
  if (status === "generating" || status === "pending") {
    return {
      frame: "border-amber-500/30 bg-amber-500/5",
      text: "text-amber-700",
    }
  }
  if (status === "error") {
    return {
      frame: "border-rose-500/30 bg-rose-500/5",
      text: "text-rose-700",
    }
  }
  return {
    frame: "border-border/40 bg-card/20",
    text: "text-muted-foreground",
  }
}
function iconFor(status: string) {
  if (status === "ready") return CheckCircle2
  if (status === "generating" || status === "pending") return Clock
  if (status === "error") return XCircle
  if (status === "missing") return AlertTriangle
  return Clock
}

// ─── Markers strip ────────────────────────────────────────────────────

function MarkersStrip({ markers }: { markers: WorkspaceMarker[] }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/30 p-3">
      <div className="mb-2 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        <Star className="h-3 w-3" /> علامات التسجيل ({markers.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {markers.map((m) => {
          const st = markerStyle(m.marker_type)
          const Icon = st.icon
          return (
            <span
              key={m.id}
              className={"inline-flex items-center gap-1 rounded-full border border-border/40 px-2 py-0.5 text-[10.5px] " + st.soft}
              title={m.section_key ? `section: ${m.section_key}` : undefined}
            >
              <Icon className={"h-3 w-3 " + st.text} />
              <span className={"font-medium " + st.text}>{st.label}</span>
              <span className="font-mono text-foreground/85" dir="ltr">
                {formatHms(m.recording_ms)}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function formatHms(ms: number): string {
  const s = Math.floor(ms / 1000)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`
}
function pad(n: number) {
  return n.toString().padStart(2, "0")
}
