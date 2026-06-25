"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleRight, Loader2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FeatureFlags } from "@/types/site-settings"
import { updateFeatureFlags } from "./actions"

interface FlagMeta {
  key: keyof FeatureFlags
  label: string
  description: string
  /** Where toggling this flag actually takes effect — shown to the operator. */
  effect: string
  danger?: boolean
}

const FLAG_META: FlagMeta[] = [
  {
    key: "guestApplicationsEnabled",
    label: "طلبات الضيوف",
    description: "فتح أو إغلاق باب التقديم لتكون ضيفاً",
    effect: "يتحكّم في صفحة /guest العامة ويرفض الإرسال عبر الـ API عند الإغلاق",
  },
  {
    key: "studioEnabled",
    label: "الاستوديو",
    description: "تفعيل أدوات الاستوديو لمعالجة الحلقات",
    effect: "يعطّل صفحة /admin/studio ويعرض إشعاراً بدلاً منها",
  },
  {
    key: "maintenanceMode",
    label: "وضع الصيانة",
    description: "عرض صفحة صيانة لكل زوّار الموقع",
    effect: "يحوّل كامل الموقع العام إلى /maintenance (المدراء يبقون قادرين على التصفّح)",
    danger: true,
  },
]

export function FeatureFlagsForm({ initial }: { initial: FeatureFlags }) {
  const [flags, setFlags] = useState<FeatureFlags>(initial)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  const dirty = (Object.keys(flags) as (keyof FeatureFlags)[]).some((k) => flags[k] !== initial[k])

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
        <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
          <ToggleRight className="h-5 w-5" />
          الميزات والتوافر
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {FLAG_META.map((flag) => {
          const on = flags[flag.key]
          return (
            <div
              key={flag.key}
              className={cn(
                "flex items-start justify-between gap-4 rounded-xl border p-3.5 transition-colors",
                flag.danger && on
                  ? "border-amber-300/70 bg-amber-50/60"
                  : "border-border/50 bg-muted/10",
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Label className="text-[13px] font-medium">{flag.label}</Label>
                  {flag.danger && on && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      <AlertTriangle className="h-3 w-3" />
                      مفعّل
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">{flag.description}</p>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground/80">
                  ↳ {flag.effect}
                </p>
              </div>
              <Switch
                checked={on}
                onCheckedChange={(checked) =>
                  setFlags((prev) => ({ ...prev, [flag.key]: checked }))
                }
              />
            </div>
          )
        })}
        <div className="flex items-center gap-3 pt-2">
          <Button size="sm" disabled={isPending || !dirty} onClick={handleSave}>
            {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
          {saved && !dirty && <span className="text-sm text-green-700">تم الحفظ</span>}
        </div>
      </CardContent>
    </Card>
  )
}
