"use client"

import { useState } from "react"
import {
  Brain, Loader2, AlertCircle, RefreshCw,
  ChevronDown, ChevronLeft, Lightbulb, MessageSquareQuote,
  Scale, Sparkles, BookOpen, HelpCircle, Map, TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useDeepAnalysis, useTranscript } from "../contexts"

function SubSection({
  icon: Icon,
  iconColor,
  title,
  children,
  defaultOpen = false,
}: {
  icon: React.ElementType
  iconColor: string
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-border/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-3 text-start hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", iconColor)} />
          <h4 className="text-[13px] font-semibold">{title}</h4>
        </div>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border/30 px-4 py-3">{children}</div>}
    </div>
  )
}

export function TabDeepAnalysis() {
  const { deepAnalysis, deepAnalysisStatus, deepAnalysisError, generateDeepAnalysis } = useDeepAnalysis()
  const { transcriptStatus } = useTranscript()

  if (transcriptStatus !== "ready") {
    return (
      <div className="py-8 text-center">
        <Brain className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">يجب استخراج النص أولاً لتشغيل التحليل العميق</p>
      </div>
    )
  }

  if (deepAnalysisStatus === "idle" || (!deepAnalysis && deepAnalysisStatus !== "generating")) {
    return (
      <div className="py-8 text-center space-y-4">
        <Brain className="h-10 w-10 mx-auto text-indigo-700/60" />
        <div>
          <p className="text-sm font-medium">التحليل العميق للمحتوى</p>
          <p className="text-xs text-muted-foreground mt-1">
            تحليل المحاور والأطروحات والحجج واللحظات العاطفية والدروس المستفادة
          </p>
        </div>
        <Button onClick={generateDeepAnalysis} size="sm" className="gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          بدء التحليل
        </Button>
      </div>
    )
  }

  if (deepAnalysisStatus === "generating") {
    return (
      <div className="py-8 text-center space-y-3">
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-indigo-700" />
        <p className="text-sm text-muted-foreground">جارٍ التحليل العميق...</p>
      </div>
    )
  }

  if (deepAnalysisStatus === "error") {
    return (
      <div className="py-6 space-y-3">
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-700 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{deepAnalysisError}</p>
        </div>
        <Button onClick={generateDeepAnalysis} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  const d = deepAnalysis!

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">تحليل عميق للمحتوى</span>
        <Button onClick={generateDeepAnalysis} variant="ghost" size="sm" className="gap-1.5 h-7 text-xs">
          <RefreshCw className="h-3 w-3" />
          إعادة التحليل
        </Button>
      </div>

      {/* Thesis */}
      {d.thesis && (
        <div className="rounded-lg border bg-indigo-50/50 p-4 dark:bg-indigo-950/20">
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400 mb-1">الأطروحة الرئيسية</p>
          <p className="text-sm leading-relaxed">{d.thesis}</p>
        </div>
      )}

      {/* Conversation Arc */}
      {d.conversation_arc && (
        <SubSection icon={TrendingUp} iconColor="text-blue-700" title="مسار المحادثة" defaultOpen>
          <p className="text-sm leading-relaxed text-muted-foreground">{d.conversation_arc}</p>
        </SubSection>
      )}

      {/* Themes */}
      {d.themes && d.themes.length > 0 && (
        <SubSection icon={Map} iconColor="text-emerald-700" title={`المحاور (${d.themes.length})`} defaultOpen>
          <div className="space-y-3">
            {d.themes.map((theme, i) => (
              <div key={i} className="space-y-1">
                <p className="text-sm font-medium">{theme.name}</p>
                <p className="text-xs text-muted-foreground">{theme.description}</p>
                {theme.evidence?.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {theme.evidence.map((e, j) => (
                      <li key={j} className="text-xs text-muted-foreground/80 pr-3 before:content-['•'] before:ml-2 before:text-muted-foreground">{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {/* Arguments */}
      {d.arguments && d.arguments.length > 0 && (
        <SubSection icon={Scale} iconColor="text-amber-700" title={`الحجج (${d.arguments.length})`}>
          <div className="space-y-3">
            {d.arguments.map((arg, i) => (
              <div key={i} className="space-y-1 rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium">{arg.claim}</p>
                {arg.supporting_evidence?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mt-1">أدلة داعمة:</p>
                    <ul className="space-y-0.5">
                      {arg.supporting_evidence.map((e, j) => (
                        <li key={j} className="text-xs text-muted-foreground/80 pr-3">• {e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {arg.counter_points?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mt-1">نقاط مقابلة:</p>
                    <ul className="space-y-0.5">
                      {arg.counter_points.map((c, j) => (
                        <li key={j} className="text-xs text-muted-foreground/80 pr-3">• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {/* Emotional Moments */}
      {d.emotional_moments && d.emotional_moments.length > 0 && (
        <SubSection icon={Sparkles} iconColor="text-pink-700" title={`لحظات عاطفية (${d.emotional_moments.length})`}>
          <div className="space-y-2">
            {d.emotional_moments.map((m, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-medium text-pink-700 dark:bg-pink-950/40 dark:text-pink-400">
                    {m.emotion}
                  </span>
                  {m.timestamp_approx && (
                    <span className="text-[10px] text-muted-foreground">{m.timestamp_approx}</span>
                  )}
                </div>
                <p className="text-sm">{m.description}</p>
                {m.quote && (
                  <blockquote className="border-r-2 border-pink-300 pr-3 text-xs text-muted-foreground italic">
                    &ldquo;{m.quote}&rdquo;
                  </blockquote>
                )}
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {/* Lessons */}
      {d.lessons && d.lessons.length > 0 && (
        <SubSection icon={Lightbulb} iconColor="text-yellow-700" title={`الدروس المستفادة (${d.lessons.length})`}>
          <div className="space-y-2">
            {d.lessons.map((l, i) => (
              <div key={i} className="space-y-0.5">
                <p className="text-sm font-medium">{l.title}</p>
                <p className="text-xs text-muted-foreground">{l.explanation}</p>
                {l.applicability && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">التطبيق: {l.applicability}</p>
                )}
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {/* Contradictions */}
      {d.contradictions && d.contradictions.length > 0 && (
        <SubSection icon={HelpCircle} iconColor="text-orange-700" title={`التناقضات (${d.contradictions.length})`}>
          <div className="space-y-2">
            {d.contradictions.map((c, i) => (
              <div key={i} className="rounded-lg bg-orange-50/50 p-3 dark:bg-orange-950/20 space-y-1">
                <p className="text-xs font-medium text-orange-700 dark:text-orange-400">النقطة أ: <span className="font-normal">{c.point_a}</span></p>
                <p className="text-xs font-medium text-orange-700 dark:text-orange-400">النقطة ب: <span className="font-normal">{c.point_b}</span></p>
                {c.context && <p className="text-xs text-muted-foreground">السياق: {c.context}</p>}
              </div>
            ))}
          </div>
        </SubSection>
      )}

      {/* Open Questions */}
      {d.open_questions && d.open_questions.length > 0 && (
        <SubSection icon={MessageSquareQuote} iconColor="text-cyan-700" title={`أسئلة مفتوحة (${d.open_questions.length})`}>
          <ul className="space-y-1.5">
            {d.open_questions.map((q, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-cyan-700 shrink-0 mt-0.5">؟</span>
                {q}
              </li>
            ))}
          </ul>
        </SubSection>
      )}

      {/* Dialogue Map */}
      {d.dialogue_map && (
        <SubSection icon={BookOpen} iconColor="text-violet-700" title="خريطة الحوار">
          <div className="space-y-2">
            {d.dialogue_map.speakers?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">المتحدثون</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.dialogue_map.speakers.map((s, i) => (
                    <span key={i} className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {d.dialogue_map.dynamics && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">ديناميكيات</p>
                <p className="text-sm text-muted-foreground">{d.dialogue_map.dynamics}</p>
              </div>
            )}
            {d.dialogue_map.power_shifts?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">تحولات القوة</p>
                <ul className="space-y-0.5">
                  {d.dialogue_map.power_shifts.map((p, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• {p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SubSection>
      )}
    </div>
  )
}
