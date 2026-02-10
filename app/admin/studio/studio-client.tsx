"use client"

import { useState, useRef, useCallback } from "react"
import {
  Youtube, Loader2, Search, AlertCircle,
  Image as ImageIcon, Trash2, Mic, Upload, FileAudio,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn, getYouTubeId } from "@/lib/utils"
import type { StudioSession } from "@/types/database"
import { formatDuration, formatFileSize, StatusDot } from "./components/shared"
import { StudioSessionProvider, useStudioSession } from "./components/studio-context"
import { TabOverview } from "./components/tab-overview"
import { TabYoutubePack } from "./components/tab-youtube-pack"
import { TabSitePack } from "./components/tab-site-pack"
import { TabTimestamps } from "./components/tab-timestamps"
import { TabClips } from "./components/tab-clips"
import { TabSeoTopics } from "./components/tab-seo-topics"
import { TabExport } from "./components/tab-export"
import { TabAnalyzer } from "./components/tab-analyzer"

type InputSource = "youtube" | "audio"

interface StudioClientProps {
  initialSessions: StudioSession[]
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { value: "overview", label: "نظرة عامة", statusKey: "overview" },
  { value: "youtube", label: "حزمة يوتيوب", statusKey: "youtube" },
  { value: "site", label: "حزمة الموقع", statusKey: "site" },
  { value: "timestamps", label: "الطوابع الزمنية", statusKey: "timestamps" },
  { value: "clips", label: "المقاطع القصيرة", statusKey: "clips" },
  { value: "seo", label: "SEO والمواضيع", statusKey: "seo" },
  { value: "export", label: "التصدير", statusKey: "export" },
  { value: "analyzer", label: "تحليل الأداء", statusKey: "analyzer" },
] as const

// ---------------------------------------------------------------------------
// Inner tabs shell — reads context for status dots
// ---------------------------------------------------------------------------

function StudioTabs() {
  const { tabStatuses } = useStudioSession()

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <div className="overflow-x-auto -mx-1 px-1">
        <TabsList className="w-full justify-start gap-0.5">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              <StatusDot status={tabStatuses[tab.statusKey] || "idle"} />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="overview"><TabOverview /></TabsContent>
      <TabsContent value="youtube"><TabYoutubePack /></TabsContent>
      <TabsContent value="site"><TabSitePack /></TabsContent>
      <TabsContent value="timestamps"><TabTimestamps /></TabsContent>
      <TabsContent value="clips"><TabClips /></TabsContent>
      <TabsContent value="seo"><TabSeoTopics /></TabsContent>
      <TabsContent value="export"><TabExport /></TabsContent>
      <TabsContent value="analyzer"><TabAnalyzer /></TabsContent>
    </Tabs>
  )
}

// ---------------------------------------------------------------------------
// Main Studio Client
// ---------------------------------------------------------------------------

export function StudioClient({ initialSessions }: StudioClientProps) {
  const [inputSource, setInputSource] = useState<InputSource>("youtube")
  const [url, setUrl] = useState("")
  const [urlError, setUrlError] = useState("")
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState("")
  const [sessions, setSessions] = useState<StudioSession[]>(initialSessions)
  const [activeSession, setActiveSession] = useState<StudioSession | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Audio upload state
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioTitle, setAudioTitle] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const videoId = url ? getYouTubeId(url) : ""

  const handleUrlChange = (value: string) => {
    setUrl(value)
    setFetchError("")
    if (value && !getYouTubeId(value)) {
      setUrlError("رابط يوتيوب غير صالح")
    } else {
      setUrlError("")
    }
  }

  const handleFetch = async () => {
    if (!videoId) return
    setFetching(true)
    setFetchError("")

    try {
      const res = await fetch("/api/admin/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: url }),
      })

      const data = await res.json()

      if (!res.ok) {
        setFetchError(data.error || "حدث خطأ")
        return
      }

      setActiveSession(data)
      setSessions((prev) => [data, ...prev])
      setUrl("")
    } catch {
      setFetchError("حدث خطأ في الاتصال")
    } finally {
      setFetching(false)
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
      // Use XMLHttpRequest for progress tracking
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

  return (
    <div className="space-y-6">
      {/* Input Card */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        {/* Source toggle */}
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border p-0.5 bg-muted/50">
            <button
              onClick={() => { setInputSource("youtube"); setFetchError("") }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                inputSource === "youtube"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Youtube className="h-4 w-4 text-red-500" />
              يوتيوب
            </button>
            <button
              onClick={() => { setInputSource("audio"); setFetchError("") }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                inputSource === "audio"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Mic className="h-4 w-4 text-purple-500" />
              ملف صوتي
            </button>
          </div>
          <h2 className="font-semibold">
            {inputSource === "youtube" ? "جلب بيانات حلقة" : "رفع ملف صوتي"}
          </h2>
        </div>

        {/* YouTube input */}
        {inputSource === "youtube" && (
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="url"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && videoId && !fetching) handleFetch()
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                dir="ltr"
              />
              {urlError && (
                <p className="mt-1.5 text-xs text-red-500">{urlError}</p>
              )}
            </div>
            <Button
              onClick={handleFetch}
              disabled={!videoId || fetching || !!urlError}
              className="shrink-0 gap-2"
            >
              {fetching ? (
                <><Loader2 className="h-4 w-4 animate-spin" />جارٍ الجلب...</>
              ) : (
                <><Search className="h-4 w-4" />جلب البيانات</>
              )}
            </Button>
          </div>
        )}

        {/* Audio upload input */}
        {inputSource === "audio" && (
          <div className="space-y-3">
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

            {/* Drag-drop zone */}
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

            {/* Title input + upload button */}
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

            {/* Upload progress bar */}
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

        {fetchError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p>
          </div>
        )}
      </div>

      {/* Active Session — Tab UI */}
      {activeSession && (
        <StudioSessionProvider key={activeSession.id} session={activeSession}>
          <StudioTabs />
        </StudioSessionProvider>
      )}

      {/* Previous Sessions Grid */}
      {sessions.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-lg">الجلسات السابقة</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => {
              const isAudio = session.source === "audio"

              return (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveSession(session)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setActiveSession(session) }}
                  className={cn(
                    "group relative rounded-xl border bg-card p-4 text-start transition-all hover:shadow-md cursor-pointer",
                    activeSession?.id === session.id && "ring-2 ring-primary"
                  )}
                >
                  {/* Thumbnail / Audio icon */}
                  {isAudio ? (
                    <div className="mb-3 flex aspect-video items-center justify-center rounded-lg bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-950/40 dark:to-purple-900/20">
                      <Mic className="h-10 w-10 text-purple-400" />
                    </div>
                  ) : session.thumbnail_url ? (
                    <div className="mb-3 overflow-hidden rounded-lg">
                      <img
                        src={session.thumbnail_url}
                        alt={session.video_title || ""}
                        className="aspect-video w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="mb-3 flex aspect-video items-center justify-center rounded-lg bg-muted">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  )}

                  <h3 className="text-sm font-medium line-clamp-2">
                    {session.video_title || "بدون عنوان"}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isAudio ? (
                      <>
                        {session.audio_filename || "ملف صوتي"}
                        {session.audio_file_size != null && (
                          <> · {formatFileSize(session.audio_file_size)}</>
                        )}
                      </>
                    ) : (
                      <>
                        {session.channel_title || "—"}
                      </>
                    )}
                    {session.duration_seconds != null && (
                      <> · {formatDuration(session.duration_seconds)}</>
                    )}
                  </p>

                  {/* Source + Status badges */}
                  <div className="absolute left-3 top-3 flex gap-1.5">
                    {isAudio && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400">
                        صوتي
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        session.status === "fetched" && "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
                        session.status === "draft" && "bg-muted text-muted-foreground",
                        session.status === "error" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      )}
                    >
                      {session.status === "fetched" ? "تم الجلب" : session.status === "error" ? "خطأ" : "مسودة"}
                    </span>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(session.id)
                    }}
                    disabled={deletingId === session.id}
                    className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                  >
                    {deletingId === session.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
