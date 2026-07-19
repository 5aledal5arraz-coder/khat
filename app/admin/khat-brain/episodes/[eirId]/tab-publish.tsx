/**
 * UX-3b → UX-4 → UX-10 — Publish tab.
 *
 * UX-10 made this tab the editorial-gate / distribution-planning /
 * website-knowledge-packaging surface. It now hosts:
 *   1. The new <PublishPackageEditor> (UX-10 centerpiece) — readiness
 *      dashboard, narrative section, SEO, YouTube/Newsletter/Social
 *      packages, sponsor + release strategy, validation, AI suggest.
 *   2. The pre-UX-10 push-to-episode surface, kept intact below as
 *      "Stage 1 — Push to website episode". The PushButton component
 *      and its smoke contracts are unchanged.
 */

import Link from "next/link"
import {
  Send,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react"
import { formatDateTime } from "@/lib/shared/formatters"
import type {
  WorkspaceEpisodeSummary,
  WorkspaceStudioSummary,
} from "@/lib/khat-brain/workspace-tabs"
import type { EpisodePhase } from "@/lib/db/schema/eir"
import type { PushPreview } from "@/lib/khat-brain/push-preview"
import { PushButton } from "./push-button"
import { loadPublishPackageForEir } from "@/lib/khat-brain/publish-loader"
import { PublishPackageEditor } from "./publish-editor-client"
import { studioDeepLink } from "./studio-href"

export async function PublishTab({
  episode,
  studio,
  currentPhase,
  eirId,
  pushPreview,
}: {
  episode: WorkspaceEpisodeSummary | null
  studio: WorkspaceStudioSummary
  currentPhase: EpisodePhase
  eirId: string
  pushPreview: PushPreview
}) {
  // UX-10 — load the publish package (always renders something).
  const pkg = await loadPublishPackageForEir(eirId)
  const editor = (
    <PublishPackageEditor
      eirId={eirId}
      initialDoc={pkg.doc}
      siblingSlugs={pkg.siblingSlugs}
      context={{
        transcript: !!pkg.transcript,
        transcriptVersion: pkg.latestTranscriptVersion,
        chapters: pkg.chapters?.chapters.length ?? 0,
        clips: pkg.clips?.clips.length ?? 0,
      }}
    />
  )
  // Episode exists — show the full publish summary.
  if (episode) {
    const isPublished = episode.status === "published"
    return (
      <div className="space-y-4">
        {/* UX-10 — new publish package editor as the editorial gate */}
        {editor}

        {/* Episode summary (legacy push surface — UX-4 push stays intact) */}
        <div className="rounded-2xl border border-border/40 bg-card/30 p-4">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10.5px] font-medium text-primary">
            <Send className="h-3 w-3" /> الحلقة المربوطة
          </div>
          <h3 className="mt-1 text-[14px] font-semibold leading-tight">
            {episode.title}
          </h3>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wider">
              {episode.status ?? "—"}
            </span>
            <span dir="ltr">{episode.slug}</span>
            {episode.duration_minutes !== null && (
              <span dir="ltr">{episode.duration_minutes}m</span>
            )}
            {episode.release_date && (
              <span dir="ltr">{episode.release_date.slice(0, 10)}</span>
            )}
            <span dir="ltr">
              تحديث {formatDateTime(episode.updated_at)}
            </span>
          </div>
          {/* UX-5.5b — last-action trust strip */}
          {studio.push_log.length > 0 && studio.push_log[0].pushed_at && (
            <div
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-background/40 px-2 py-0.5 text-[10.5px] text-muted-foreground"
              dir="ltr"
              data-last-push-strip
            >
              <Clock className="h-3 w-3" />
              آخر دفعة {formatDateTime(studio.push_log[0].pushed_at)} ·{" "}
              {studio.push_log[0].pushed_fields.length} حقل
            </div>
          )}

          {/* Phase B.4 — Push owns the primary slot. Auxiliary links
              (YouTube view, legacy episode editor, full studio) drop to
              a faded secondary row so they never compete visually with
              the destructive action. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {studio.session ? (
              <PushButton eirId={eirId} preview={pushPreview} />
            ) : (
              <PushButton
                eirId={eirId}
                preview={pushPreview}
                disabled
                disabledReason="لا توجد جلسة استديو لدفع حزمتها."
              />
            )}
          </div>
          <div
            className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground"
            data-secondary-links
          >
            {episode.youtube_url && (
              <a
                href={episode.youtube_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-muted-foreground"
              >
                YouTube <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            {episode.youtube_url && <span>·</span>}
            <Link
              href={`/admin/episodes/${episode.id}?legacy=1`}
              className="inline-flex items-center gap-1 hover:text-muted-foreground"
            >
              صفحة الحلقة الكاملة <ExternalLink className="h-2.5 w-2.5" />
            </Link>
            {studio.session && (
              <>
                <span>·</span>
                <Link
                  href={studioDeepLink(studio.session.video_id)}
                  className="inline-flex items-center gap-1 hover:text-muted-foreground"
                >
                  الاستديو الكامل <ExternalLink className="h-2.5 w-2.5" />
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Push log */}
        {studio.push_log.length > 0 ? (
          <div className="rounded-2xl border border-border/40 bg-card/30 p-4">
            <div className="mb-2 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3" /> سجلّ الدفع
            </div>
            <ul className="space-y-1.5 text-[11.5px]">
              {studio.push_log.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/30 bg-background/30 px-2 py-1"
                >
                  <span className="text-foreground/85" dir="ltr">
                    {p.episode_title}
                  </span>
                  <span className="text-muted-foreground/80" dir="ltr">
                    {p.pushed_fields.join(", ")}
                  </span>
                  <span className="text-muted-foreground" dir="ltr">
                    {p.pushed_at ? formatDateTime(p.pushed_at) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/40 bg-background/20 p-3 text-center text-[11.5px] text-muted-foreground">
            لم تُسجَّل عمليات دفع بعد لهذه الحلقة.
          </div>
        )}

        {!isPublished && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" /> الحلقة غير منشورة
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-foreground/85">
              حالة الحلقة الحالية: <span dir="ltr">{episode.status ?? "—"}</span>.
              عند الجاهزية اضبط الحالة في صفحة الحلقة، ثم ادفع الحزمة من
              الاستديو لإكمال السلسلة.
            </p>
          </div>
        )}
      </div>
    )
  }

  // No episode row yet, but a studio session exists — guide the operator.
  if (studio.session) {
    return (
      <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-6 text-center">
        <Send className="mx-auto h-6 w-6 text-violet-700" />
        <h3 className="mt-2 text-[13px] font-semibold">جلسة استديو موجودة بدون حلقة</h3>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-foreground/85">
          الحزمة جاهزة في الاستديو، لكن لا يوجد سجلّ حلقة مربوط بهذا EIR.
          من الاستديو، أنشئ/اربط حلقة ثم ادفع الحزمة.
        </p>
        <Link
          href={studioDeepLink(studio.session.video_id)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-700 hover:bg-violet-500/20"
        >
          فتح الاستوديو <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    )
  }

  // Nothing yet — show the editor anyway (operator can package early).
  return (
    <div className="space-y-4">
      {editor}
      <div className="rounded-2xl border border-border/40 bg-card/20 p-6 text-center">
        <Send className="mx-auto h-6 w-6 text-muted-foreground" />
        <h3 className="mt-2 text-[13px] font-semibold">لا توجد حلقة منشورة بعد</h3>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
          ستظهر هنا تفاصيل الحلقة فور دفع الحزمة من الاستديو.
        </p>
        <p className="mt-3 text-[10.5px] text-muted-foreground">
          المرحلة الحالية للـ EIR: <span dir="ltr">{currentPhase}</span>
        </p>
        {phaseAtLeast(currentPhase, "ready_to_publish") && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-700">
            <AlertTriangle className="h-3 w-3" /> المرحلة بعد «جاهزة للنشر» —
            الحلقة المربوطة مفقودة
          </div>
        )}
      </div>
    </div>
  )
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

void CheckCircle2
