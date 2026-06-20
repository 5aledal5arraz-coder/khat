"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Globe, Loader2 } from "lucide-react"
import type { SiteMetadata } from "@/types/site-settings"
import { updateSiteMetadata } from "./actions"

export function SiteMetadataForm({ initial }: { initial: SiteMetadata }) {
  const [data, setData] = useState<SiteMetadata>(initial)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      await updateSiteMetadata(data)
      setSaved(true)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
          <Globe className="h-5 w-5" />
          معلومات الموقع
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>اسم الموقع</Label>
            <Input
              value={data.name}
              onChange={(e) => setData((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>البريد الإلكتروني</Label>
            <Input
              value={data.contactEmail}
              onChange={(e) => setData((prev) => ({ ...prev, contactEmail: e.target.value }))}
              dir="ltr"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>الشعار النصي</Label>
          <Input
            value={data.tagline}
            onChange={(e) => setData((prev) => ({ ...prev, tagline: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>الوصف</Label>
          <Textarea
            value={data.description}
            onChange={(e) => setData((prev) => ({ ...prev, description: e.target.value }))}
            rows={2}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={isPending} onClick={handleSave}>
            {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
          {saved && <span className="text-sm text-green-700">تم الحفظ</span>}
        </div>
      </CardContent>
    </Card>
  )
}
