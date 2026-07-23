"use client"

import { Loader2, Lock } from "lucide-react"
import { useSession, useEpisodeReview } from "../contexts"
// Pure helper imported directly — the "@/lib/studio" barrel pulls db (pg) into
// the client bundle (see studio-client.tsx).
import { isReviewApproved } from "@/lib/studio/project-stepper"
import { SessionHeader } from "./session-header"
import { GenerateAllBar } from "./generate-all-bar"
import { StagePrepare } from "./stage-prepare"
import { StageContent } from "./stage-content"
import { StagePublish } from "./stage-publish"
import { StageReview } from "./stage-review"

/**
 * Studio active-session body. Lives INSIDE StudioSessionProvider so it can
 * read the review context and decide which journey to render:
 *
 *   - raw audio (Phase 1)          → the episode-map flow (StagePrepare).
 *   - edited cut of a project      → the Phase-2 review + approval, and the
 *     editorial pipeline (Phase 3) ONLY once the review is approved. Before
 *     approval Phase 3 is a locked notice, so approval visibly "opens" it.
 *   - everything else (YouTube /   → the existing full pipeline, unchanged.
 *     legacy / standalone edited)
 */
export function SessionBody() {
  const { session } = useSession()
  const { hydrated, isProjectLinked, project } = useEpisodeReview()

  const isRawMap =
    session.source === "audio" && session.audio_stage === "raw"

  // Phase 1 — the raw time-map flow. StagePrepare renders only the map.
  if (isRawMap) {
    return (
      <div className="space-y-5">
        <SessionHeader />
        <StagePrepare />
      </div>
    )
  }

  const isEditedAudio =
    session.source === "audio" && session.audio_stage === "edited"

  // Edited audio: wait for the project hydration before deciding, so a
  // project-linked cut never flashes the ungated pipeline first.
  if (isEditedAudio && !hydrated) {
    return (
      <div className="space-y-5">
        <SessionHeader />
        <div className="flex items-center justify-center rounded-2xl border border-border/40 bg-card/50 py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Phase 2/3 — the edited cut of a linked project.
  if (isEditedAudio && isProjectLinked && project) {
    const gateOpen = isReviewApproved(project.state)
    return (
      <div className="space-y-5">
        <SessionHeader />
        <StageReview />
        {gateOpen ? (
          <>
            <GenerateAllBar />
            <StagePrepare />
            <StageContent />
            <StagePublish />
          </>
        ) : (
          <LockedPhaseThree />
        )}
      </div>
    )
  }

  // Default — YouTube / legacy / standalone edited upload: unchanged pipeline.
  return (
    <div className="space-y-5">
      <SessionHeader />
      <GenerateAllBar />
      <StagePrepare />
      <StageContent />
      <StagePublish />
    </div>
  )
}

function LockedPhaseThree() {
  return (
    <div className="rounded-2xl border border-border/40 bg-muted/30 p-6 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-[13px] font-semibold text-foreground">
        المرحلة ٣ (حزمة النشر) مقفلة
      </h3>
      <p className="mx-auto mt-1.5 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">
        شغّل مراجعة المونتاج أعلاه واعتمدها أولاً — عندها يُفتح توليد النص والفصول
        والمقاطع وحزمة النشر.
      </p>
    </div>
  )
}
