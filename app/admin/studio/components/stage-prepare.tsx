"use client"

import {
  FileText, Wand2, Layers, AudioWaveform, Scissors,
} from "lucide-react"
import { useSession, useTranscript, useAudio } from "../contexts"
import { AccordionSection } from "./accordion-section"
import { TranscriptContent } from "./transcript-content"
import { AiProcessingContent } from "./ai-processing-content"
import { AudioToolsContent } from "./audio-tools"
import { EditSuggestionsContent } from "./edit-suggestions"

// ---------------------------------------------------------------------------
// Stage 1: التحضير (Prepare)
// ---------------------------------------------------------------------------

export function StagePrepare() {
  const { session } = useSession()
  const { transcriptStatus, processingStatus } = useTranscript()
  const { audioIntroStatus, editSuggestionsStatus } = useAudio()

  const isAudio = session.source === "audio"

  // All inputs are already canonical StudioStageStatus — no mapping needed
  const transcriptTabStatus = transcriptStatus
  const processingTabStatus = processingStatus
  const audioToolsTabStatus = audioIntroStatus
  const editSuggestionsTabStatus = editSuggestionsStatus

  const statuses = [transcriptTabStatus, processingTabStatus]
  if (isAudio) {
    statuses.push(audioToolsTabStatus)
    statuses.push(editSuggestionsTabStatus)
  }
  const readyCount = statuses.filter(s => s === "ready").length
  const totalCount = statuses.length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40">
          <Layers className="h-4 w-4 text-blue-700 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-[13px] font-semibold">التحضير</h2>
          <span className="text-[11px] text-muted-foreground">{readyCount}/{totalCount} مكتمل</span>
        </div>
      </div>

      <div className="space-y-2">
        <AccordionSection
          icon={FileText}
          iconColor="text-blue-700"
          title="النص التلقائي"
          status={transcriptTabStatus}
          defaultOpen={transcriptTabStatus !== "ready"}
        >
          <TranscriptContent />
        </AccordionSection>

        <AccordionSection
          icon={Wand2}
          iconColor="text-violet-700"
          title="معالجة النص بالذكاء الاصطناعي"
          status={processingTabStatus}
          defaultOpen={transcriptTabStatus === "ready" && processingTabStatus !== "ready"}
        >
          <AiProcessingContent />
        </AccordionSection>

        {isAudio && (
          <>
            <AccordionSection
              icon={AudioWaveform}
              iconColor="text-orange-700"
              title="أدوات الصوت"
              status={audioToolsTabStatus}
              defaultOpen={transcriptTabStatus === "ready" && audioToolsTabStatus !== "ready"}
            >
              <AudioToolsContent />
            </AccordionSection>

            <AccordionSection
              icon={Scissors}
              iconColor="text-rose-700"
              title="اقتراحات القص والتعديل"
              status={editSuggestionsTabStatus}
              defaultOpen={editSuggestionsTabStatus === "ready"}
            >
              <EditSuggestionsContent />
            </AccordionSection>
          </>
        )}
      </div>
    </div>
  )
}
