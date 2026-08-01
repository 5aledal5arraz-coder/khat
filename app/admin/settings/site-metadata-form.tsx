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
import { runAction } from "@/app/admin/components/run-action"

export function SiteMetadataForm({ initial }: { initial: SiteMetadata }) {
  const [data, setData] = useState<SiteMetadata>(initial)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    setSaved(false)
    setError(null)
    startTransition(async () => {
      // The action rejects a non-ADMIN via `throw new Error(gate.error)`. An
      // uncaught throw inside a transition escapes to the panel error boundary
      // ("خطأ غير متوقع في اللوحة"); catch it at the boundary and show a clean
      // inline message. (Next.js redacts the thrown message in production, so
      // we render a stable Arabic string rather than err.message.)
      // A bare `catch` settles the transition but collapses every cause into
      // one sentence — it told an ADMIN to "check your permission" when the
      // real problem was a dropped connection. `runAction` names the causes it
      // can identify and rethrows Next's redirect()/notFound() control flow;
      // the role rejection arrives as a plain Error and classifies as
      // "unknown", which is where this file's own copy still belongs.
      const outcome = await runAction(() => updateSiteMetadata(data))
      if (!outcome.ok) {
        setError(
          outcome.kind === "unknown"
            ? "تعذّر حفظ الإعدادات — تحقّق من صلاحيتك أو أعد المحاولة."
            : outcome.message,
        )
        return
      }
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
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
