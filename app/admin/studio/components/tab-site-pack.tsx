"use client"

import {
  Globe, Loader2, AlertCircle, RefreshCw,
  BookOpen, FileText, CheckCircle2, Tag,
  MessageSquareQuote, Quote, Link2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudioSession } from "./studio-context"
import { AI_STATUS_LABELS, CopyButton } from "./shared"
import { WebPkgEditableField } from "./editable-fields"

export function TabSitePack() {
  const {
    websitePkgStatus, websitePkgError, generateWebsitePackage,
    heroSummary, fullSummary, takeaways, topics, quotes, resources,
    setHeroSummary, setFullSummary, setTakeaways, setTopics,
    debouncedSaveWebPkg,
  } = useStudioSession()

  const statusInfo = AI_STATUS_LABELS[websitePkgStatus]

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-emerald-500" />
            <h2 className="font-semibold">حزمة الموقع</h2>
          </div>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusInfo.className)}>
            {statusInfo.label}
          </span>
        </div>

        {websitePkgStatus === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ولّد محتوى شامل لصفحة الحلقة على الموقع: ملخص، أفكار رئيسية، اقتباسات، مواضيع، مصادر
            </p>
            <Button onClick={generateWebsitePackage} className="gap-2">
              <Globe className="h-4 w-4" />
              توليد حزمة الموقع
            </Button>
          </div>
        )}

        {websitePkgStatus === "generating" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            <span className="text-sm text-muted-foreground">جارٍ تحليل النص وتوليد محتوى الموقع...</span>
            <span className="text-xs text-muted-foreground/60">قد يستغرق هذا حتى دقيقتين</span>
          </div>
        )}

        {websitePkgStatus === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{websitePkgError}</p>
            </div>
            <Button variant="outline" onClick={generateWebsitePackage} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        )}

        {websitePkgStatus === "ready" && (
          <div className="space-y-6">
            {/* Hero Summary */}
            <WebPkgEditableField
              label="ملخص قصير (Hero)"
              icon={<BookOpen className="h-4 w-4" />}
              value={heroSummary}
              type="textarea"
              rows={2}
              onChange={(val) => { setHeroSummary(val); debouncedSaveWebPkg({ hero_summary: val }) }}
              onCopy={() => handleCopy(heroSummary)}
            />

            {/* Full Summary */}
            <WebPkgEditableField
              label="ملخص شامل"
              icon={<FileText className="h-4 w-4" />}
              value={fullSummary}
              type="textarea"
              rows={6}
              onChange={(val) => { setFullSummary(val); debouncedSaveWebPkg({ full_summary: val }) }}
              onCopy={() => handleCopy(fullSummary)}
            />

            {/* Takeaways */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">أبرز الأفكار ({takeaways.length})</span>
                </div>
                <CopyButton onClick={() => handleCopy(takeaways.join("\n"))} />
              </div>
              <div className="space-y-1.5">
                {takeaways.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="shrink-0 w-5 text-xs text-muted-foreground text-center mt-2">{idx + 1}</span>
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const updated = [...takeaways]
                        updated[idx] = e.target.value
                        setTakeaways(updated)
                        debouncedSaveWebPkg({ takeaways: updated })
                      }}
                      dir="rtl"
                      className="flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Topics */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">المواضيع ({topics.length})</span>
                </div>
                <CopyButton onClick={() => handleCopy(topics.join("، "))} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((topic, idx) => (
                  <span key={idx} className="inline-flex rounded-full bg-blue-100 dark:bg-blue-950 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                    {topic}
                  </span>
                ))}
              </div>
            </div>

            {/* Quotes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquareQuote className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">اقتباسات ({quotes.length})</span>
                </div>
                <CopyButton onClick={() => handleCopy(quotes.map(q => q.text).join("\n\n"))} />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2 rounded-lg border p-3">
                {quotes.map((q, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-lg bg-muted/30 p-3">
                    <Quote className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm" dir="rtl">{q.text}</p>
                      <div className="flex items-center gap-2">
                        {q.theme && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{q.theme}</span>
                        )}
                        {q.speaker && (
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            q.speaker === "guest" ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                          )}>
                            {q.speaker === "guest" ? "الضيف" : "المقدم"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resources */}
            {resources.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm font-medium">المصادر ({resources.length})</span>
                  </div>
                  <CopyButton onClick={() => handleCopy(resources.map(r => `${r.title}${r.url ? `: ${r.url}` : ""}`).join("\n"))} />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-lg border p-3">
                  {resources.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      {r.type && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">{r.type}</span>
                      )}
                      <span dir="rtl">{r.title}</span>
                      {r.url && (
                        <span className="text-xs text-muted-foreground font-mono truncate" dir="ltr">{r.url}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Re-generate */}
            <div className="border-t pt-4">
              <Button variant="outline" onClick={generateWebsitePackage} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                إعادة التوليد
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
