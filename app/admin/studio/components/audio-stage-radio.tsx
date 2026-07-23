"use client"

import { cn } from "@/lib/utils"
import type { StudioAudioStage } from "@/types/database"

/**
 * Studio Wave 2 — the raw/edited audio-journey chooser, made BEFORE upload.
 * Presentational only (value + onChange), so it can be previewed/tested in
 * isolation and reused wherever an audio upload is offered.
 *
 *   raw    → the time-map flow (episode_true_start / breaks / hooks)
 *   edited → the existing full publishing pipeline
 */

const OPTIONS: Array<{ value: StudioAudioStage; title: string; desc: string }> = [
  {
    value: "raw",
    title: "تسجيل خام (قبل المونتاج)",
    desc: "للحصول على خريطة زمنية: بداية الحلقة الفعلية، فترات القطع، ومقاطع الهوك — تطبّقها على المونتاج.",
  },
  {
    value: "edited",
    title: "بعد المونتاج (النسخة النهائية)",
    desc: "لتوليد حزمة النشر الكاملة: النص، الفصول، المقاطع، وصفحة الموقع.",
  },
]

export function AudioStageRadio({
  value,
  onChange,
  disabled = false,
}: {
  value: StudioAudioStage
  onChange: (v: StudioAudioStage) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-1 text-[12px] font-semibold text-foreground">
        نوع الملف الصوتي
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value
          return (
            <label
              key={opt.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-all",
                selected
                  ? "border-purple-400 bg-white shadow-sm ring-1 ring-purple-300 dark:bg-purple-950/20"
                  : "border-purple-200/60 bg-white/40 hover:border-purple-300 dark:border-purple-900/40 dark:bg-transparent",
              )}
            >
              <input
                type="radio"
                name="audio_stage"
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-purple-600"
              />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-foreground">
                  {opt.title}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                  {opt.desc}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
