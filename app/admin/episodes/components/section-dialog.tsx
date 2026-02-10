"use client"

import { useState, useRef, useEffect } from "react"
import { Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createSection } from "../actions"

export function SectionDialog({ onClose }: { onClose: () => void }) {
  const [label, setLabel] = useState("")
  const [color, setColor] = useState("#3b82f6")
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleCreate = async () => {
    if (!label.trim()) return
    setSaving(true)
    await createSection(label.trim(), color)
    setSaving(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-border/50 bg-card/95 p-8 shadow-2xl shadow-black/30 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold">تصنيف جديد</h3>
            <p className="text-sm text-muted-foreground">
              أنشئ تصنيفًا لتنظيم الحلقات
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              اسم التصنيف
            </label>
            <Input
              ref={inputRef}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && label.trim()) handleCreate()
              }}
              placeholder="مثال: الموسم الثالث"
              dir="auto"
              className="h-11 rounded-xl"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              اللون
            </label>
            <div className="flex items-center gap-4">
              <div className="relative">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <div
                  className="h-10 w-10 rounded-xl ring-2 ring-white/10 transition-shadow hover:ring-white/20"
                  style={{ backgroundColor: color }}
                />
              </div>
              <div className="flex gap-2">
                {[
                  "#3b82f6",
                  "#8b5cf6",
                  "#f59e0b",
                  "#10b981",
                  "#ef4444",
                  "#6b7280",
                ].map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={`اللون ${c}`}
                    aria-pressed={color === c}
                    className={`h-8 w-8 rounded-xl transition-all hover:scale-110 ${
                      color === c
                        ? "ring-2 ring-foreground ring-offset-2 ring-offset-card scale-110"
                        : "ring-1 ring-white/10"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl"
          >
            إلغاء
          </Button>
          <Button
            onClick={handleCreate}
            disabled={saving || !label.trim()}
            className="rounded-xl px-6"
          >
            {saving ? "جارٍ الحفظ..." : "إنشاء التصنيف"}
          </Button>
        </div>
      </div>
    </div>
  )
}
