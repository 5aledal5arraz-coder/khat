"use client"

import { useState } from "react"
import {
  Loader2, AlertCircle, Check,
  Wand2, BookOpen, ListChecks, Quote,
  RefreshCw, CheckCircle2, ChevronDown, ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranscript } from "../contexts"
import { PROCESSING_STATUS_LABELS, CopyButton } from "./shared"

function SectionRegenerateButton({
  section,
  label,
}: {
  section: "quotes" | "key_ideas" | "lessons"
  label: string
}) {
  const { regeneratingSection, regenerateSection } = useTranscript()
  const isRegenerating = regeneratingSection === section
  const isOtherRegenerating = regeneratingSection !== null && regeneratingSection !== section

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => regenerateSection(section)}
      disabled={isRegenerating || isOtherRegenerating}
      className="gap-1.5"
    >
      {isRegenerating ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      {isRegenerating ? "جارٍ التوليد..." : label}
    </Button>
  )
}

export function AiProcessingContent() {
  const {
    transcript, transcriptStatus,
    processingStatus, processingError,
    transcriptArticle, transcriptSummary, transcriptQuotes,
    processTranscript,
    regenerateSectionError,
    setTranscriptQuotes, setTranscriptSummary,
    saveTranscriptEdits,
  } = useTranscript()

  const [showArticle, setShowArticle] = useState(true)
  const [showSummary, setShowSummary] = useState(true)
  const [showQuotes, setShowQuotes] = useState(true)
  const [editingQuoteIdx, setEditingQuoteIdx] = useState<number | null>(null)
  const [editingIdeaIdx, setEditingIdeaIdx] = useState<number | null>(null)
  const [editingLessonIdx, setEditingLessonIdx] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)

  const handleSave = async () => {
    await saveTranscriptEdits()
    setDirty(false)
  }

  const updateQuote = (idx: number, field: "text" | "theme", value: string) => {
    if (!transcriptQuotes) return
    const updated = [...transcriptQuotes]
    updated[idx] = { ...updated[idx], [field]: value }
    setTranscriptQuotes(updated)
    setDirty(true)
  }

  const deleteQuote = (idx: number) => {
    if (!transcriptQuotes) return
    setTranscriptQuotes(transcriptQuotes.filter((_, i) => i !== idx))
    setEditingQuoteIdx(null)
    setDirty(true)
  }

  const updateIdea = (idx: number, value: string) => {
    if (!transcriptSummary) return
    const updated = [...transcriptSummary.key_ideas]
    updated[idx] = value
    setTranscriptSummary({ ...transcriptSummary, key_ideas: updated })
    setDirty(true)
  }

  const deleteIdea = (idx: number) => {
    if (!transcriptSummary) return
    setTranscriptSummary({
      ...transcriptSummary,
      key_ideas: transcriptSummary.key_ideas.filter((_, i) => i !== idx),
    })
    setEditingIdeaIdx(null)
    setDirty(true)
  }

  const updateLesson = (idx: number, value: string) => {
    if (!transcriptSummary) return
    const updated = [...transcriptSummary.lessons]
    updated[idx] = value
    setTranscriptSummary({ ...transcriptSummary, lessons: updated })
    setDirty(true)
  }

  const deleteLesson = (idx: number) => {
    if (!transcriptSummary) return
    setTranscriptSummary({
      ...transcriptSummary,
      lessons: transcriptSummary.lessons.filter((_, i) => i !== idx),
    })
    setEditingLessonIdx(null)
    setDirty(true)
  }

  if (transcriptStatus !== "ready" || !transcript) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        اجلب النص التلقائي أولاً لتتمكن من المعالجة
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <Button size="sm" onClick={handleSave} className="gap-1.5 bg-green-600 hover:bg-green-700">
            <Check className="h-3.5 w-3.5" />
            حفظ التعديلات
          </Button>
        )}
        <span className={cn("rounded-md px-2.5 py-0.5 text-[11px] font-medium", PROCESSING_STATUS_LABELS[processingStatus].className)}>
          {PROCESSING_STATUS_LABELS[processingStatus].label}
        </span>
      </div>

      {regenerateSectionError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-700 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{regenerateSectionError}</p>
        </div>
      )}

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

      {processingStatus === "generating" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-violet-700" />
          <span className="text-sm text-muted-foreground">جارٍ معالجة النص بالذكاء الاصطناعي...</span>
          <span className="text-xs text-muted-foreground">قد تستغرق هذه العملية دقيقة أو أكثر</span>
        </div>
      )}

      {processingStatus === "error" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-700 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-400">{processingError || "فشل في المعالجة"}</p>
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
              إعادة المعالجة الكاملة
            </Button>
          </div>

          {/* Clean Article Section */}
          <div className="rounded-lg border border-border/30">
            <button
              onClick={() => setShowArticle(!showArticle)}
              className="flex w-full items-center justify-between p-4 text-right hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-violet-700" />
                <span className="text-[13px] font-semibold">المقال المقروء</span>
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

          {/* Key Ideas Section */}
          <div className="rounded-lg border border-border/30">
            <button
              onClick={() => setShowSummary(!showSummary)}
              className="flex w-full items-center justify-between p-4 text-right hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-blue-700" />
                <span className="text-[13px] font-semibold">الملخص المُهيكل</span>
              </div>
              {showSummary ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showSummary && transcriptSummary && (
              <div className="border-t p-4 space-y-5" dir="rtl" lang="ar" style={{ textAlign: "right", unicodeBidi: "plaintext" }}>
                {/* Overview */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">نظرة عامة</h4>
                  <p className="text-sm" style={{ lineHeight: 1.9 }}>{transcriptSummary.overview}</p>
                </div>

                {/* Key Ideas */}
                {transcriptSummary.key_ideas.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-muted-foreground">الأفكار الرئيسية</h4>
                      <SectionRegenerateButton section="key_ideas" label="إعادة توليد الأفكار" />
                    </div>
                    <ul className="space-y-2">
                      {transcriptSummary.key_ideas.map((idea, i) => (
                        <li key={i} className="group/item flex items-start gap-2 text-sm">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                          {editingIdeaIdx === i ? (
                            <div className="flex-1 space-y-1.5">
                              <textarea
                                value={idea}
                                onChange={(e) => updateIdea(i, e.target.value)}
                                className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                dir="rtl"
                                rows={2}
                              />
                              <div className="flex gap-1.5">
                                <Button size="sm" variant="outline" onClick={() => setEditingIdeaIdx(null)} className="h-7 px-2 text-xs">تم</Button>
                                <Button size="sm" variant="outline" onClick={() => deleteIdea(i)} className="h-7 px-2 text-xs text-red-700 hover:text-red-700">حذف</Button>
                              </div>
                            </div>
                          ) : (
                            <span
                              className="flex-1 cursor-pointer rounded px-1 -mx-1 transition-colors hover:bg-muted/40"
                              onClick={() => setEditingIdeaIdx(i)}
                              title="اضغط للتعديل"
                              style={{ lineHeight: 1.9 }}
                            >
                              {idea}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Lessons */}
                {transcriptSummary.lessons.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-muted-foreground">دروس عملية</h4>
                      <SectionRegenerateButton section="lessons" label="إعادة توليد الدروس" />
                    </div>
                    <ul className="space-y-2">
                      {transcriptSummary.lessons.map((lesson, i) => (
                        <li key={i} className="group/item flex items-start gap-2 text-sm">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-700" />
                          {editingLessonIdx === i ? (
                            <div className="flex-1 space-y-1.5">
                              <textarea
                                value={lesson}
                                onChange={(e) => updateLesson(i, e.target.value)}
                                className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                dir="rtl"
                                rows={2}
                              />
                              <div className="flex gap-1.5">
                                <Button size="sm" variant="outline" onClick={() => setEditingLessonIdx(null)} className="h-7 px-2 text-xs">تم</Button>
                                <Button size="sm" variant="outline" onClick={() => deleteLesson(i)} className="h-7 px-2 text-xs text-red-700 hover:text-red-700">حذف</Button>
                              </div>
                            </div>
                          ) : (
                            <span
                              className="flex-1 cursor-pointer rounded px-1 -mx-1 transition-colors hover:bg-muted/40"
                              onClick={() => setEditingLessonIdx(i)}
                              title="اضغط للتعديل"
                              style={{ lineHeight: 1.9 }}
                            >
                              {lesson}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quotes Section */}
          <div className="rounded-lg border border-border/30">
            <button
              onClick={() => setShowQuotes(!showQuotes)}
              className="flex w-full items-center justify-between p-4 text-right hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Quote className="h-4 w-4 text-amber-700" />
                <span className="text-[13px] font-semibold">اقتباسات مستخرجة</span>
                {transcriptQuotes && (
                  <span className="text-xs text-muted-foreground">({transcriptQuotes.length})</span>
                )}
              </div>
              {showQuotes ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showQuotes && transcriptQuotes && transcriptQuotes.length > 0 && (
              <div className="border-t p-4 space-y-3" dir="rtl" lang="ar" style={{ textAlign: "right", unicodeBidi: "plaintext" }}>
                <div className="flex justify-end mb-1">
                  <SectionRegenerateButton section="quotes" label="إعادة توليد الاقتباسات" />
                </div>
                {transcriptQuotes.map((q, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
                    <Quote className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div className="flex-1 min-w-0">
                      {editingQuoteIdx === i ? (
                        <div className="space-y-2">
                          <textarea
                            value={q.text}
                            onChange={(e) => updateQuote(i, "text", e.target.value)}
                            className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            dir="rtl"
                            rows={3}
                          />
                          <input
                            type="text"
                            value={q.theme}
                            onChange={(e) => updateQuote(i, "theme", e.target.value)}
                            className="w-40 rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                            dir="rtl"
                            placeholder="التصنيف"
                          />
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => setEditingQuoteIdx(null)} className="h-7 px-2 text-xs">تم</Button>
                            <Button size="sm" variant="outline" onClick={() => deleteQuote(i)} className="h-7 px-2 text-xs text-red-700 hover:text-red-700">حذف</Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="cursor-pointer rounded px-1 -mx-1 transition-colors hover:bg-muted/40"
                          onClick={() => setEditingQuoteIdx(i)}
                          title="اضغط للتعديل"
                        >
                          <p className="text-sm" style={{ lineHeight: 1.9 }}>{q.text}</p>
                          <span className="mt-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                            {q.theme}
                          </span>
                        </div>
                      )}
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
