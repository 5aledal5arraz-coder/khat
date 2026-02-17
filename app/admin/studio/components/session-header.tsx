"use client"

import {
  ExternalLink, Mic, User, Calendar, Clock, Hash,
  FileAudio, HardDrive,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useStudioSession } from "./studio-context"
import { formatDuration, formatDate, formatFileSize, InfoRow } from "./shared"

const PROGRESS_PILLS: {
  key: string
  label: string
  statusKey: "transcriptStatus" | "aiStatus" | "chaptersStatus" | "clipsStatus" | "websitePkgStatus"
}[] = [
  { key: "transcript", label: "النص", statusKey: "transcriptStatus" },
  { key: "ai_output", label: "AI", statusKey: "aiStatus" },
  { key: "chapters", label: "الفصول", statusKey: "chaptersStatus" },
  { key: "clips", label: "المقاطع", statusKey: "clipsStatus" },
  { key: "website", label: "الموقع", statusKey: "websitePkgStatus" },
]

function mapStatus(raw: string): "idle" | "generating" | "ready" | "error" {
  if (raw === "ready") return "ready"
  if (raw === "generating" || raw === "fetching" || raw === "processing") return "generating"
  if (raw === "error") return "error"
  return "idle"
}

export function SessionHeader() {
  const ctx = useStudioSession()
  const { session } = ctx
  const isAudio = session.source === "audio"

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col md:flex-row">
        {/* Thumbnail / Audio icon */}
        {isAudio ? (
          <div className="shrink-0 md:w-48 flex items-center justify-center bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-950/40 dark:to-purple-900/20">
            <div className="py-6 flex flex-col items-center gap-1.5">
              <Mic className="h-10 w-10 text-purple-400" />
              <span className="text-xs text-purple-500 font-medium">ملف صوتي</span>
            </div>
          </div>
        ) : session.thumbnail_url ? (
          <div className="shrink-0 md:w-48">
            <img
              src={session.thumbnail_url}
              alt={session.video_title || ""}
              className="aspect-video w-full object-cover md:h-full md:aspect-auto"
            />
          </div>
        ) : null}

        {/* Info */}
        <div className="flex-1 p-4 space-y-2">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-base font-bold leading-tight line-clamp-2">
              {session.video_title || "بدون عنوان"}
            </h2>
            {!isAudio && session.youtube_url && (
              <a
                href={session.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="فتح في يوتيوب"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
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
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground ml-1">التقدم:</span>
            {PROGRESS_PILLS.map((pill) => {
              const rawStatus = ctx[pill.statusKey] as string
              const status = mapStatus(rawStatus)
              return (
                <span
                  key={pill.key}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    status === "idle" && "bg-muted text-muted-foreground",
                    status === "generating" && "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
                    status === "ready" && "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
                    status === "error" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      status === "idle" && "bg-muted-foreground/40",
                      status === "generating" && "bg-yellow-500 animate-pulse",
                      status === "ready" && "bg-green-500",
                      status === "error" && "bg-red-500"
                    )}
                  />
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
