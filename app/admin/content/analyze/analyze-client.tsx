"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Brain,
  Quote,
  Compass,
  BookOpen,
  Tags,
  Link2,
  X,
  RotateCcw,
  Play,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AnalyzeClientProps {
  hasExistingMap: boolean
  lastAnalyzedAt: string | null
  episodeCount: number
  topicCount: number
  season1Count: number
  season2Count: number
}

interface ProgressState {
  step: string
  detail: string
  percent: number
}

interface FinalStats {
  episodes_analyzed: number
  season_1: number
  season_2: number
  quotes_created: number
  reflections_created: number
  topics_created: number
  paths_populated: number
  relationships_computed: number
}

const STEP_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  loading: { label: "تحميل الحلقات", icon: BookOpen },
  enrichments: { label: "تحميل الإثراءات", icon: Tags },
  ai: { label: "تحليل بالذكاء الاصطناعي", icon: Brain },
  map: { label: "بناء خريطة المعرفة", icon: Link2 },
  populate: { label: "ملء الصفحة الرئيسية", icon: Compass },
}

export function AnalyzeClient({
  hasExistingMap,
  lastAnalyzedAt,
  episodeCount,
  topicCount,
  season1Count,
  season2Count,
}: AnalyzeClientProps) {
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState<ProgressState>({ step: "", detail: "", percent: 0 })
  const [isDone, setIsDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<FinalStats | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setError(null)
    setIsDone(false)
    setStats(null)
    setProgress({ step: "loading", detail: "جارٍ البدء...", percent: 0 })
    setLogs([])

    try {
      const res = await fetch("/api/admin/content/analyze-home", { method: "POST" })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "فشل في بدء التحليل")
        return
      }

      if (!res.body) {
        setError("المتصفح لا يدعم البث المباشر")
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const dataLine = line.replace(/^data: /, "").trim()
          if (!dataLine) continue

          try {
            const event = JSON.parse(dataLine)

            if (event.type === "progress") {
              setProgress({
                step: event.step || "",
                detail: event.detail || "",
                percent: event.percent || 0,
              })
              if (event.detail) {
                setLogs((prev) => [...prev, event.detail])
              }
            } else if (event.type === "done") {
              setIsDone(true)
              setStats(event.stats || null)
              setProgress((prev) => ({ ...prev, percent: 100 }))
              setLogs((prev) => [...prev, "✓ اكتمل التحليل بنجاح"])
            } else if (event.type === "error") {
              setError(event.detail || "حدث خطأ أثناء التحليل")
              setLogs((prev) => [...prev, `✗ ${event.detail}`])
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch {
      setError("حدث خطأ في الاتصال")
    } finally {
      setAnalyzing(false)
    }
  }

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("ar-SA", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-6">
      {/* Existing Map Status */}
      {hasExistingMap && !analyzing && !isDone && (
        <div className="rounded-2xl border border-border/50 bg-card/80 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold">يوجد تحليل سابق</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                آخر تحليل: {lastAnalyzedAt ? formatDate(lastAnalyzedAt) : "غير معروف"}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-muted/30 p-3 text-center">
                  <span className="text-lg font-bold">{episodeCount}</span>
                  <p className="text-[10px] text-muted-foreground">حلقة</p>
                </div>
                <div className="rounded-xl bg-muted/30 p-3 text-center">
                  <span className="text-lg font-bold">{topicCount}</span>
                  <p className="text-[10px] text-muted-foreground">موضوع</p>
                </div>
                <div className="rounded-xl bg-muted/30 p-3 text-center">
                  <span className="text-lg font-bold">{season1Count}</span>
                  <p className="text-[10px] text-muted-foreground">الموسم الأول</p>
                </div>
                <div className="rounded-xl bg-muted/30 p-3 text-center">
                  <span className="text-lg font-bold">{season2Count}</span>
                  <p className="text-[10px] text-muted-foreground">الموسم الثاني</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Button */}
      {!analyzing && !isDone && (
        <div className="rounded-2xl border border-border/50 bg-gradient-to-bl from-violet-500/5 via-card/80 to-primary/5 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-500/10">
            <Brain className="h-8 w-8 text-violet-500" />
          </div>
          <h2 className="text-xl font-bold">
            {hasExistingMap ? "إعادة التحليل" : "تحليل الحلقات"}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            سيقوم الذكاء الاصطناعي بتحليل جميع حلقات الموسم الأول واستخراج المواضيع والعلاقات، ثم ملء الصفحة الرئيسية بمحتوى حقيقي (اقتباسات، تأملات، مسارات عاطفية، مواضيع).
          </p>
          <div className="mt-2 text-xs text-muted-foreground/60">
            سيتم إعطاء الأولوية لحلقات الموسم الثاني إن وُجدت
          </div>
          <Button
            onClick={handleAnalyze}
            size="lg"
            className="mt-6 gap-2 rounded-2xl bg-violet-600 px-8 text-white shadow-lg shadow-violet-600/20 hover:bg-violet-700"
          >
            {hasExistingMap ? (
              <>
                <RotateCcw className="h-5 w-5" />
                إعادة التحليل وتحديث الصفحة الرئيسية
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                بدء التحليل وملء الصفحة الرئيسية
              </>
            )}
          </Button>
        </div>
      )}

      {/* Progress Panel */}
      {(analyzing || isDone || error) && (
        <div className="rounded-2xl border border-border/50 bg-card/80 overflow-hidden">
          {/* Progress Header */}
          <div className="flex items-center justify-between border-b border-border/30 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-2xl",
                error ? "bg-red-500/10" : isDone ? "bg-green-500/10" : "bg-violet-500/10"
              )}>
                {error ? (
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                ) : isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                )}
              </div>
              <div>
                <h3 className="font-bold">
                  {error ? "حدث خطأ" : isDone ? "اكتمل التحليل" : "جارٍ التحليل..."}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {error || progress.detail}
                </p>
              </div>
            </div>
            {isDone && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setIsDone(false); setStats(null); setLogs([]) }}
                className="rounded-xl"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Progress Bar */}
          {!error && (
            <div className="px-6 py-3 border-b border-border/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(STEP_LABELS).map(([key, { label, icon: Icon }]) => {
                    const isActive = progress.step === key
                    const stepOrder = Object.keys(STEP_LABELS)
                    const isPast = stepOrder.indexOf(key) < stepOrder.indexOf(progress.step) || isDone
                    return (
                      <span
                        key={key}
                        className={cn(
                          "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all",
                          isActive && "bg-violet-500/20 text-violet-500",
                          isPast && "bg-green-500/10 text-green-500",
                          !isActive && !isPast && "text-muted-foreground/40"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                      </span>
                    )
                  })}
                </div>
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {progress.percent}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-violet-500 to-violet-400 transition-all duration-500 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Stats (when done) */}
          {isDone && stats && (
            <div className="grid grid-cols-2 gap-3 border-b border-border/30 px-6 py-4 sm:grid-cols-4">
              <StatCard icon={BookOpen} label="حلقات محللة" value={stats.episodes_analyzed} color="text-violet-500" />
              <StatCard icon={Quote} label="اقتباسات" value={stats.quotes_created} color="text-amber-500" />
              <StatCard icon={Sparkles} label="تأملات يومية" value={stats.reflections_created} color="text-cyan-500" />
              <StatCard icon={Tags} label="مواضيع" value={stats.topics_created} color="text-green-500" />
              <StatCard icon={Compass} label="مسارات" value={stats.paths_populated} color="text-indigo-500" />
              <StatCard icon={Link2} label="علاقات" value={stats.relationships_computed} color="text-pink-500" />
              <StatCard icon={BookOpen} label="الموسم الأول" value={stats.season_1} color="text-blue-500" />
              <StatCard icon={BookOpen} label="الموسم الثاني" value={stats.season_2} color="text-orange-500" />
            </div>
          )}

          {/* Log */}
          <div
            ref={logRef}
            className="max-h-64 overflow-y-auto px-6 py-4 space-y-1"
          >
            {logs.map((log, i) => (
              <p key={i} className="text-xs text-muted-foreground font-mono" dir="rtl">
                {log}
              </p>
            ))}
            {logs.length === 0 && !error && (
              <p className="text-xs text-muted-foreground/50 text-center py-4">
                في انتظار بدء التحليل...
              </p>
            )}
          </div>

          {/* Error retry */}
          {error && (
            <div className="flex justify-center border-t border-border/30 px-6 py-4">
              <Button onClick={handleAnalyze} variant="outline" className="gap-2 rounded-xl">
                <RotateCcw className="h-4 w-4" />
                إعادة المحاولة
              </Button>
            </div>
          )}

          {/* Done actions */}
          {isDone && (
            <div className="flex items-center justify-between border-t border-border/30 px-6 py-4">
              <p className="text-xs text-muted-foreground">
                تم تحديث: الاقتباسات، التأملات، المسارات العاطفية، والمواضيع
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAnalyze}
                  className="gap-1.5 rounded-xl text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  إعادة التحليل
                </Button>
                <Button
                  size="sm"
                  onClick={() => window.open("/", "_blank")}
                  className="gap-1.5 rounded-xl text-xs"
                >
                  عرض الصفحة الرئيسية
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number
  color: string
}) {
  return (
    <div className="rounded-xl bg-muted/20 p-3 text-center">
      <Icon className={cn("mx-auto h-4 w-4 mb-1", color)} />
      <span className="text-lg font-bold">{value}</span>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}
