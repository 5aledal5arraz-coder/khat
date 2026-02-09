"use client"

import { useState } from "react"
import {
  FileText, Search, Loader2, AlertCircle, Check, Copy,
  Upload, FileUp, User, Calendar, Clock, Hash, ExternalLink,
  Sparkles, CheckCircle2, Circle, Mic, FileAudio, HardDrive,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudioSession, GENERATE_ALL_STEPS } from "./studio-context"
import { formatDuration, formatDate, formatFileSize, InfoRow, TRANSCRIPT_STATUS_LABELS, PREVIEW_WORD_LIMIT } from "./shared"

export function TabOverview() {
  const ctx = useStudioSession()
  const {
    session, transcript, transcriptStatus, transcriptError,
    fetchTranscript, transcribeAudio, uploadTranscript, transcriptUploading,
    generateAll, generateAllRunning, generateAllCurrentStep, generateAllCompleted, generateAllError,
  } = ctx

  const isAudio = session.source === "audio"

  const [copied, setCopied] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const handleCopy = async () => {
    if (!transcript?.transcript_clean) return
    await navigator.clipboard.writeText(transcript.transcript_clean)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadTranscript(file)
  }

  const statusInfo = TRANSCRIPT_STATUS_LABELS[transcriptStatus]

  const previewText = transcript?.transcript_clean
    ? transcript.transcript_clean.split(/\s+/).slice(0, PREVIEW_WORD_LIMIT).join(" ") +
      (transcript.word_count > PREVIEW_WORD_LIMIT ? " ..." : "")
    : ""

  return (
    <div className="space-y-6">
      {/* Session Card */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col md:flex-row">
          {isAudio ? (
            <div className="shrink-0 md:w-80 flex items-center justify-center bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-950/40 dark:to-purple-900/20">
              <div className="py-8 flex flex-col items-center gap-2">
                <Mic className="h-12 w-12 text-purple-400" />
                <span className="text-xs text-purple-500 font-medium">ملف صوتي</span>
              </div>
            </div>
          ) : session.thumbnail_url ? (
            <div className="shrink-0 md:w-80">
              <img
                src={session.thumbnail_url}
                alt={session.video_title || ""}
                className="aspect-video w-full object-cover md:h-full md:aspect-auto"
              />
            </div>
          ) : null}
          <div className="flex-1 p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-bold leading-tight">
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
            <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="flex items-center gap-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground">الحالة:</span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  session.status === "fetched" && "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
                  session.status === "draft" && "bg-muted text-muted-foreground",
                  session.status === "error" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                )}
              >
                {session.status === "fetched" ? "تم الجلب بنجاح" : session.status === "error" ? "خطأ" : "مسودة"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Transcript Card */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">النص التلقائي</h2>
          </div>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusInfo.className)}>
            {statusInfo.label}
          </span>
        </div>

        {transcriptStatus === "not_fetched" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isAudio
                ? "حوّل الملف الصوتي إلى نص باستخدام Whisper AI أو ارفع ملف نص يدوياً"
                : "اجلب النص التلقائي من يوتيوب أو ارفع ملف نص يدوياً"
              }
            </p>
            {isAudio ? (
              <Button onClick={transcribeAudio} className="gap-2 bg-purple-600 hover:bg-purple-700">
                <Mic className="h-4 w-4" />
                تحويل الصوت إلى نص (Whisper)
              </Button>
            ) : (
              <Button onClick={fetchTranscript} className="gap-2">
                <Search className="h-4 w-4" />
                جلب النص من يوتيوب
              </Button>
            )}
          </div>
        )}

        {transcriptStatus === "fetching" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {isAudio
                ? "جارٍ تحويل الصوت إلى نص..."
                : "جارٍ جلب النص التلقائي من يوتيوب..."
              }
            </span>
            {isAudio && (
              <span className="text-xs text-muted-foreground/70">
                قد تستغرق هذه العملية عدة دقائق للحلقات الطويلة
              </span>
            )}
          </div>
        )}

        {transcriptStatus === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm text-red-600 dark:text-red-400">{transcriptError}</p>
                <p className="text-xs text-red-500/70 dark:text-red-400/60">
                  يمكنك رفع ملف نص يدوياً بدلاً من ذلك
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={isAudio ? transcribeAudio : fetchTranscript}
              className="gap-2"
            >
              {isAudio ? <Mic className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              إعادة المحاولة
            </Button>
          </div>
        )}

        {transcriptStatus === "ready" && transcript && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>{transcript.word_count.toLocaleString("ar-SA")} كلمة</span>
              <span>{transcript.char_count.toLocaleString("ar-SA")} حرف</span>
              <span>المصدر: {transcript.source === "youtube_captions" ? "يوتيوب" : transcript.source === "whisper" ? "Whisper AI" : "ملف مرفوع"}</span>
              <span>اللغة: {transcript.language}</span>
            </div>

            <div className="relative">
              <div
                className="max-h-64 overflow-y-auto rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed"
                dir="rtl"
              >
                {previewText}
              </div>
              {transcript.word_count > PREVIEW_WORD_LIMIT && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-lg bg-gradient-to-t from-card to-transparent" />
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
                {copied ? (
                  <><Check className="h-3.5 w-3.5 text-green-500" />تم النسخ</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" />نسخ النص الكامل</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={isAudio ? transcribeAudio : fetchTranscript}
                className="gap-1.5"
              >
                {isAudio ? <Mic className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                {isAudio ? "إعادة التحويل" : "إعادة الجلب"}
              </Button>
            </div>
          </div>
        )}

        {/* Upload fallback */}
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">أو ارفع ملف نص</span>
            <span className="text-xs text-muted-foreground">(TXT, SRT, VTT — حتى 10 MB)</span>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleFileDrop}
            onClick={() => {
              const input = document.createElement("input")
              input.type = "file"
              input.accept = ".txt,.srt,.vtt"
              input.onchange = (e) => {
                const f = (e.target as HTMLInputElement).files?.[0]
                if (f) uploadTranscript(f)
              }
              input.click()
            }}
            className={cn(
              "cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors",
              dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50",
              transcriptUploading && "pointer-events-none opacity-60"
            )}
          >
            {transcriptUploading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">جارٍ الرفع...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <FileUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">اسحب ملف هنا أو اضغط للاختيار</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generate All Card */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h2 className="font-semibold">توليد الكل</h2>
        </div>

        <p className="text-sm text-muted-foreground">
          ولّد جميع المحتويات دفعة واحدة: نص تلقائي، مخرجات AI، فصول زمنية، مقاطع قصيرة، وحزمة الموقع
        </p>

        {/* Progress steps */}
        <div className="space-y-2">
          {GENERATE_ALL_STEPS.map((step) => {
            const isCompleted = generateAllCompleted.includes(step.key)
            const isCurrent = generateAllCurrentStep === step.key
            return (
              <div key={step.key} className="flex items-center gap-3">
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <span className={cn(
                  "text-sm",
                  isCompleted && "text-green-600 dark:text-green-400",
                  isCurrent && "font-medium",
                  !isCompleted && !isCurrent && "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>

        {generateAllError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{generateAllError}</p>
          </div>
        )}

        <Button
          onClick={generateAll}
          disabled={generateAllRunning}
          className="gap-2"
        >
          {generateAllRunning ? (
            <><Loader2 className="h-4 w-4 animate-spin" />جارٍ التوليد...</>
          ) : (
            <><Sparkles className="h-4 w-4" />توليد الكل</>
          )}
        </Button>
      </div>
    </div>
  )
}
