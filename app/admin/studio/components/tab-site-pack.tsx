"use client"

import { useState } from "react"
import {
  Globe, Loader2, AlertCircle, RefreshCw,
  BookOpen, FileText, CheckCircle2,
  MessageSquareQuote, Link2,
  Type, Check, Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSession, useContent, useWebsitePkg } from "../contexts"
import { AI_STATUS_LABELS, CopyButton } from "./shared"
import { WebPkgEditableField } from "./editable-fields"

export function TabSitePack() {
  const { session } = useSession()
  const { aiOutput } = useContent()
  const {
    websitePkgStatus, websitePkgError, generateWebsitePackage,
    selectedTitle, setSelectedTitle,
    heroSummary, fullSummary, takeaways, quotes, resources,
    selectedQuoteIndices, selectedTakeawayIndices,
    setHeroSummary, setFullSummary, setTakeaways,
    setSelectedQuoteIndices, setSelectedTakeawayIndices,
    debouncedSaveWebPkg,
  } = useWebsitePkg()

  const [customTitleInput, setCustomTitleInput] = useState("")
  const [showCustomInput, setShowCustomInput] = useState(false)

  const statusInfo = AI_STATUS_LABELS[websitePkgStatus]

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/30 bg-card/50 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-emerald-700" />
            <h2 className="text-[13px] font-semibold">حزمة الموقع</h2>
          </div>
          <span className={cn("rounded-md px-2.5 py-0.5 text-[11px] font-medium", statusInfo.className)}>
            {statusInfo.label}
          </span>
        </div>

        {websitePkgStatus === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ولّد محتوى شامل لصفحة الحلقة على الموقع: ملخص، أفكار رئيسية، اقتباسات، مصادر
            </p>
            <Button onClick={generateWebsitePackage} className="gap-2">
              <Globe className="h-4 w-4" />
              توليد حزمة الموقع
            </Button>
          </div>
        )}

        {websitePkgStatus === "generating" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-700" />
            <span className="text-sm text-muted-foreground">جارٍ تحليل النص وتوليد محتوى الموقع...</span>
            <span className="text-xs text-muted-foreground">قد يستغرق هذا حتى دقيقتين</span>
          </div>
        )}

        {websitePkgStatus === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-700 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{websitePkgError}</p>
            </div>
            <Button variant="outline" onClick={generateWebsitePackage} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        )}

        {websitePkgStatus === "ready" && (
          <div className="space-y-6">
            {/* Title Selector */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4 text-violet-700" />
                <span className="text-sm font-medium">عنوان الحلقة</span>
              </div>

              {/* Collect all title options */}
              {(() => {
                const options: { label: string; value: string }[] = []
                const originalTitle = session.video_title || ""
                if (originalTitle) {
                  options.push({ label: "العنوان الأصلي", value: originalTitle })
                }
                if (aiOutput?.title_best && aiOutput.title_best !== originalTitle) {
                  options.push({ label: "اقتراح AI الأفضل", value: aiOutput.title_best })
                }
                if (aiOutput?.title_alternatives) {
                  aiOutput.title_alternatives.forEach((alt, i) => {
                    if (alt && alt !== originalTitle && alt !== aiOutput.title_best) {
                      options.push({ label: `بديل ${i + 1}`, value: alt })
                    }
                  })
                }
                // If selectedTitle is custom (not in any option), add it
                const isCustom = selectedTitle && !options.some(o => o.value === selectedTitle)

                return (
                  <div className="space-y-2">
                    {options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedTitle(opt.value)
                          debouncedSaveWebPkg({ custom_title: opt.value })
                          setShowCustomInput(false)
                        }}
                        className={cn(
                          "w-full flex items-start gap-3 rounded-lg border p-3 text-right transition-colors",
                          selectedTitle === opt.value
                            ? "border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30"
                            : "border-border hover:bg-muted/50"
                        )}
                      >
                        <div className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          selectedTitle === opt.value
                            ? "border-violet-500 bg-violet-500"
                            : "border-muted-foreground/30"
                        )}>
                          {selectedTitle === opt.value && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] text-muted-foreground">{opt.label}</span>
                          <p className="text-sm" dir="rtl">{opt.value}</p>
                        </div>
                      </button>
                    ))}

                    {/* Custom title option */}
                    <button
                      onClick={() => setShowCustomInput(true)}
                      className={cn(
                        "w-full flex items-start gap-3 rounded-lg border p-3 text-right transition-colors",
                        isCustom && !showCustomInput
                          ? "border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30"
                          : "border-dashed border-border hover:bg-muted/50"
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        isCustom
                          ? "border-violet-500 bg-violet-500"
                          : "border-muted-foreground/30"
                      )}>
                        {isCustom ? <Check className="h-3 w-3 text-white" /> : <Pencil className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] text-muted-foreground">عنوان مخصص</span>
                        {isCustom && !showCustomInput && (
                          <p className="text-sm" dir="rtl">{selectedTitle}</p>
                        )}
                      </div>
                    </button>

                    {showCustomInput && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customTitleInput}
                          onChange={(e) => setCustomTitleInput(e.target.value)}
                          placeholder="اكتب عنوان مخصص..."
                          dir="rtl"
                          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/20"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && customTitleInput.trim()) {
                              setSelectedTitle(customTitleInput.trim())
                              debouncedSaveWebPkg({ custom_title: customTitleInput.trim() })
                              setShowCustomInput(false)
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          disabled={!customTitleInput.trim()}
                          onClick={() => {
                            setSelectedTitle(customTitleInput.trim())
                            debouncedSaveWebPkg({ custom_title: customTitleInput.trim() })
                            setShowCustomInput(false)
                          }}
                        >
                          تأكيد
                        </Button>
                      </div>
                    )}

                    {selectedTitle && selectedTitle !== originalTitle && (
                      <p className="text-xs text-violet-700 dark:text-violet-400">
                        سيتم استخدام هذا العنوان عند النشر إلى صفحة الحلقة
                      </p>
                    )}
                  </div>
                )
              })()}
            </div>

            <div className="border-t border-border/30" />

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
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  <span className="text-sm font-medium">
                    أبرز الأفكار ({selectedTakeawayIndices.size}/{takeaways.length})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const allSelected = selectedTakeawayIndices.size === takeaways.length
                      const next = allSelected ? new Set<number>() : new Set(takeaways.map((_, i) => i))
                      setSelectedTakeawayIndices(next)
                      debouncedSaveWebPkg({ selected_takeaway_indices: [...next] })
                    }}
                    className="text-[10px] text-primary hover:underline"
                  >
                    {selectedTakeawayIndices.size === takeaways.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
                  </button>
                  <CopyButton onClick={() => handleCopy(
                    takeaways.filter((_, i) => selectedTakeawayIndices.has(i)).join("\n")
                  )} />
                </div>
              </div>
              <div className="space-y-1.5">
                {takeaways.map((item, idx) => {
                  const isSelected = selectedTakeawayIndices.has(idx)
                  return (
                    <div key={idx} className={cn(
                      "flex items-start gap-2 rounded-lg transition-colors",
                      !isSelected && "opacity-40"
                    )}>
                      <button
                        onClick={() => {
                          const next = new Set(selectedTakeawayIndices)
                          if (next.has(idx)) next.delete(idx)
                          else next.add(idx)
                          setSelectedTakeawayIndices(next)
                          debouncedSaveWebPkg({ selected_takeaway_indices: [...next] })
                        }}
                        className={cn(
                          "mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                          isSelected
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-muted-foreground/30 hover:border-muted-foreground/50"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </button>
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
                  )
                })}
              </div>
              {selectedTakeawayIndices.size < takeaways.length && (
                <p className="text-[10px] text-muted-foreground">
                  {takeaways.length - selectedTakeawayIndices.size} فكرة لن تظهر على الموقع
                </p>
              )}
            </div>

            {/* Quotes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquareQuote className="h-4 w-4 text-amber-700" />
                  <span className="text-sm font-medium">
                    اقتباسات ({selectedQuoteIndices.size}/{quotes.length})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const allSelected = selectedQuoteIndices.size === quotes.length
                      const next = allSelected ? new Set<number>() : new Set(quotes.map((_, i) => i))
                      setSelectedQuoteIndices(next)
                      debouncedSaveWebPkg({ selected_quote_indices: [...next] })
                    }}
                    className="text-[10px] text-primary hover:underline"
                  >
                    {selectedQuoteIndices.size === quotes.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
                  </button>
                  <CopyButton onClick={() => handleCopy(
                    quotes.filter((_, i) => selectedQuoteIndices.has(i)).map(q => q.text).join("\n\n")
                  )} />
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto space-y-2 rounded-lg border p-3">
                {quotes.map((q, idx) => {
                  const isSelected = selectedQuoteIndices.has(idx)
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-start gap-2 rounded-lg p-3 transition-colors cursor-pointer",
                        isSelected
                          ? "bg-amber-50/50 dark:bg-amber-950/10 ring-1 ring-amber-200/50 dark:ring-amber-900/30"
                          : "bg-muted/20 opacity-40"
                      )}
                      onClick={() => {
                        const next = new Set(selectedQuoteIndices)
                        if (next.has(idx)) next.delete(idx)
                        else next.add(idx)
                        setSelectedQuoteIndices(next)
                        debouncedSaveWebPkg({ selected_quote_indices: [...next] })
                      }}
                    >
                      <div className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                        isSelected
                          ? "border-amber-500 bg-amber-500"
                          : "border-muted-foreground/30"
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
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
                  )
                })}
              </div>
              {selectedQuoteIndices.size < quotes.length && (
                <p className="text-[10px] text-muted-foreground">
                  {quotes.length - selectedQuoteIndices.size} اقتباس لن يظهر على الموقع
                </p>
              )}
            </div>

            {/* Resources */}
            {resources.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-indigo-700" />
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
            <div className="border-t border-border/30 pt-4">
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
