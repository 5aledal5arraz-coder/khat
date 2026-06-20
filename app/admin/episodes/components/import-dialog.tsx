"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Download,
  Loader2,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ShieldAlert,
  Plus,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  importEpisodesFromYouTube,
  type ImportEpisodesResult,
} from "../actions"
import { formatDate } from "@/lib/shared/formatters"

type ImportMode = "after" | "range"

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

interface ImportFromYoutubeButtonProps {
  categoriesCount?: number
}

export function ImportFromYoutubeButton(_props: ImportFromYoutubeButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ImportMode>("after")
  const [from, setFrom] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState<string>(isoToday())
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<ImportEpisodesResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    if (!from) return false
    if (mode === "range" && !to) return false
    if (mode === "range" && to && from && new Date(to) < new Date(from)) return false
    return true
  }, [from, to, mode])

  const reset = () => {
    setResult(null)
    setError(null)
  }

  const handleSubmit = () => {
    if (!canSubmit || isPending) return
    reset()
    startTransition(async () => {
      const res = await importEpisodesFromYouTube({
        from,
        to: mode === "range" ? to : null,
      })
      if (!res.success) {
        setError(res.error || "فشل الاستيراد")
        setResult(res)
        return
      }
      setResult(res)
      // Refresh the listing if anything was imported
      if (res.imported.length > 0) {
        router.refresh()
      }
    })
  }

  const handleClose = () => {
    if (isPending) return
    setOpen(false)
    // Clear results a tick later so the modal animation is clean
    setTimeout(reset, 200)
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 gap-2 rounded-lg border-primary/30 bg-primary/5 px-3 text-[11px] text-primary hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">استيراد من يوتيوب</span>
        <span className="sm:hidden">استيراد</span>
      </Button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle>استيراد حلقات من يوتيوب</DialogTitle>
                <DialogDescription className="mt-1">
                  استيراد آمن مُحدَّد بالتاريخ. لا يتم إعادة استيراد الحلقات
                  المحذوفة مسبقاً من الموقع.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Safety notice */}
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[12px] text-amber-700/90">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="leading-relaxed">
              الحلقات التي قمت بحذفها سابقاً من الموقع لن يتم استيرادها مرة
              أخرى حتى وإن كانت لا تزال منشورة على يوتيوب. لاستعادتها عليك
              إزالتها يدوياً من سلة المحذوفات.
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 rounded-xl border border-border/40 bg-muted/20 p-1">
            <button
              type="button"
              onClick={() => setMode("after")}
              disabled={isPending}
              className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-all ${
                mode === "after"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              بعد تاريخ
            </button>
            <button
              type="button"
              onClick={() => setMode("range")}
              disabled={isPending}
              className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-all ${
                mode === "range"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              نطاق تاريخ
            </button>
          </div>

          {/* Date inputs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/80">
                <Calendar className="h-3.5 w-3.5" />
                من
              </span>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={isPending}
                max={isoToday()}
                className="h-9 rounded-lg"
              />
            </label>
            {mode === "range" && (
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/80">
                  <Calendar className="h-3.5 w-3.5" />
                  إلى
                </span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={isPending}
                  max={isoToday()}
                  min={from || undefined}
                  className="h-9 rounded-lg"
                />
              </label>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-[12px] text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Results */}
          {result && result.success && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <ResultCard
                  icon={CheckCircle2}
                  color="green"
                  label="تم الاستيراد"
                  value={result.imported.length}
                />
                <ResultCard
                  icon={Info}
                  color="muted"
                  label="موجودة مسبقاً"
                  value={result.skippedExisting.length}
                />
                <ResultCard
                  icon={XCircle}
                  color="red"
                  label="محذوفة سابقاً"
                  value={result.skippedTombstoned.length}
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                تم فحص {result.totalInDateRange} حلقة ضمن النطاق من أصل{" "}
                {result.totalFromYouTube} حلقة على القناة.
              </p>

              {result.imported.length > 0 && (
                <ResultList
                  title="الحلقات المُستوردة"
                  items={result.imported.map((i) => ({
                    videoId: i.videoId,
                    title: i.title,
                    subtitle: formatDate(i.publishedAt),
                  }))}
                  tone="success"
                />
              )}

              {result.skippedTombstoned.length > 0 && (
                <ResultList
                  title="تم تخطي حلقات محذوفة سابقاً"
                  items={result.skippedTombstoned.map((i) => ({
                    videoId: i.videoId,
                    title: i.title,
                    subtitle: formatDate(i.publishedAt),
                  }))}
                  tone="danger"
                />
              )}

              {result.skippedExisting.length > 0 && (
                <ResultList
                  title="حلقات موجودة بالفعل"
                  items={result.skippedExisting.map((i) => ({
                    videoId: i.videoId,
                    title: i.title,
                    subtitle: formatDate(i.publishedAt),
                  }))}
                  tone="muted"
                />
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" disabled={isPending} onClick={handleClose}>
              {result ? "إغلاق" : "إلغاء"}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isPending}
              className="gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الاستيراد...
                </>
              ) : result ? (
                <>
                  <Download className="h-4 w-4" />
                  استيراد جديد
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  بدء الاستيراد
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ─── Sub-components ─── */

function ResultCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: React.ElementType
  color: "green" | "red" | "muted"
  label: string
  value: number
}) {
  const tone = {
    green: "border-green-500/20 bg-green-500/5 text-green-700",
    red: "border-destructive/20 bg-destructive/5 text-destructive",
    muted: "border-border/30 bg-muted/20 text-muted-foreground",
  }[color]

  return (
    <div className={`flex flex-col items-center gap-1 rounded-xl border ${tone} p-3`}>
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-[10px] font-medium opacity-80">{label}</span>
    </div>
  )
}

function ResultList({
  title,
  items,
  tone,
}: {
  title: string
  items: { videoId: string; title: string; subtitle: string }[]
  tone: "success" | "danger" | "muted"
}) {
  const headerClass = {
    success: "text-green-700/90",
    danger: "text-destructive/80",
    muted: "text-muted-foreground",
  }[tone]
  const PREVIEW = 6
  const preview = items.slice(0, PREVIEW)
  const hidden = items.length - preview.length

  return (
    <details className="rounded-xl border border-border/30 bg-muted/10">
      <summary className={`cursor-pointer select-none px-3 py-2 text-[11px] font-semibold ${headerClass}`}>
        {title} ({items.length})
      </summary>
      <ul className="max-h-48 overflow-y-auto border-t border-border/20 px-2 py-2">
        {preview.map((item) => (
          <li
            key={item.videoId}
            className="flex flex-col gap-0.5 px-2 py-1.5 text-[11px]"
            dir="auto"
          >
            <span className="truncate text-foreground/90" title={item.title}>
              {item.title}
            </span>
            <span className="text-muted-foreground">{item.subtitle}</span>
          </li>
        ))}
        {hidden > 0 && (
          <li className="px-2 py-1 text-[10px] text-muted-foreground">
            + {hidden} أخرى
          </li>
        )}
      </ul>
    </details>
  )
}
