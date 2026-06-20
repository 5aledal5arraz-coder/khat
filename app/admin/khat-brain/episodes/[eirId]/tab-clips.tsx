/**
 * UX-9 — Workspace Clips tab (server component).
 *
 * Mounts the Clip Intelligence editor. Loads the clip doc + a
 * snapshot of transcript and chapters so the client can render
 * cross-linked context (segment-text previews, chapter chips) with
 * no second fetch.
 */

import Link from "next/link"
import { ExternalLink, Film, Info } from "lucide-react"
import { loadClipsForEir } from "@/lib/khat-brain/clip-loader"
import { ClipEditor } from "./clip-editor-client"
import type { EpisodePhase } from "@/lib/db/schema/eir"

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

export interface ClipsTabProps {
  eirId: string
  studioSessionId: string | null
  currentPhase: EpisodePhase
}

export async function ClipsTab({
  eirId,
  studioSessionId,
  currentPhase,
}: ClipsTabProps) {
  const loaded = await loadClipsForEir(eirId)
  const isEarly = !phaseAtLeast(currentPhase, "recorded")
  const legacyHref = studioSessionId ? `/admin/studio/${studioSessionId}` : null

  // Project the transcript + chapters onto a small bundle the client
  // can use for previews without re-fetching.
  const transcriptCtx = loaded.transcript
    ? {
        version: loaded.transcript.version,
        segments: loaded.transcript.segments.map((s) => ({
          id: s.id,
          text: s.text.slice(0, 220),
          start_seconds: s.start_seconds,
          end_seconds: s.end_seconds,
        })),
      }
    : null
  const chaptersCtx = loaded.chapters
    ? loaded.chapters.chapters.map((c) => ({
        id: c.id,
        title: c.title,
        start_seconds: c.start_seconds,
        end_seconds: c.end_seconds,
      }))
    : []

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-1.5 text-[14px] font-semibold">
            <Film className="h-3.5 w-3.5 text-violet-700" />
            المقاطع
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            استخرج اللحظات الأكثر تأثيراً من الحلقة. كلّ مقطع يحمل خطّاف،
            توقيع عاطفي، وخطّة منصّة. الحفظ تلقائي.
          </p>
        </div>
        {legacyHref && (
          <Link
            href={legacyHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border/40 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-background/60"
            title="الواجهة المتقدمة في الاستوديو القديم"
          >
            الصفحة المتقدمة <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {isEarly && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-[12px]">
          <div className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
            <Info className="h-3 w-3" /> الحلقة لم تُسجَّل بعد
          </div>
          <p className="mt-1 text-foreground/85">
            تستطيع التخطيط مسبقاً، لكنّ الجودة الأفضل تأتي بعد رفع التسجيل
            وضبط النصّ والفصول.
          </p>
        </div>
      )}

      <ClipEditor
        eirId={eirId}
        initialDoc={loaded.doc}
        studioSessionId={studioSessionId}
        transcriptContext={transcriptCtx}
        chaptersContext={chaptersCtx}
      />
    </div>
  )
}
