"use client"

import { useState } from "react"
import {
  FileText, Search, Loader2, AlertCircle, Check, Copy,
  Upload, FileUp, Mic,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSession, useTranscript } from "../contexts"
import { TRANSCRIPT_STATUS_LABELS, PREVIEW_WORD_LIMIT } from "./shared"

export function TranscriptContent() {
  const { session } = useSession()
  const {
    transcript, transcriptStatus, transcriptError,
    fetchTranscript, transcribeAudio, uploadTranscript, transcriptUploading,
    pasteTranscript, transcriptPasting,
  } = useTranscript()

  const isAudio = session.source === "audio"

  const [copied, setCopied] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState("")

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
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <span className={cn("rounded-md px-2.5 py-0.5 text-[11px] font-medium", statusInfo.className)}>
          {statusInfo.label}
        </span>
      </div>

      {transcriptStatus === "idle" && (
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
            <div className="space-y-1.5">
              <Button onClick={fetchTranscript} className="gap-2">
                <Search className="h-4 w-4" />
                جلب النص
              </Button>
              <p className="text-xs text-muted-foreground/70">
                سيتم جلب النص من الترجمة التلقائية أو تحويل الصوت بالذكاء الاصطناعي
              </p>
            </div>
          )}
        </div>
      )}

      {transcriptStatus === "generating" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            {isAudio ? "جارٍ تحويل الصوت إلى نص..." : "جارٍ جلب النص..."}
          </span>
          <span className="text-xs text-muted-foreground/70">
            {isAudio
              ? "قد تستغرق هذه العملية عدة دقائق للحلقات الطويلة"
              : "سيتم المحاولة من الترجمة التلقائية أولاً، ثم تحويل الصوت إذا لم تتوفر"
            }
          </span>
        </div>
      )}

      {transcriptStatus === "error" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
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
            <span>{transcript.word_count.toLocaleString("en")} كلمة</span>
            <span>{transcript.char_count.toLocaleString("en")} حرف</span>
            <span>المصدر: {transcript.source === "youtube_captions" ? "يوتيوب" : transcript.source === "whisper" ? "Whisper AI" : "ملف مرفوع"}</span>
            <span>اللغة: {transcript.language}</span>
          </div>

          <div className="relative">
            <div
              className="transcript-viewer max-h-64 overflow-y-auto rounded-lg border bg-muted/30 p-4 text-sm"
              dir="rtl"
              lang="ar"
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
      <div className="border-t border-border/30 pt-4">
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

      {/* Text paste option */}
      <div className="border-t border-border/30 pt-4">
        <button
          onClick={() => setShowPaste(!showPaste)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <FileText className="h-4 w-4" />
          أو الصق نصاً مباشرة
        </button>
        {showPaste && (
          <div className="mt-3 space-y-3">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="الصق نص الحلقة هنا (50 حرف على الأقل)..."
              className="w-full h-32 rounded-lg border bg-muted/30 p-3 text-sm resize-y outline-none focus:ring-2 focus:ring-primary/20"
              dir="rtl"
              lang="ar"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {pasteText.length.toLocaleString("en")} حرف
                {pasteText.trim().length < 50 && pasteText.length > 0 && (
                  <span className="text-red-500 mr-2">• يجب أن يكون 50 حرف على الأقل</span>
                )}
              </span>
              <Button
                onClick={() => { pasteTranscript(pasteText); setPasteText(""); setShowPaste(false) }}
                disabled={pasteText.trim().length < 50 || transcriptPasting}
                size="sm"
                className="gap-2"
              >
                {transcriptPasting ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />جارٍ الحفظ...</>
                ) : (
                  <>حفظ النص</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
