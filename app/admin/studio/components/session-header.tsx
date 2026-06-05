"use client"

import Link from "next/link"
import {
  ExternalLink, Mic, User, Calendar, Clock, Hash,
  FileAudio, HardDrive, CheckCircle2, CircleDot, AlertTriangle,
  Film,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSession, useTranscript, useContent, useChapters, useClips, useWebsitePkg } from "../contexts"
import { formatDuration, formatDate, formatFileSize, InfoRow } from "./shared"
import type { StudioStageStatus } from "../contexts/stage-status"

type PillStatus = StudioStageStatus

const PROGRESS_PILL_DEFS: { key: string; label: string }[] = [
  { key: "transcript", label: "النص" },
  { key: "processing", label: "المعالجة" },
  { key: "ai_output", label: "AI" },
  { key: "chapters", label: "الفصول" },
  { key: "clips", label: "المقاطع" },
  { key: "website", label: "الموقع" },
]

const PILL_STYLES: Record<PillStatus, { bg: string; text: string; dot: string }> = {
  idle: {
    bg: "bg-muted/60",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/30",
  },
  generating: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500 admin-shimmer",
  },
  ready: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  error: {
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    dot: "bg-red-500",
  },
}

export function SessionHeader() {
  const { session } = useSession()
  const { transcriptStatus, processingStatus } = useTranscript()
  const { aiStatus } = useContent()
  const { chaptersStatus } = useChapters()
  const { clipsStatus } = useClips()
  const { websitePkg, websitePkgStatus } = useWebsitePkg()
  const isAudio = session.source === "audio"
  const linkedEpisodeId = websitePkg?.linked_episode_id || null

  // All inputs are already canonical StudioStageStatus
  const pillStatuses: PillStatus[] = [
    transcriptStatus,
    processingStatus,
    aiStatus,
    chaptersStatus,
    clipsStatus,
    websitePkgStatus,
  ]
  const readyCount = pillStatuses.filter((s) => s === "ready").length
  const hasError = pillStatuses.some((s) => s === "error")
  const isGenerating = pillStatuses.some((s) => s === "generating")
  const allReady = readyCount === PROGRESS_PILL_DEFS.length

  return (
    <div className="overflow-hidden rounded-xl border border-border/30 bg-card/50 shadow-sm">
      <div className="flex flex-col md:flex-row">
        {/* Thumbnail / Audio icon */}
        {isAudio ? (
          <div className="shrink-0 md:w-52 flex items-center justify-center bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-950/40 dark:to-purple-900/20">
            <div className="py-8 flex flex-col items-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-200/50 dark:bg-purple-900/50">
                <Mic className="h-7 w-7 text-purple-500" />
              </div>
              <span className="text-xs text-purple-500/80 font-medium">ملف صوتي</span>
            </div>
          </div>
        ) : session.thumbnail_url ? (
          <div className="shrink-0 md:w-52">
            {/* eslint-disable-next-line @next/next/no-img-element -- Admin-only studio thumbnail with dynamic external YouTube URL */}
            <img
              src={session.thumbnail_url}
              alt={session.video_title || ""}
              className="aspect-video w-full object-cover md:h-full md:aspect-auto"
            />
          </div>
        ) : null}

        {/* Info */}
        <div className="flex-1 p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-base font-bold leading-tight line-clamp-2 tracking-tight">
              {session.video_title || "بدون عنوان"}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              {/* Overall status badge */}
              {allReady ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  مكتمل
                </span>
              ) : hasError ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  يحتاج مراجعة
                </span>
              ) : isGenerating ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  <CircleDot className="h-3.5 w-3.5 admin-shimmer" />
                  قيد المعالجة
                </span>
              ) : readyCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-3 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                  {readyCount}/{PROGRESS_PILL_DEFS.length}
                </span>
              ) : null}
              {linkedEpisodeId && (
                <Link
                  href={`/admin/episodes/${linkedEpisodeId}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="فتح الحلقة المرتبطة"
                >
                  <Film className="h-4 w-4" />
                </Link>
              )}
              {!isAudio && session.youtube_url && (
                <a
                  href={session.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="فتح في يوتيوب"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {isAudio ? (
              <>
                <InfoRow icon={FileAudio} label="اسم الملف" value={session.audio_filename} />
                <InfoRow
                  icon={HardDrive}
                  label="حجم الملف"
                  value={session.audio_file_size != null ? formatFileSize(session.audio_file_size) : null}
                />
              </>
            ) : (
              <>
                <InfoRow icon={User} label="القناة" value={session.channel_title} />
                <InfoRow
                  icon={Calendar}
                  label="تاريخ النشر"
                  value={session.published_at ? formatDate(session.published_at) : null}
                />
              </>
            )}
            <InfoRow
              icon={Clock}
              label="المدة"
              value={session.duration_seconds != null ? formatDuration(session.duration_seconds) : null}
            />
            {!isAudio && (
              <InfoRow icon={Hash} label="معرّف الفيديو" value={session.video_id} mono />
            )}
          </div>

          {/* Progress pills */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/30">
            <span className="text-[11px] text-muted-foreground/70 ml-1 font-medium">التقدم</span>
            {PROGRESS_PILL_DEFS.map((pill, i) => {
              const status = pillStatuses[i]
              const styles = PILL_STYLES[status]
              return (
                <span
                  key={pill.key}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-200",
                    styles.bg, styles.text
                  )}
                >
                  <span className={cn("inline-block h-1.5 w-1.5 rounded-full", styles.dot)} />
                  {pill.label}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
