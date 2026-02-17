"use client"

import { useState } from "react"
import {
  FileText, Search, Loader2, AlertCircle, Check, Copy,
  Upload, FileUp, Mic, Wand2, BookOpen, ListChecks, Quote,
  RefreshCw, CheckCircle2, ChevronDown, ChevronUp, Layers,
  AudioWaveform, Scissors,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudioSession } from "./studio-context"
import {
  TRANSCRIPT_STATUS_LABELS, PROCESSING_STATUS_LABELS,
  PREVIEW_WORD_LIMIT, CopyButton,
} from "./shared"
import { AccordionSection } from "./accordion-section"
import { AudioToolsContent } from "./audio-tools"
import { EditSuggestionsContent } from "./edit-suggestions"

// ---------------------------------------------------------------------------
// Stage 1: التحضير (Prepare)
// ---------------------------------------------------------------------------

export function StagePrepare() {
  const { session, transcriptStatus, processingStatus, audioIntroStatus, editSuggestionsStatus } = useStudioSession()

  const isAudio = session.source === "audio"

  const transcriptTabStatus =
    transcriptStatus === "ready" ? "ready" as const
    : transcriptStatus === "fetching" ? "generating" as const
    : transcriptStatus === "error" ? "error" as const
    : "idle" as const

  const processingTabStatus =
    processingStatus === "ready" ? "ready" as const
    : processingStatus === "processing" ? "generating" as const
    : processingStatus === "error" ? "error" as const
    : "idle" as const

  const audioToolsTabStatus =
    audioIntroStatus === "ready" ? "ready" as const
    : audioIntroStatus === "generating" ? "generating" as const
    : audioIntroStatus === "error" ? "error" as const
    : "idle" as const

  const editSuggestionsTabStatus =
    editSuggestionsStatus === "ready" ? "ready" as const
    : editSuggestionsStatus === "generating" ? "generating" as const
    : editSuggestionsStatus === "error" ? "error" as const
    : "idle" as const

  const statuses = [transcriptTabStatus, processingTabStatus]
  if (isAudio) {
    statuses.push(audioToolsTabStatus)
    statuses.push(editSuggestionsTabStatus)
  }
  const readyCount = statuses.filter(s => s === "ready").length
  const totalCount = statuses.length

  return (
    <div className="rounded-xl border-s-4 border-s-blue-500 border border-border bg-card/50 p-3 space-y-2">
      <div className="flex items-center gap-2.5 px-1">
        <Layers className="h-5 w-5 text-blue-500" />
        <h2 className="font-semibold">التحضير</h2>
        <span className="text-xs text-muted-foreground">{readyCount}/{totalCount} جاهز</span>
      </div>

      <AccordionSection
        icon={FileText}
        iconColor="text-blue-500"
        title="النص التلقائي"
        status={transcriptTabStatus}
        defaultOpen={transcriptTabStatus !== "ready"}
      >
        <TranscriptContent />
      </AccordionSection>

      <AccordionSection
        icon={Wand2}
        iconColor="text-violet-500"
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
            iconColor="text-orange-500"
            title="أدوات الصوت"
            status={audioToolsTabStatus}
            defaultOpen={transcriptTabStatus === "ready" && audioToolsTabStatus !== "ready"}
          >
            <AudioToolsContent />
          </AccordionSection>

          <AccordionSection
            icon={Scissors}
            iconColor="text-rose-500"
            title="اقتراحات القص والتعديل"
            status={editSuggestionsTabStatus}
            defaultOpen={editSuggestionsTabStatus === "ready"}
          >
            <EditSuggestionsContent />
          </AccordionSection>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transcript section content
// ---------------------------------------------------------------------------

function TranscriptContent() {
  const ctx = useStudioSession()
  const {
    session, transcript, transcriptStatus, transcriptError,
    fetchTranscript, transcribeAudio, uploadTranscript, transcriptUploading,
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
    <div className="space-y-5">
      <div className="flex items-center justify-end">
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

      {transcriptStatus === "fetching" && (
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
  )
}

// ---------------------------------------------------------------------------
// AI Processing section content
// ---------------------------------------------------------------------------

function AiProcessingContent() {
  const {
    transcript, transcriptStatus,
    processingStatus, processingError,
    transcriptArticle, transcriptSummary, transcriptQuotes,
    processTranscript,
  } = useStudioSession()

  const [showArticle, setShowArticle] = useState(true)
  const [showSummary, setShowSummary] = useState(true)
  const [showQuotes, setShowQuotes] = useState(true)

  if (transcriptStatus !== "ready" || !transcript) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        اجلب النص التلقائي أولاً لتتمكن من المعالجة
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PROCESSING_STATUS_LABELS[processingStatus].className)}>
          {PROCESSING_STATUS_LABELS[processingStatus].label}
        </span>
      </div>

      {processingStatus === "idle" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            حوّل النص الخام إلى مقال مقروء، ملخص مُهيكل، واقتباسات مستخرجة
          </p>
          <Button onClick={processTranscript} className="gap-2 bg-violet-600 hover:bg-violet-700">
            <Wand2 className="h-4 w-4" />
            معالجة النص
          </Button>
        </div>
      )}

      {processingStatus === "processing" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          <span className="text-sm text-muted-foreground">جارٍ معالجة النص بالذكاء الاصطناعي...</span>
          <span className="text-xs text-muted-foreground/70">قد تستغرق هذه العملية دقيقة أو أكثر</span>
        </div>
      )}

      {processingStatus === "error" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{processingError || "فشل في المعالجة"}</p>
          </div>
          <Button variant="outline" onClick={processTranscript} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            إعادة المحاولة
          </Button>
        </div>
      )}

      {processingStatus === "ready" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={processTranscript} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              إعادة المعالجة
            </Button>
          </div>

          {/* Clean Article Section */}
          <div className="rounded-lg border">
            <button
              onClick={() => setShowArticle(!showArticle)}
              className="flex w-full items-center justify-between p-4 text-right hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-violet-500" />
                <span className="font-medium text-sm">المقال المقروء</span>
              </div>
              {showArticle ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showArticle && transcriptArticle && (
              <div className="border-t px-4 pb-4">
                <div className="flex justify-end py-2">
                  <CopyButton onClick={() => navigator.clipboard.writeText(transcriptArticle)} />
                </div>
                <div
                  className="transcript-viewer max-h-96 overflow-y-auto rounded-lg bg-muted/30 p-4 text-sm"
                  dir="rtl"
                  lang="ar"
                >
                  {transcriptArticle}
                </div>
              </div>
            )}
          </div>

          {/* Summary Section */}
          <div className="rounded-lg border">
            <button
              onClick={() => setShowSummary(!showSummary)}
              className="flex w-full items-center justify-between p-4 text-right hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-sm">الملخص المُهيكل</span>
              </div>
              {showSummary ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showSummary && transcriptSummary && (
              <div className="border-t p-4 space-y-4" dir="rtl" lang="ar" style={{ textAlign: "right", unicodeBidi: "plaintext" }}>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">نظرة عامة</h4>
                  <p className="text-sm" style={{ lineHeight: 1.9 }}>{transcriptSummary.overview}</p>
                </div>
                {transcriptSummary.key_ideas.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">الأفكار الرئيسية</h4>
                    <ul className="space-y-1.5">
                      {transcriptSummary.key_ideas.map((idea, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                          {idea}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {transcriptSummary.lessons.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">دروس عملية</h4>
                    <ul className="space-y-1.5">
                      {transcriptSummary.lessons.map((lesson, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                          {lesson}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quotes Section */}
          <div className="rounded-lg border">
            <button
              onClick={() => setShowQuotes(!showQuotes)}
              className="flex w-full items-center justify-between p-4 text-right hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Quote className="h-4 w-4 text-amber-500" />
                <span className="font-medium text-sm">اقتباسات مستخرجة</span>
                {transcriptQuotes && (
                  <span className="text-xs text-muted-foreground">({transcriptQuotes.length})</span>
                )}
              </div>
              {showQuotes ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showQuotes && transcriptQuotes && transcriptQuotes.length > 0 && (
              <div className="border-t p-4 space-y-3" dir="rtl" lang="ar" style={{ textAlign: "right", unicodeBidi: "plaintext" }}>
                {transcriptQuotes.map((q, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
                    <Quote className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ lineHeight: 1.9 }}>{q.text}</p>
                      <span className="mt-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                        {q.theme}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
