"use client"

import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import {
  Loader2, Search, AlertCircle,
  Image as ImageIcon, Trash2, Mic, Upload, FileAudio, Scissors,
  ChevronLeft, ChevronDown,
  CheckCircle2, CircleDot, Circle, ArrowLeft,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, getYouTubeId } from "@/lib/utils"
import type { StudioSession, StudioAudioStage } from "@/types/database"
import type { Episode } from "@/types/database"
import type { AiStatus } from "@/lib/studio"
import { formatFileSize } from "./components/shared"
import { StudioSessionProvider } from "./contexts"
import { SessionBody } from "./components/session-body"
import { AudioStageRadio } from "./components/audio-stage-radio"
// Import the PURE derivation directly — NOT from the "@/lib/studio" barrel,
// which re-exports db-backed modules (pg) that must never enter the client bundle.
import { sessionPhaseInfo } from "@/lib/studio/project-stepper"
import type { StudioProjectState } from "@/lib/db/schema/studio-projects"

interface StudioClientProps {
  initialSessions: StudioSession[]
  episodes: Episode[]
  enrichedEpisodeIds: string[]
  aiStatuses: Record<string, AiStatus>
  /** session id → its linked project's state (raw + edited both mapped in). */
  projectsBySession: Record<string, StudioProjectState>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtEpDuration(minutes: number): string {
  if (!minutes) return ""
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} ساعة`
  return `${m} دقيقة`
}

// ---------------------------------------------------------------------------
// AI Status Badge — redesigned with better colors
// ---------------------------------------------------------------------------

const AI_STATUS_CONFIG: Record<AiStatus, { label: string; icon: typeof Circle; iconClass: string; bg: string; text: string }> = {
  ready: {
    label: "جاهز للمعالجة",
    icon: Circle,
    iconClass: "text-muted-foreground",
    bg: "bg-muted/60",
    text: "text-muted-foreground",
  },
  processing: {
    label: "قيد المعالجة",
    icon: CircleDot,
    iconClass: "text-blue-700 admin-shimmer",
    bg: "bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-400",
  },
  completed: {
    label: "مكتمل",
    icon: CheckCircle2,
    iconClass: "text-emerald-700",
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
  },
}

function AiStatusBadge({ status }: { status: AiStatus }) {
  const config = AI_STATUS_CONFIG[status]
  const Icon = config.icon
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-200", config.bg, config.text)}>
      <Icon className={cn("h-3 w-3", config.iconClass)} />
      {config.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Episode List Row — refined
// ---------------------------------------------------------------------------

function EpisodeListRow({
  episode,
  existing,
  isLoading,
  disabled,
  aiStatus,
  onSelect,
}: {
  episode: Episode
  existing: StudioSession | undefined
  isLoading: boolean
  disabled: boolean
  aiStatus: AiStatus | null
  onSelect: (ep: Episode) => void
}) {
  return (
    <button
      onClick={() => onSelect(episode)}
      disabled={disabled}
      className={cn(
        "group flex w-full items-center gap-3 px-4 py-3 text-start transition-all",
        "hover:bg-muted/40 active:bg-muted/60",
        isLoading && "pointer-events-none opacity-70"
      )}
    >
      {/* Thumbnail */}
      {episode.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Admin-only studio listing thumbnail with dynamic external URL
        <img
          src={episode.thumbnail_url}
          alt=""
          className="h-9 w-16 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md bg-muted">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Title + Meta */}
      <div className="flex-1 min-w-0">
        <span className="block truncate text-[13px] font-medium" dir="auto">
          {episode.title}
        </span>
        <div className="flex items-center gap-3 mt-0.5">
          {episode.guest?.name && (
            <span className="text-[11px] text-muted-foreground truncate">
              {episode.guest.name}
            </span>
          )}
          {episode.duration_minutes > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {fmtEpDuration(episode.duration_minutes)}
            </span>
          )}
        </div>
      </div>

      {/* AI status badge */}
      {aiStatus && <AiStatusBadge status={aiStatus} />}

      {/* Studio status pill */}
      {existing ? (
        <span className="shrink-0 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          في الاستوديو
        </span>
      ) : (
        <span className="shrink-0 rounded-md bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          جديد
        </span>
      )}

      {/* Loading / Chevron */}
      {isLoading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      ) : (
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:-translate-x-0.5 group-hover:text-foreground/60" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Audio Session Row — refined
// ---------------------------------------------------------------------------

function AudioSessionRow({
  session,
  deletingId,
  aiStatus,
  projectState,
  onSelect,
  onDelete,
}: {
  session: StudioSession
  deletingId: string | null
  aiStatus: AiStatus
  projectState: StudioProjectState | undefined
  onSelect: (s: StudioSession) => void
  onDelete: (id: string) => void
}) {
  // Distinguish the two legs of a produced episode (Sara): the raw recording
  // and the post-montage cut used the SAME mic icon, so a project's map and
  // its edit were indistinguishable. Derive the role + phase from audio_stage
  // + the linked project's state.
  const isRaw = session.audio_stage === "raw"
  const { stageLabel, phaseLabel } = sessionPhaseInfo(
    session.audio_stage,
    projectState ?? null,
  )
  const RoleIcon = isRaw ? Mic : Scissors
  // ص-٢ — deletion is two-step and names what is going away. The
  // 28px hover-revealed trash used to fire instantly, and back when it
  // also wiped the linked episode that single misclick took published
  // content off the site with it.
  const [confirming, setConfirming] = useState(false)
  const sessionLabel =
    session.video_title || session.audio_filename || "بدون عنوان"
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(session) }}
      className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-start transition-all hover:bg-muted/40 active:bg-muted/60"
    >
      {/* Role icon — mic for the raw recording, scissors for the edited cut */}
      <div
        className={cn(
          "flex h-9 w-16 shrink-0 items-center justify-center rounded-md",
          isRaw ? "bg-purple-100 dark:bg-purple-950/40" : "bg-indigo-100 dark:bg-indigo-950/40",
        )}
      >
        <RoleIcon className={cn("h-4 w-4", isRaw ? "text-purple-700" : "text-indigo-700")} />
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <span className="block truncate text-[13px] font-medium" dir="auto">
          {session.video_title || session.audio_filename || "بدون عنوان"}
        </span>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {/* Which leg of the journey — raw vs edited */}
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              isRaw ? "bg-purple-500/10 text-purple-700" : "bg-indigo-500/10 text-indigo-700",
            )}
          >
            {stageLabel}
          </span>
          {/* The linked project's phase — ties a raw + edited pair together */}
          {phaseLabel && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {phaseLabel}
            </span>
          )}
          {session.audio_file_size != null && (
            <span className="text-[11px] text-muted-foreground">
              {formatFileSize(session.audio_file_size)}
            </span>
          )}
        </div>
      </div>

      {/* AI status badge */}
      <AiStatusBadge status={aiStatus} />

      {/* Delete — two-step, and the confirmation says what is deleted */}
      {confirming ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1"
        >
          <span className="text-[11px] text-red-700">
            حذف جلسة «{sessionLabel}» ومخرجاتها؟ الحلقة المنشورة لا تتأثر.
          </span>
          <button
            onClick={() => {
              setConfirming(false)
              onDelete(session.id)
            }}
            disabled={deletingId === session.id}
            className="rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-red-700"
          >
            {deletingId === session.id ? "جارٍ الحذف..." : "احذف"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            إلغاء
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setConfirming(true)
          }}
          aria-label={`حذف جلسة ${sessionLabel}`}
          disabled={deletingId === session.id}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg opacity-0 transition-all hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-400 group-hover:opacity-100"
        >
          {deletingId === session.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:-translate-x-0.5 group-hover:text-foreground/60" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stats Bar
// ---------------------------------------------------------------------------

function StatsBar({
  totalSessions,
  completedCount,
  processingCount,
  audioCount,
}: {
  totalSessions: number
  completedCount: number
  processingCount: number
  audioCount: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-border/30 bg-card/50 px-4 py-3">
        <p className="text-2xl font-bold tabular-nums">{totalSessions}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">جلسة في الاستوديو</p>
      </div>
      <div className="rounded-xl border border-border/30 bg-card/50 px-4 py-3">
        <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{completedCount}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">مكتمل</p>
      </div>
      <div className="rounded-xl border border-border/30 bg-card/50 px-4 py-3">
        <p className="text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-400">{processingCount}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">قيد المعالجة</p>
      </div>
      <div className="rounded-xl border border-border/30 bg-card/50 px-4 py-3">
        <p className="text-2xl font-bold tabular-nums text-purple-700 dark:text-purple-400">{audioCount}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">جلسة صوتية</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Studio Client
// ---------------------------------------------------------------------------

export function StudioClient({ initialSessions, episodes, aiStatuses: initialAiStatuses, projectsBySession }: StudioClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [aiStatuses, setAiStatuses] = useState<Record<string, AiStatus>>(initialAiStatuses)
  const [episodeSearch, setEpisodeSearch] = useState("")
  const [fetching, setFetching] = useState(false)
  const [fetchingEpisodeId, setFetchingEpisodeId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState("")
  const [sessions, setSessions] = useState<StudioSession[]>(initialSessions)
  const [activeSession, setActiveSession] = useState<StudioSession | null>(null)
  /** Episode opened read-only (no session yet). Browsing never writes —
   *  creation happens only via the «بدء الإنتاج» CTA in the preview. */
  const [previewEpisode, setPreviewEpisode] = useState<Episode | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Audio upload state
  const [showAudioUpload, setShowAudioUpload] = useState(false)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioTitle, setAudioTitle] = useState("")
  // Which audio journey (Studio Wave 2). 'raw' first — the time-map flow is
  // the reason Khaled uploads the unedited recording before montage.
  const [audioStage, setAudioStage] = useState<StudioAudioStage>("raw")
  // The raw session this edited upload belongs to, carried by the «المرحلة ٢»
  // button (?raw=). Forwarded to the upload so the edited session links back
  // to the SAME episode project instead of orphaning.
  const [stageTwoRawSessionId, setStageTwoRawSessionId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Refetch AI statuses when returning from active session to the list
  const refreshAiStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/studio/ai-statuses")
      if (!res.ok) {
        console.error("[Studio] refreshAiStatuses failed:", res.status)
        return
      }
      const data = await res.json()
      setAiStatuses(data)
    } catch (err) {
      console.error("[Studio] refreshAiStatuses error:", err)
    }
  }, [])

  const handleBack = useCallback(() => {
    setActiveSession(null)
    refreshAiStatuses()
  }, [refreshAiStatuses])

  // Track which sections are expanded
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>(["_episodes"])
    if (initialSessions.some(s => s.source === "audio")) initial.add("_audio")
    return initial
  })

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

  const filteredEpisodes = useMemo(() => {
    if (!episodeSearch.trim()) return episodes
    const q = episodeSearch.trim().toLowerCase()
    return episodes.filter((ep) =>
      ep.title.toLowerCase().includes(q) ||
      ep.guest?.name?.toLowerCase().includes(q) ||
      (ep.episode_number != null && String(ep.episode_number).includes(q))
    )
  }, [episodes, episodeSearch])

  const audioSessions = useMemo(
    () => sessions.filter((s) => s.source === "audio"),
    [sessions]
  )

  // Stats
  const completedCount = useMemo(
    () => Object.values(aiStatuses).filter((s) => s === "completed").length,
    [aiStatuses]
  )
  const processingCount = useMemo(
    () => Object.values(aiStatuses).filter((s) => s === "processing").length,
    [aiStatuses]
  )

  const getExistingSession = (episode: Episode): StudioSession | undefined => {
    const videoId = getYouTubeId(episode.youtube_url)
    if (!videoId) return undefined
    return sessions.find((s) => s.video_id === videoId)
  }

  /**
   * Opening from the list is a PURE READ: an existing session opens
   * directly; an episode without a session opens the read-only preview
   * panel. No row is created by browsing — session + EIR creation
   * happens only behind the explicit «بدء الإنتاج» CTA below.
   */
  const handleEpisodeSelect = useCallback((episode: Episode) => {
    const videoId = getYouTubeId(episode.youtube_url)
    const existing = videoId ? sessions.find((s) => s.video_id === videoId) : undefined
    if (existing) {
      setActiveSession(existing)
      return
    }
    setFetchError("")
    setPreviewEpisode(episode)
  }, [sessions])

  /**
   * The explicit production start. Runs the exact create call browsing
   * used to trigger implicitly: POST /api/admin/studio → creates the
   * studio session and (server-side, unchanged) resolves/mints the EIR
   * at phase=producing via resolveEirForStudioSession.
   */
  const handleStartProduction = useCallback(async (episode: Episode) => {
    if (!episode.youtube_url) {
      setFetchError("هذه الحلقة لا تحتوي على رابط يوتيوب")
      return
    }

    setFetching(true)
    setFetchingEpisodeId(episode.id)
    setFetchError("")

    try {
      const res = await fetch("/api/admin/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: episode.youtube_url }),
      })

      const data = await res.json()

      if (!res.ok) {
        setFetchError(data.error || "حدث خطأ")
        return
      }

      setPreviewEpisode(null)
      setActiveSession(data)
      setSessions((prev) => [data, ...prev])
      setAiStatuses((prev) => ({ ...prev, [data.id]: "ready" as AiStatus }))
    } catch {
      setFetchError("حدث خطأ في الاتصال")
    } finally {
      setFetching(false)
      setFetchingEpisodeId(null)
    }
  }, [])

  // Deep-link support: ?video=<videoId> auto-opens the matching session,
  // or the read-only preview when the episode has no session yet (deep-
  // linking, like browsing, never creates rows).
  // Consumes the param after handling so back-navigation returns to the list.
  const deepLinkHandled = useRef(false)
  useEffect(() => {
    if (deepLinkHandled.current) return
    const videoParam = searchParams.get("video")
    if (!videoParam) return
    deepLinkHandled.current = true

    const existing = sessions.find((s) => s.video_id === videoParam)
    if (existing) {
      setActiveSession(existing)
    } else {
      const ep = episodes.find((e) => getYouTubeId(e.youtube_url) === videoParam)
      if (ep) handleEpisodeSelect(ep)
    }

    // Remove the query param from the URL so refresh/back work predictably
    router.replace(pathname, { scroll: false })
  }, [searchParams, sessions, episodes, handleEpisodeSelect, router, pathname])

  // Deep-link from the raw-map «المرحلة ٢» button: open the audio upload panel
  // pre-set to the edited (post-montage) journey. The `raw` param carries the
  // raw session id so the upcoming edited upload attaches to the SAME episode
  // project (the orphan fix). Consumes both params so a refresh/back doesn't
  // re-open it.
  const stageTwoHandled = useRef(false)
  useEffect(() => {
    if (stageTwoHandled.current) return
    if (searchParams.get("upload") !== "edited") return
    stageTwoHandled.current = true
    setShowAudioUpload(true)
    setAudioStage("edited")
    setStageTwoRawSessionId(searchParams.get("raw"))
    router.replace(pathname, { scroll: false })
  }, [searchParams, router, pathname])

  const handleAudioSelect = useCallback((file: File) => {
    const ext = file.name.toLowerCase().split(".").pop()
    const allowed = ["mp3", "wav", "m4a", "webm"]
    if (!allowed.includes(ext || "")) {
      setFetchError(`صيغة غير مدعومة. الصيغ المدعومة: ${allowed.join(", ")}`)
      return
    }
    if (file.size > 500 * 1024 * 1024) {
      setFetchError("حجم الملف يتجاوز 500 MB")
      return
    }
    setAudioFile(file)
    setFetchError("")
    if (!audioTitle) {
      setAudioTitle(file.name.replace(/\.[^.]+$/, ""))
    }
  }, [audioTitle])

  const handleAudioUpload = useCallback(async () => {
    if (!audioFile) return
    setUploading(true)
    setUploadProgress(0)
    setFetchError("")

    const formData = new FormData()
    formData.append("file", audioFile)
    if (audioTitle) formData.append("title", audioTitle)
    formData.append("audio_stage", audioStage)
    // Orphan fix: on the edited journey, tell the server which raw session
    // this cut belongs to so it links to the existing episode project.
    if (audioStage === "edited" && stageTwoRawSessionId) {
      formData.append("raw_session_id", stageTwoRawSessionId)
    }

    try {
      const result = await new Promise<StudioSession>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", "/api/admin/studio/upload")

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText)
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data)
            } else {
              reject(new Error(data.error || "فشل في رفع الملف"))
            }
          } catch {
            reject(new Error("فشل في قراءة الاستجابة"))
          }
        }

        xhr.onerror = () => reject(new Error("حدث خطأ في الاتصال"))
        xhr.send(formData)
      })

      setActiveSession(result)
      setSessions((prev) => [result, ...prev])
      setAiStatuses((prev) => ({ ...prev, [result.id]: "ready" as AiStatus }))
      setAudioFile(null)
      setAudioTitle("")
      setUploadProgress(0)
      setStageTwoRawSessionId(null)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "حدث خطأ أثناء الرفع")
    } finally {
      setUploading(false)
    }
  }, [audioFile, audioTitle, audioStage, stageTwoRawSessionId])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/studio/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "فشل في حذف الجلسة" }))
        setFetchError(data.error || "فشل في حذف الجلسة")
        return
      }
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (activeSession?.id === id) setActiveSession(null)
    } catch (err) {
      console.error("[Studio] handleDelete error:", err)
      setFetchError("تعذر الاتصال لحذف الجلسة")
    } finally {
      setDeletingId(null)
    }
  }

  // =========================================================================
  // Active Session View — Pipeline
  // =========================================================================

  if (activeSession) {
    // Which journey to render (raw map / Phase-2 review + gated Phase 3 /
    // the existing full pipeline) is decided by SessionBody, which lives
    // inside the provider so it can read the project/review context.
    return (
      <div className="space-y-5">
        {/* Back navigation */}
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          العودة للقائمة
        </button>

        <StudioSessionProvider key={activeSession.id} session={activeSession}>
          <SessionBody />
        </StudioSessionProvider>
      </div>
    )
  }

  // =========================================================================
  // Preview View — read-only episode preview (no session, zero writes)
  // =========================================================================

  if (previewEpisode) {
    const ep = previewEpisode
    return (
      <div className="space-y-5">
        {/* Back navigation */}
        <button
          onClick={() => { setPreviewEpisode(null); setFetchError("") }}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          العودة للقائمة
        </button>

        <div className="rounded-xl border border-border/30 bg-card/50 p-5">
          <div className="flex items-start gap-4">
            {ep.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Admin-only studio preview thumbnail with dynamic external URL
              <img
                src={ep.thumbnail_url}
                alt=""
                className="h-20 w-36 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-20 w-36 shrink-0 items-center justify-center rounded-lg bg-muted">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold leading-snug" dir="auto">
                {ep.title}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                {ep.episode_number != null && <span>حلقة {ep.episode_number}</span>}
                {ep.guest?.name && <span>{ep.guest.name}</span>}
                {ep.duration_minutes > 0 && <span>{fmtEpDuration(ep.duration_minutes)}</span>}
              </div>
              {ep.youtube_url && (
                <a
                  href={ep.youtube_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-block text-[12px] text-primary hover:underline"
                  dir="ltr"
                >
                  {ep.youtube_url}
                </a>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
            وضع المعاينة — التصفّح لا يُنشئ أي سجلّ. «بدء الإنتاج» ينشئ جلسة
            الاستوديو ويربط الحلقة بخطّ الإنتاج (EIR).
          </div>

          {fetchError && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-700 mt-0.5" />
              <p className="text-sm font-medium text-red-700 dark:text-red-400">{fetchError}</p>
            </div>
          )}

          <div className="mt-4">
            <Button
              onClick={() => handleStartProduction(ep)}
              disabled={fetching}
              className="gap-2"
            >
              {fetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              بدء الإنتاج
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // =========================================================================
  // Picker View — Episode List
  // =========================================================================

  return (
    <div className="space-y-5">
      {/* Stats overview */}
      <StatsBar
        totalSessions={sessions.length}
        completedCount={completedCount}
        processingCount={processingCount}
        audioCount={audioSessions.length}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={episodeSearch}
            onChange={(e) => setEpisodeSearch(e.target.value)}
            placeholder="ابحث عن حلقة بالعنوان أو اسم الضيف أو رقم الحلقة..."
            className="h-9 w-full rounded-lg border border-border/30 bg-card/50 py-2 pe-4 ps-10 text-[13px] outline-none transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary/30 placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={() => { setShowAudioUpload(!showAudioUpload); setFetchError("") }}
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-medium transition-all duration-200",
            showAudioUpload
              ? "bg-purple-600 text-white shadow-sm"
              : "border border-border/30 bg-card/50 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          )}
        >
          <Mic className="h-4 w-4" />
          <span className="hidden sm:inline">ملف صوتي</span>
        </button>
      </div>

      {/* Audio upload section */}
      {showAudioUpload && (
        <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50/50 p-5 dark:border-purple-900/50 dark:bg-purple-950/20">
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleAudioSelect(f)
            }}
          />

          {/* Which audio journey — chosen BEFORE upload. */}
          <AudioStageRadio value={audioStage} onChange={setAudioStage} disabled={uploading} />

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              const f = e.dataTransfer.files[0]
              if (f) handleAudioSelect(f)
            }}
            onClick={() => !audioFile && fileInputRef.current?.click()}
            className={cn(
              "rounded-xl border-2 border-dashed p-8 text-center transition-all",
              dragActive && "border-purple-500 bg-purple-100/50 dark:bg-purple-950/30",
              !dragActive && !audioFile && "border-purple-300/50 hover:border-purple-400 cursor-pointer dark:border-purple-800/50",
              audioFile && "border-purple-300 bg-card/50 dark:bg-purple-950/10",
              uploading && "pointer-events-none opacity-60"
            )}
          >
            {audioFile ? (
              <div className="flex items-center justify-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-950/40">
                  <FileAudio className="h-6 w-6 text-purple-700" />
                </div>
                <div className="text-start min-w-0">
                  <p className="text-sm font-semibold truncate">{audioFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatFileSize(audioFile.size)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setAudioFile(null)
                    setAudioTitle("")
                  }}
                  className="shrink-0 rounded-lg p-2 hover:bg-red-100 hover:text-red-700 transition-colors dark:hover:bg-red-950/50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-950/40">
                  <Upload className="h-7 w-7 text-purple-700" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    اسحب ملف صوتي هنا أو اضغط للاختيار
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    MP3, WAV, M4A, WEBM — حتى 500 MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {audioFile && (
            <div className="flex gap-3">
              <input
                type="text"
                value={audioTitle}
                onChange={(e) => setAudioTitle(e.target.value)}
                placeholder="عنوان الحلقة (اختياري)"
                className="flex-1 rounded-xl border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 dark:bg-background"
              />
              <Button
                onClick={handleAudioUpload}
                disabled={uploading}
                className="shrink-0 gap-2 rounded-xl bg-purple-600 hover:bg-purple-700"
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />جارٍ الرفع {uploadProgress}%</>
                ) : (
                  <><Upload className="h-4 w-4" />رفع الملف</>
                )}
              </Button>
            </div>
          )}

          {uploading && uploadProgress > 0 && (
            <div className="h-2 rounded-full bg-purple-200/50 overflow-hidden dark:bg-purple-900/30">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {fetchError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-700 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{fetchError}</p>
          </div>
        </div>
      )}

      {/* Episode + Audio list */}
      <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden admin-glow">
        {/* Audio sessions section */}
        {audioSessions.length > 0 && (
          <div className="border-b">
            <button
              onClick={() => toggleSection("_audio")}
              className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/40"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  !expandedSections.has("_audio") && "-rotate-90"
                )}
              />
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-950/40">
                <Mic className="h-3 w-3 text-purple-700" />
              </div>
              <h3 className="text-[13px] font-semibold">جلسات صوتية</h3>
              <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:text-purple-400">
                {audioSessions.length}
              </span>
            </button>
            {expandedSections.has("_audio") && (
              <div className="divide-y">
                {audioSessions.map((session) => (
                  <AudioSessionRow
                    key={session.id}
                    session={session}
                    deletingId={deletingId}
                    aiStatus={aiStatuses[session.id] || "ready"}
                    projectState={projectsBySession[session.id]}
                    onSelect={setActiveSession}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Episodes list */}
        {filteredEpisodes.length > 0 && (
          <div>
            <button
              onClick={() => toggleSection("_episodes")}
              className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-accent/50 border-b"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  !expandedSections.has("_episodes") && "-rotate-90"
                )}
              />
              <h3 className="text-[13px] font-semibold">الحلقات</h3>
              <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {filteredEpisodes.length}
              </span>
            </button>
            {expandedSections.has("_episodes") && (
              <div className="divide-y">
                {filteredEpisodes.map((episode) => {
                  const existing = getExistingSession(episode)
                  return (
                    <EpisodeListRow
                      key={episode.id}
                      episode={episode}
                      existing={existing}
                      isLoading={fetchingEpisodeId === episode.id}
                      disabled={fetching}
                      aiStatus={existing ? (aiStatuses[existing.id] || "ready") : null}
                      onSelect={handleEpisodeSelect}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {filteredEpisodes.length === 0 && audioSessions.length === 0 && (
          <div className="py-12 text-center">
            <div className="flex justify-center mb-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {episodeSearch.trim()
                ? "لم يتم العثور على حلقات مطابقة"
                : "لا توجد حلقات متاحة"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
