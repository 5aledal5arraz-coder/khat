/**
 * UX-7 Phase A — Workspace Transcript tab (server component).
 *
 * Loads the consolidated `studio_analysis_records kind=transcript`
 * payload via `loadTranscriptForEir`, then mounts the virtualized
 * client editor. Always renders something — even when no transcript
 * exists yet — to keep the operator unstuck.
 */

import Link from "next/link"
import { ExternalLink, Mic, Info } from "lucide-react"
import { loadTranscriptForEir } from "@/lib/khat-brain/transcript-loader"
import { TranscriptEditor } from "./transcript-editor-client"
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

export interface TranscriptTabProps {
  eirId: string
  studioSessionId: string | null
  currentPhase: EpisodePhase
}

export async function TranscriptTab({
  eirId,
  studioSessionId,
  currentPhase,
}: TranscriptTabProps) {
  const loaded = await loadTranscriptForEir(eirId)

  // Phase gating — transcript is meaningful only after `recorded`.
  // We still render the editor (operators can paste early); we just
  // surface a hint card when the phase suggests no recording yet.
  const isEarly = !phaseAtLeast(currentPhase, "recorded")

  // Legacy escape hatch — link to the legacy Studio page if a session
  // is linked. Always available alongside the workspace editor.
  const legacyHref = studioSessionId
    ? `/admin/studio/${studioSessionId}`
    : null

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-1.5 text-[14px] font-semibold">
            <Mic className="h-3.5 w-3.5 text-violet-300" />
            النصّ
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            تحرير المقاطع، علامات المتحدّث، والتعليمات. الحفظ تلقائي.
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
          <div className="inline-flex items-center gap-1.5 font-semibold text-amber-200">
            <Info className="h-3 w-3" /> الحلقة لم تُسجَّل بعد
          </div>
          <p className="mt-1 text-foreground/85">
            يمكنك لصق نصّ تجريبي للتحرير المُسبق، لكنّ المعتاد هو فتح هذا
            القسم بعد رفع التسجيل في الاستوديو.
          </p>
        </div>
      )}

      <TranscriptEditor
        eirId={eirId}
        initialDoc={loaded.doc}
        sourceLabel={loaded.source}
        recordStatus={loaded.status}
      />
    </div>
  )
}
