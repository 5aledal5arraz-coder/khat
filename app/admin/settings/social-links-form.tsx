"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Share2, Plus, Trash2, Loader2 } from "lucide-react"
import type { SocialLinkConfig } from "@/types/site-settings"
import { updateSocialLinks } from "./actions"

export function SocialLinksForm({ initial }: { initial: SocialLinkConfig[] }) {
  const [links, setLinks] = useState<SocialLinkConfig[]>(initial)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function addLink() {
    setLinks((prev) => [...prev, { platform: "", url: "", visible: true }])
  }

  function updateLink(index: number, updates: Partial<SocialLinkConfig>) {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, ...updates } : l)))
  }

  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      await updateSocialLinks(links)
      setSaved(true)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            الروابط الاجتماعية
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addLink}>
            <Plus className="me-1 h-4 w-4" />
            إضافة
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {links.map((link, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={link.platform}
              onChange={(e) => updateLink(index, { platform: e.target.value })}
              placeholder="المنصة"
              className="w-28"
            />
            <Input
              value={link.url}
              onChange={(e) => updateLink(index, { url: e.target.value })}
              placeholder="الرابط"
              dir="ltr"
              className="flex-1"
            />
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground sr-only">مرئي</Label>
              <Switch
                checked={link.visible}
                onCheckedChange={(checked) => updateLink(index, { visible: checked })}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeLink(index)}
              className="text-destructive hover:text-destructive shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {links.length === 0 && (
          <p className="text-[13px] text-muted-foreground/50 text-center py-4">لا توجد روابط</p>
        )}
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
