"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleRight, Loader2 } from "lucide-react"
import type { FeatureFlags } from "@/types/site-settings"
import { updateFeatureFlags } from "./actions"

const FLAG_LABELS: { key: keyof FeatureFlags; label: string; description: string }[] = [
  { key: "storeEnabled", label: "المتجر", description: "تفعيل صفحة المتجر" },
  { key: "hibrEnabled", label: "حبر", description: "تفعيل منصة حبر للكتابة" },
  { key: "guestApplicationsEnabled", label: "طلبات الضيوف", description: "السماح بتقديم طلبات ضيوف جدد" },
  { key: "maintenanceMode", label: "وضع الصيانة", description: "عرض صفحة صيانة للزوار" },
  { key: "personalizationEnabled", label: "التخصيص الذكي", description: "تخصيص الصفحة الرئيسية حسب سلوك الزائر" },
  { key: "adsEnabled", label: "الإعلانات", description: "تفعيل عرض الإعلانات والمحتوى المدعوم" },
  { key: "studioEnabled", label: "الاستوديو", description: "تفعيل أدوات الاستوديو لمعالجة الحلقات" },
]

export function FeatureFlagsForm({ initial }: { initial: FeatureFlags }) {
  const [flags, setFlags] = useState<FeatureFlags>(initial)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      await updateFeatureFlags(flags)
      setSaved(true)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ToggleRight className="h-5 w-5" />
          أعلام الميزات
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {FLAG_LABELS.map((flag) => (
          <div key={flag.key} className="flex items-center justify-between py-2 border-b last:border-0">
            <div>
              <Label className="font-medium">{flag.label}</Label>
              <p className="text-xs text-muted-foreground">{flag.description}</p>
            </div>
            <Switch
              checked={flags[flag.key]}
              onCheckedChange={(checked) =>
                setFlags((prev) => ({ ...prev, [flag.key]: checked }))
              }
            />
          </div>
        ))}
        <div className="flex items-center gap-3 pt-2">
          <Button size="sm" disabled={isPending} onClick={handleSave}>
            {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
          {saved && <span className="text-sm text-green-500">تم الحفظ</span>}
        </div>
      </CardContent>
    </Card>
  )
}
