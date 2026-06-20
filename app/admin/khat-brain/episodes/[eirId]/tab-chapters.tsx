/**
 * UX-8 Phase B — Workspace Chapters tab (server component).
 *
 * Loads `studio_analysis_records kind=chapters` (with the latest
 * transcript record id + version stamped onto the doc), then mounts
 * the client editor. Renders an empty doc when no row exists yet so
 * the operator can author chapters from scratch.
 */

import Link from "next/link"
import { ExternalLink, ListOrdered, Info } from "lucide-react"
import { loadChaptersForEir } from "@/lib/khat-brain/chapter-loader"
import { ChapterEditor } from "./chapter-editor-client"
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

export interface ChaptersTabProps {
  eirId: string
  studioSessionId: string | null
  currentPhase: EpisodePhase
}

export async function ChaptersTab({
  eirId,
  studioSessionId,
  currentPhase,
}: ChaptersTabProps) {
  const loaded = await loadChaptersForEir(eirId)
  const isEarly = !phaseAtLeast(currentPhase, "recorded")
  const legacyHref = studioSessionId ? `/admin/studio/${studioSessionId}` : null

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-1.5 text-[14px] font-semibold">
            <ListOrdered className="h-3.5 w-3.5 text-violet-700" />
            الفصول
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            الفصول تُمنح للمستمعين تنقّلاً ذكياً داخل الحلقة. التعديل تلقائي.
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
            يمكنك تخطيط الفصول مسبقاً، لكن الطبيعي هو الفهرسة بعد رفع التسجيل.
          </p>
        </div>
      )}

      <ChapterEditor
        eirId={eirId}
        initialDoc={loaded.doc}
        studioSessionId={studioSessionId}
      />
    </div>
  )
}
