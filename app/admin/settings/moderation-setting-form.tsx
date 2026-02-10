"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Shield, Loader2 } from "lucide-react"
import { updateAIModeration } from "./actions"

export function ModerationSettingForm({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    setSaved(false)
    startTransition(async () => {
      await updateAIModeration(checked)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-5 w-5" />
          فلتر الذكاء الاصطناعي
        </CardTitle>
        <CardDescription>
          فحص المحتوى تلقائياً عبر OpenAI قبل النشر
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {enabled ? "مفعّل" : "معطّل"}
            </p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? "يتم فحص المنشورات والتعليقات بالذكاء الاصطناعي"
                : "يتم الاعتماد على الفلاتر المحلية فقط (كلمات محظورة وسبام)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {saved && <span className="text-xs text-green-500">تم الحفظ</span>}
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={isPending}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
