"use client"

import { useState, useCallback, useRef } from "react"
import {
  Clock, Sparkles, Loader2, AlertCircle, RefreshCw, Save,
  Play, Pause,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudioSession } from "./studio-context"

// ---------------------------------------------------------------------------
// Audio Tools Content (rendered inside an AccordionSection)
// ---------------------------------------------------------------------------

export function AudioToolsContent() {
  const {
    session,
    transcriptStatus,
    audioStartSeconds, audioEndSeconds, audioBestIntro,
    audioIntroStatus, audioIntroError,
    setAudioStartSeconds, setAudioEndSeconds,
    saveAudioTimestamps, generateBestIntro,
  } = useStudioSession()

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const durationSec = session.duration_seconds

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaved(false)
    await saveAudioTimestamps(audioStartSeconds, audioEndSeconds)
    setSaving(false)
    setSaved(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setSaved(false), 2000)
  }, [audioStartSeconds, audioEndSeconds, saveAudioTimestamps])

  if (transcriptStatus !== "ready") {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        حوّل الملف الصوتي إلى نص أولاً لتتمكن من استخدام أدوات الصوت
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {/* Timestamps Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-medium">نقاط القص</span>
          {durationSec && (
            <span className="text-xs text-muted-foreground">
              (المدة الكاملة: {formatDuration(durationSec)})
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <TimestampInput
            label="بداية الحلقة"
            icon={<Play className="h-3.5 w-3.5" />}
            value={audioStartSeconds}
            onChange={setAudioStartSeconds}
            max={durationSec}
          />
          <TimestampInput
            label="نهاية الحلقة"
            icon={<Pause className="h-3.5 w-3.5" />}
            value={audioEndSeconds}
            onChange={setAudioEndSeconds}
            max={durationSec}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saved ? (
              <Save className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saved ? "تم الحفظ" : "حفظ النقاط"}
          </Button>
          {audioStartSeconds != null && audioEndSeconds != null && audioEndSeconds > audioStartSeconds && (
            <span className="text-xs text-muted-foreground">
              المدة الفعلية: {formatDuration(audioEndSeconds - audioStartSeconds)}
            </span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* AI Best Intro Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium">اقتراح أفضل افتتاحية (30 ثانية)</span>
        </div>

        <p className="text-xs text-muted-foreground">
          يحلل الذكاء الاصطناعي نص الحلقة ويقترح أقوى مقطع (~30 ثانية) لاستخدامه كتيزر افتتاحي
        </p>

        {audioIntroStatus === "idle" && (
          <Button
            onClick={generateBestIntro}
            className="gap-2 bg-amber-600 hover:bg-amber-700"
          >
            <Sparkles className="h-4 w-4" />
            اقتراح الافتتاحية
          </Button>
        )}

        {audioIntroStatus === "generating" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
            <span className="text-sm text-muted-foreground">جارٍ تحليل النص واختيار أفضل مقطع...</span>
          </div>
        )}

        {audioIntroStatus === "error" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{audioIntroError}</p>
            </div>
            <Button variant="outline" onClick={generateBestIntro} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              إعادة المحاولة
            </Button>
          </div>
        )}

        {audioIntroStatus === "ready" && audioBestIntro && (
          <div className="space-y-3">
            <div
              className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-4 text-sm whitespace-pre-wrap"
              dir="rtl"
              lang="ar"
              style={{ lineHeight: 1.9 }}
            >
              {audioBestIntro}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={generateBestIntro}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              اقتراح جديد
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timestamp Input Component
// ---------------------------------------------------------------------------

function TimestampInput({
  label,
  icon,
  value,
  onChange,
  max,
}: {
  label: string
  icon: React.ReactNode
  value: number | null
  onChange: (v: number | null) => void
  max?: number | null
}) {
  // Convert seconds to MM:SS for display
  const displayValue = value != null
    ? `${Math.floor(value / 60).toString().padStart(2, "0")}:${Math.floor(value % 60).toString().padStart(2, "0")}`
    : ""

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (!raw) {
      onChange(null)
      return
    }

    // Parse MM:SS or HH:MM:SS
    const parts = raw.split(":").map(Number)
    let seconds = 0
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
    else if (parts.length === 2) seconds = parts[0] * 60 + parts[1]
    else seconds = parts[0] || 0

    if (max != null && seconds > max) seconds = max
    onChange(Math.max(0, seconds))
  }

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </label>
      <input
        type="text"
        inputMode="numeric"
        placeholder="00:00"
        value={displayValue}
        onChange={handleChange}
        className={cn(
          "w-full rounded-md border bg-background px-3 py-2 text-sm font-mono text-center",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
          "placeholder:text-muted-foreground/50"
        )}
      />
      {max != null && (
        <span className="text-[10px] text-muted-foreground/60 block text-center">
          الحد الأقصى: {formatDuration(max)}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }
  return `${m}:${s.toString().padStart(2, "0")}`
}
