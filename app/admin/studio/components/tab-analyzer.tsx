"use client"

import { useState } from "react"
import {
  BarChart3, Loader2, AlertCircle, RefreshCw,
  Copy, Check, ChevronDown, ChevronLeft,
  Lightbulb, Rocket, Scissors, Stethoscope,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudioSession } from "./studio-context"
import { AI_STATUS_LABELS, PLATFORM_COLORS } from "./shared"

function Section({
  icon: Icon,
  title,
  iconColor,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType
  title: string
  iconColor: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-start hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4.5 w-4.5", iconColor)} />
          <h3 className="font-medium text-sm">{title}</h3>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t px-4 pb-4 pt-3">{children}</div>}
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors shrink-0"
      title="نسخ"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  )
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  "ممتاز": "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  "جيد": "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  "متوسط": "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  "ضعيف": "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  "بحاجة لإنعاش": "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
}

export function TabAnalyzer() {
  const {
    analyzer, analyzerStatus, analyzerError,
    generateAnalyzer, session,
  } = useStudioSession()

  const [copiedAll, setCopiedAll] = useState(false)

  const statusInfo = AI_STATUS_LABELS[analyzerStatus]
  const data = analyzer?.data

  const isYouTube = session.source !== "audio"

  const handleCopyAll = async () => {
    if (!data) return
    const sections: string[] = []

    sections.push("## تشخيص الأداء")
    sections.push(`التصنيف: ${data.diagnosis.classification}`)
    sections.push(data.diagnosis.reasoning)
    sections.push(data.diagnosis.key_metrics_summary)

    sections.push("\n## اقتراحات التحسين")
    sections.push("عناوين بديلة:")
    data.improvements.alt_titles.forEach((t, i) => sections.push(`${i + 1}. ${t}`))
    sections.push(`\nالوصف المحسّن:\n${data.improvements.optimized_description}`)
    sections.push(`\nالفصول المقترحة:\n${data.improvements.chapters}`)
    sections.push(`\nالتعليق المثبت:\n${data.improvements.pinned_comment}`)
    sections.push("\nأفكار الصورة المصغرة:")
    data.improvements.thumbnail_concepts.forEach((c, i) => sections.push(`${i + 1}. ${c}`))

    sections.push("\n## خطة الإنعاش")
    data.revival.steps.forEach((s) => sections.push(`${s.order}. ${s.action}: ${s.detail}`))

    sections.push("\n## مقاطع قصيرة مقترحة")
    data.clips.forEach((c, i) => {
      sections.push(`${i + 1}. [${c.platform}] ${c.start_time} - ${c.end_time}`)
      sections.push(`   الخطاف: ${c.hook_text}`)
      sections.push(`   الوصف: ${c.caption}`)
    })

    await navigator.clipboard.writeText(sections.join("\n"))
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold">تحليل الأداء</h2>
          </div>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusInfo.className)}>
            {statusInfo.label}
          </span>
        </div>

        {analyzerStatus === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isYouTube
                ? "حلّل أداء الحلقة على يوتيوب واحصل على تقرير شامل مع اقتراحات للتحسين وخطة إنعاش"
                : "حلّل محتوى الحلقة واحصل على اقتراحات للتحسين ومقاطع قصيرة مقترحة"
              }
            </p>
            <Button onClick={generateAnalyzer} className="gap-2">
              <BarChart3 className="h-4 w-4" />
              بدء التحليل
            </Button>
          </div>
        )}

        {analyzerStatus === "generating" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            <span className="text-sm text-muted-foreground">جارٍ تحليل الأداء وتوليد التقرير...</span>
          </div>
        )}

        {analyzerStatus === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{analyzerError}</p>
            </div>
            <Button variant="outline" onClick={generateAnalyzer} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        )}

        {analyzerStatus === "ready" && data && (
          <div className="space-y-4">
            {/* Copy all + regenerate */}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyAll} className="gap-1.5">
                {copiedAll ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedAll ? "تم النسخ" : "نسخ التقرير كاملاً"}
              </Button>
            </div>

            {/* Section 1: Diagnosis */}
            <Section icon={Stethoscope} title="تشخيص الأداء" iconColor="text-blue-500">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium",
                    CLASSIFICATION_COLORS[data.diagnosis.classification] || "bg-muted text-muted-foreground"
                  )}>
                    {data.diagnosis.classification}
                  </span>
                </div>
                <p className="text-sm leading-relaxed" dir="rtl">{data.diagnosis.reasoning}</p>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-sm text-muted-foreground" dir="rtl">{data.diagnosis.key_metrics_summary}</p>
                </div>
              </div>
            </Section>

            {/* Section 2: Improvements */}
            <Section icon={Lightbulb} title="اقتراحات التحسين" iconColor="text-yellow-500">
              <div className="space-y-4">
                {/* Alt titles */}
                {data.improvements.alt_titles.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-medium text-muted-foreground">عناوين بديلة</h4>
                      <CopyBtn text={data.improvements.alt_titles.join("\n")} />
                    </div>
                    <div className="space-y-1.5">
                      {data.improvements.alt_titles.map((title, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2">
                          <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{i + 1}.</span>
                          <p className="text-sm" dir="rtl">{title}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Optimized description */}
                {data.improvements.optimized_description && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-medium text-muted-foreground">الوصف المحسّن</h4>
                      <CopyBtn text={data.improvements.optimized_description} />
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-sm leading-relaxed whitespace-pre-line" dir="rtl">
                        {data.improvements.optimized_description}
                      </p>
                    </div>
                  </div>
                )}

                {/* Chapters */}
                {data.improvements.chapters && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-medium text-muted-foreground">فصول مقترحة</h4>
                      <CopyBtn text={data.improvements.chapters} />
                    </div>
                    <div className="rounded-lg border p-3">
                      <pre className="text-sm whitespace-pre-line font-sans" dir="rtl">
                        {data.improvements.chapters}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Pinned comment */}
                {data.improvements.pinned_comment && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-medium text-muted-foreground">تعليق مثبت مقترح</h4>
                      <CopyBtn text={data.improvements.pinned_comment} />
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-sm leading-relaxed whitespace-pre-line" dir="rtl">
                        {data.improvements.pinned_comment}
                      </p>
                    </div>
                  </div>
                )}

                {/* Thumbnail concepts */}
                {data.improvements.thumbnail_concepts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground">أفكار الصورة المصغرة</h4>
                    <div className="flex flex-wrap gap-2">
                      {data.improvements.thumbnail_concepts.map((concept, i) => (
                        <span key={i} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                          {concept}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* Section 3: Revival */}
            <Section icon={Rocket} title="خطة الإنعاش" iconColor="text-green-500">
              <div className="space-y-2">
                <div className="flex justify-end">
                  <CopyBtn text={data.revival.steps.map(s => `${s.order}. ${s.action}: ${s.detail}`).join("\n")} />
                </div>
                <div className="space-y-2">
                  {data.revival.steps.map((step) => (
                    <div key={step.order} className="flex gap-3 rounded-lg border p-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700 dark:bg-green-950 dark:text-green-400">
                        {step.order}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium" dir="rtl">{step.action}</p>
                        <p className="text-sm text-muted-foreground" dir="rtl">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* Section 4: Clips */}
            {data.clips.length > 0 && (
              <Section icon={Scissors} title="مقاطع قصيرة مقترحة" iconColor="text-purple-500" defaultOpen={false}>
                <div className="space-y-3">
                  {data.clips.map((clip, idx) => (
                    <div key={idx} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", PLATFORM_COLORS[clip.platform] || "bg-muted text-muted-foreground")}>
                            {clip.platform}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground" dir="ltr">
                            {clip.start_time} — {clip.end_time}
                          </span>
                        </div>
                        <CopyBtn text={`[${clip.platform}] ${clip.start_time} - ${clip.end_time}\nالخطاف: ${clip.hook_text}\nالوصف: ${clip.caption}\nلماذا ينجح: ${clip.why_it_works}`} />
                      </div>
                      <div className="space-y-1" dir="rtl">
                        <p className="text-sm font-medium">{clip.hook_text}</p>
                        <p className="text-sm text-muted-foreground">{clip.caption}</p>
                        <p className="text-xs text-muted-foreground/70 italic">{clip.why_it_works}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Regenerate */}
            <div className="border-t pt-4">
              <Button variant="outline" onClick={generateAnalyzer} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                إعادة التحليل
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
