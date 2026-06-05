"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Search, Loader2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { SEODefaults } from "@/types/site-settings"
import { updateSEODefaults } from "./actions"

export function SEOForm({ initial }: { initial: SEODefaults }) {
  const [data, setData] = useState<SEODefaults>(initial)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [newKeyword, setNewKeyword] = useState("")

  function addKeyword() {
    const kw = newKeyword.trim()
    if (kw && !data.keywords.includes(kw)) {
      setData((prev) => ({ ...prev, keywords: [...prev.keywords, kw] }))
      setNewKeyword("")
    }
  }

  function removeKeyword(kw: string) {
    setData((prev) => ({ ...prev, keywords: prev.keywords.filter((k) => k !== kw) }))
  }

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      await updateSEODefaults(data)
      setSaved(true)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
          <Search className="h-5 w-5" />
          SEO الافتراضي
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>قالب العنوان</Label>
          <Input
            value={data.titleTemplate}
            onChange={(e) => setData((prev) => ({ ...prev, titleTemplate: e.target.value }))}
            placeholder="%s | بودكاست خط"
            dir="ltr"
          />
          <p className="text-[11px] text-muted-foreground/60">
            استخدم %s كمكان لعنوان الصفحة
          </p>
        </div>
        <div className="space-y-2">
          <Label>الوصف الافتراضي</Label>
          <Textarea
            value={data.defaultDescription}
            onChange={(e) => setData((prev) => ({ ...prev, defaultDescription: e.target.value }))}
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <Label>صورة OG الافتراضية</Label>
          <Input
            value={data.defaultOgImage}
            onChange={(e) => setData((prev) => ({ ...prev, defaultOgImage: e.target.value }))}
            placeholder="/og-image.png"
            dir="ltr"
          />
        </div>
        <div className="space-y-2">
          <Label>الكلمات المفتاحية</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {data.keywords.map((kw) => (
              <Badge key={kw} variant="secondary" className="gap-1">
                {kw}
                <button type="button" onClick={() => removeKeyword(kw)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword() } }}
              placeholder="كلمة مفتاحية جديدة"
              className="flex-1"
            />
            <Button type="button" variant="outline" size="sm" onClick={addKeyword}>
              إضافة
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
