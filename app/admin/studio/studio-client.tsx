"use client"

import { useState, useRef, useCallback, useMemo } from "react"
import {
  Loader2, Search, AlertCircle,
  Image as ImageIcon, Trash2, Mic, Upload, FileAudio,
  Clock, User, ChevronLeft, ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, getYouTubeId } from "@/lib/utils"
import type { StudioSession } from "@/types/database"
import type { Episode } from "@/types/database"
import type { EpisodeSectionsConfig } from "@/types/episodes"
import { formatFileSize } from "./components/shared"
import { StudioSessionProvider } from "./components/studio-context"
import { SessionHeader } from "./components/session-header"
import { GenerateAllBar } from "./components/generate-all-bar"
import { StagePrepare } from "./components/stage-prepare"
import { StageContent } from "./components/stage-content"
import { StagePublish } from "./components/stage-publish"

interface StudioClientProps {
  initialSessions: StudioSession[]
  episodes: Episode[]
  sectionsConfig: EpisodeSectionsConfig
  enrichedEpisodeIds: string[]
}

// ---------------------------------------------------------------------------
// Episode duration formatter (minutes → h:mm)
// ---------------------------------------------------------------------------

function fmtEpDuration(minutes: number): string {
  if (!minutes) return ""
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} ساعة`
  return `${m} دقيقة`
}

// ---------------------------------------------------------------------------
// Client-side filterByCategory — mirrors lib/queries/episodes.ts
// ---------------------------------------------------------------------------

function filterByCategory(
  episodes: Episode[],
  category: string,
  assignments: Record<string, string> = {}
): Episode[] {
  return episodes.filter((e) => {
    if (assignments[e.id] === category) return true
    if (assignments[e.id]) return false
    switch (category) {
      case "season-1":
        return (
          e.title.includes("الموسم الأول") ||
          e.title.includes("موسم 1") ||
          e.season === 1 ||
          (e.episode_number != null && e.episode_number <= 30)
        )
      case "season-2":
        return (
          e.title.includes("الموسم الثاني") ||
          e.title.includes("موسم 2") ||
          e.season === 2 ||
          (e.episode_number != null && e.episode_number > 30)
        )
      case "clips":
        return (
          e.title.includes("مقاطع") ||
          e.title.includes("مقطع") ||
          e.title.includes("clips") ||
          e.duration_minutes < 15
        )
      case "unpublished":
      case "unreleased":
        return (
          e.title.includes("غير منشور") ||
          e.title.includes("حصري") ||
          e.title.includes("خاص")
        )
      default:
        return false
    }
  })
}

// ---------------------------------------------------------------------------
// Compact Episode List Row
// ---------------------------------------------------------------------------

function EpisodeListRow({
  episode,
  existing,
  isLoading,
  disabled,
  isEnriched,
  onSelect,
}: {
  episode: Episode
  existing: StudioSession | undefined
  isLoading: boolean
  disabled: boolean
  isEnriched: boolean
  onSelect: (ep: Episode) => void
}) {
  return (
    <button
      onClick={() => onSelect(episode)}
      disabled={disabled}
      className={cn(
        "group flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-muted/50",
        isLoading && "pointer-events-none opacity-70"
      )}
    >
      {/* Thumbnail */}
      {episode.thumbnail_url ? (
        <img
          src={episode.thumbnail_url}
          alt=""
          className="h-[27px] w-12 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-[27px] w-12 shrink-0 items-center justify-center rounded bg-muted">
          <ImageIcon className="h-3 w-3 text-muted-foreground/50" />
        </div>
      )}

      {/* Title */}
      <span className="flex-1 truncate text-sm font-medium" dir="auto">
        {episode.title}
      </span>

      {/* Guest */}
      {episode.guest?.name && (
        <span className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground md:block">
          <User className="mr-1 inline h-3 w-3" />
          {episode.guest.name}
        </span>
      )}

      {/* Duration */}
      {episode.duration_minutes > 0 && (
        <span className="hidden w-16 shrink-0 text-xs text-muted-foreground md:block">
          <Clock className="mr-1 inline h-3 w-3" />
          {fmtEpDuration(episode.duration_minutes)}
        </span>
      )}

      {/* AI enrichment badge */}
      {isEnriched && (
        <span className="shrink-0 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 ring-1 ring-cyan-500/20">
          AI
        </span>
      )}

      {/* Status pill */}
      {existing ? (
        <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
          في الاستوديو
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          جديد
        </span>
      )}

      {/* Loading / Chevron */}
      {isLoading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      ) : (
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Compact Audio Session Row
// ---------------------------------------------------------------------------

function AudioSessionRow({
  session,
  deletingId,
  onSelect,
  onDelete,
}: {
  session: StudioSession
  deletingId: string | null
  onSelect: (s: StudioSession) => void
  onDelete: (id: string) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(session) }}
      className="group flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-muted/50"
    >
      {/* Purple mic icon */}
      <div className="flex h-[27px] w-12 shrink-0 items-center justify-center rounded bg-purple-100 dark:bg-purple-950/40">
        <Mic className="h-3.5 w-3.5 text-purple-500" />
      </div>

      {/* Title */}
      <span className="flex-1 truncate text-sm font-medium" dir="auto">
        {session.video_title || session.audio_filename || "بدون عنوان"}
      </span>

      {/* File size */}
      {session.audio_file_size != null && (
        <span className="hidden w-16 shrink-0 text-xs text-muted-foreground md:block">
          {formatFileSize(session.audio_file_size)}
        </span>
      )}

      {/* Status pill */}
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
          session.status === "fetched" && "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
          session.status === "draft" && "bg-muted text-muted-foreground",
          session.status === "error" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
        )}
      >
        {session.status === "fetched" ? "تم الجلب" : session.status === "error" ? "خطأ" : "مسودة"}
      </span>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete(session.id)
        }}
        disabled={deletingId === session.id}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
      >
        {deletingId === session.id ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Trash2 className="h-3 w-3" />
        )}
      </button>

      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Studio Client
// ---------------------------------------------------------------------------

export function StudioClient({ initialSessions, episodes, sectionsConfig, enrichedEpisodeIds }: StudioClientProps) {
  const enrichedSet = useMemo(() => new Set(enrichedEpisodeIds), [enrichedEpisodeIds])
  const [episodeSearch, setEpisodeSearch] = useState("")
  const [fetching, setFetching] = useState(false)
  const [fetchingEpisodeId, setFetchingEpisodeId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState("")
  const [sessions, setSessions] = useState<StudioSession[]>(initialSessions)
  const [activeSession, setActiveSession] = useState<StudioSession | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Audio upload state
  const [showAudioUpload, setShowAudioUpload] = useState(false)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioTitle, setAudioTitle] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Track which sections are expanded — audio expanded by default if sessions exist
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>()
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

  const { sections, assignments, deletedEpisodes } = sectionsConfig

  // Visible sections sorted by order
  const visibleSections = useMemo(
    () => [...sections].filter((s) => !s.hidden).sort((a, b) => a.order - b.order),
    [sections]
  )

  // Filter out deleted episodes
  const activeEpisodes = useMemo(() => {
    const deletedSet = new Set(deletedEpisodes || [])
    return deletedSet.size > 0 ? episodes.filter((e) => !deletedSet.has(e.id)) : episodes
  }, [episodes, deletedEpisodes])

  // Filter episodes by search
  const filteredEpisodes = useMemo(() => {
    if (!episodeSearch.trim()) return activeEpisodes
    const q = episodeSearch.trim().toLowerCase()
    return activeEpisodes.filter((ep) =>
      ep.title.toLowerCase().includes(q) ||
      ep.guest?.name?.toLowerCase().includes(q) ||
      (ep.episode_number != null && String(ep.episode_number).includes(q))
    )
  }, [activeEpisodes, episodeSearch])

  // Group episodes by section
  const groupedEpisodes = useMemo(() => {
    const groups: { section: typeof visibleSections[number]; episodes: Episode[] }[] = []
    const claimed = new Set<string>()

    for (const section of visibleSections) {
      const sectionEps = filterByCategory(filteredEpisodes, section.id, assignments)
      for (const ep of sectionEps) claimed.add(ep.id)
      if (sectionEps.length > 0) {
        groups.push({ section, episodes: sectionEps })
      }
    }

    // Uncategorized episodes
    const uncategorized = filteredEpisodes.filter((ep) => !claimed.has(ep.id))
    if (uncategorized.length > 0) {
      groups.push({
        section: { id: "_uncategorized", label: "بدون تصنيف", order: 999, color: "#9ca3af" },
        episodes: uncategorized,
      })
    }

    return groups
  }, [filteredEpisodes, visibleSections, assignments])

  // Audio-only sessions
  const audioSessions = useMemo(
    () => sessions.filter((s) => s.source === "audio"),
    [sessions]
  )

  // Check if an episode already has a studio session
  const getExistingSession = (episode: Episode): StudioSession | undefined => {
    const videoId = getYouTubeId(episode.youtube_url)
    if (!videoId) return undefined
    return sessions.find((s) => s.video_id === videoId)
  }

  const handleEpisodeSelect = async (episode: Episode) => {
    const existing = getExistingSession(episode)
    if (existing) {
      setActiveSession(existing)
      return
    }

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

      setActiveSession(data)
      setSessions((prev) => [data, ...prev])
    } catch {
      setFetchError("حدث خطأ في الاتصال")
    } finally {
      setFetching(false)
      setFetchingEpisodeId(null)
    }
  }

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
      setAudioFile(null)
      setAudioTitle("")
      setUploadProgress(0)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "حدث خطأ أثناء الرفع")
    } finally {
      setUploading(false)
    }
  }, [audioFile, audioTitle])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch(`/api/admin/studio/${id}`, { method: "DELETE" })
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (activeSession?.id === id) setActiveSession(null)
    } catch {
      // Ignore
    } finally {
      setDeletingId(null)
    }
  }

  // =========================================================================
  // Exclusive Views: Pipeline (active session) OR Picker (episode list)
  // =========================================================================

  if (activeSession) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveSession(null)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            العودة للقائمة
          </button>
        </div>
        <StudioSessionProvider key={activeSession.id} session={activeSession}>
          <div className="space-y-4">
            <SessionHeader />
            <GenerateAllBar />
            <StagePrepare />
            <StageContent />
            <StagePublish />
          </div>
        </StudioSessionProvider>
      </div>
    )
  }

  // =========================================================================
  // Picker View
  // =========================================================================

  return (
    <div className="space-y-4">
      {/* Toolbar row — flat, no card wrapper */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={episodeSearch}
            onChange={(e) => setEpisodeSearch(e.target.value)}
            placeholder="ابحث عن حلقة بالعنوان أو اسم الضيف أو رقم الحلقة..."
            className="h-10 w-full rounded-xl border bg-background py-2 pe-4 ps-10 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => { setShowAudioUpload(!showAudioUpload); setFetchError("") }}
          className={cn(
            "flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-medium transition-colors",
            showAudioUpload
              ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400"
              : "border text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Mic className="h-4 w-4" />
          ملف صوتي
        </button>
      </div>

      {/* Audio upload section (toggleable) */}
      {showAudioUpload && (
        <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-900 dark:bg-purple-950/20">
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
              "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
              dragActive && "border-purple-500 bg-purple-50 dark:bg-purple-950/20",
              !dragActive && !audioFile && "border-muted-foreground/25 hover:border-purple-400 cursor-pointer",
              audioFile && "border-purple-300 bg-purple-50/50 dark:bg-purple-950/10",
              uploading && "pointer-events-none opacity-60"
            )}
          >
            {audioFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileAudio className="h-8 w-8 text-purple-500 shrink-0" />
                <div className="text-start min-w-0">
                  <p className="text-sm font-medium truncate">{audioFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(audioFile.size)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setAudioFile(null)
                    setAudioTitle("")
                  }}
                  className="shrink-0 rounded-full p-1 hover:bg-muted"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  اسحب ملف صوتي هنا أو اضغط للاختيار
                </p>
                <p className="text-xs text-muted-foreground/60">
                  MP3, WAV, M4A, WEBM — حتى 500 MB
                </p>
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
                className="flex-1 rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
              <Button
                onClick={handleAudioUpload}
                disabled={uploading}
                className="shrink-0 gap-2 bg-purple-600 hover:bg-purple-700"
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
            <div className="h-2 rounded-full bg-muted overflow-hidden">
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
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p>
        </div>
      )}

      {/* Episode + Audio list */}
      <div className="rounded-xl border border-border/30 bg-card/50 divide-y divide-border/20">
        {/* Audio sessions section — first section */}
        {audioSessions.length > 0 && (
          <>
            <button
              onClick={() => toggleSection("_audio")}
              className="flex w-full items-center gap-3 px-3 py-2 text-start transition-colors hover:bg-muted/50"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                  !expandedSections.has("_audio") && "-rotate-90"
                )}
              />
              <span className="inline-block h-4 w-1 shrink-0 rounded-full bg-purple-500" />
              <Mic className="h-3.5 w-3.5 text-purple-500" />
              <h3 className="font-semibold text-sm">جلسات صوتية</h3>
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-400">
                {audioSessions.length}
              </span>
            </button>
            {expandedSections.has("_audio") && (
              <div className="divide-y divide-border/20">
                {audioSessions.map((session) => (
                  <AudioSessionRow
                    key={session.id}
                    session={session}
                    deletingId={deletingId}
                    onSelect={setActiveSession}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Episode sections */}
        {groupedEpisodes.map(({ section, episodes: sectionEps }) => {
          const inStudioCount = sectionEps.filter((ep) => getExistingSession(ep)).length
          const isExpanded = expandedSections.has(section.id)
          return (
            <div key={section.id}>
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center gap-3 px-3 py-2 text-start transition-colors hover:bg-muted/50"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                    !isExpanded && "-rotate-90"
                  )}
                />
                <span
                  className="inline-block h-4 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: section.color || "#6b7280" }}
                />
                <h3 className="font-semibold text-sm">{section.label}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {sectionEps.length}
                </span>
                {inStudioCount > 0 && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                    {inStudioCount} في الاستوديو
                  </span>
                )}
              </button>

              {/* Episode rows — collapsible */}
              {isExpanded && (
                <div className="divide-y divide-border/20">
                  {sectionEps.map((episode) => (
                    <EpisodeListRow
                      key={episode.id}
                      episode={episode}
                      existing={getExistingSession(episode)}
                      isLoading={fetchingEpisodeId === episode.id}
                      disabled={fetching}
                      isEnriched={enrichedSet.has(episode.id)}
                      onSelect={handleEpisodeSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Empty state */}
        {groupedEpisodes.length === 0 && audioSessions.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {episodeSearch.trim()
              ? "لم يتم العثور على حلقات مطابقة"
              : "لا توجد حلقات متاحة"}
          </div>
        )}
      </div>
    </div>
  )
}
