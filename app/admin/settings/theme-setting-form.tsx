"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Palette } from "lucide-react"
import { updateThemeMode } from "./actions"
import type { ThemeMode } from "@/types/ads"
import { cn } from "@/lib/utils"

const options: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "تلقائي" },
  { value: "dark", label: "داكن" },
  { value: "light", label: "فاتح" },
]

export function ThemeSettingForm({ initialMode }: { initialMode: ThemeMode }) {
  const [selected, setSelected] = useState<ThemeMode>(initialMode)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      await updateThemeMode(selected)
      setSaved(true)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="h-5 w-5" />
          مظهر الموقع
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setSelected(opt.value); setSaved(false) }}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                selected === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/50"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            disabled={isPending || selected === initialMode}
            onClick={handleSave}
          >
            {isPending ? "جاري الحفظ..." : "حفظ"}
          </Button>
          {saved && (
            <span className="text-sm text-green-500">تم الحفظ</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
