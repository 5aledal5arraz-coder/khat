"use client"

import { useState, useEffect, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { History, RotateCcw, Loader2 } from "lucide-react"
import { formatDateTime } from "@/lib/shared/formatters"
import { getVersionHistoryAction, restoreEpisodeVersionAction } from "../version-actions"
import type { EpisodeVersion, EpisodeVersionChangeType } from "@/types/database"

const CHANGE_TYPE_LABELS: Record<EpisodeVersionChangeType, string> = {
  title_override: "تعديل العنوان",
  description_override: "تعديل الوصف",
  enrichment: "إثراء المحتوى",
  quotes: "اقتباسات",
  section_assignment: "تصنيف",
  visibility: "إظهار/إخفاء",
  guest_assignment: "تعيين ضيف",
  category_assignment: "تصنيف فئة",
  youtube_pack: "حزمة يوتيوب",
  conversation: "بيانات المحادثة",
  full_snapshot: "نسخة كاملة",
}

interface DetailVersionsProps {
  episodeId: string
}

export function DetailVersions({ episodeId }: DetailVersionsProps) {
  const [versions, setVersions] = useState<EpisodeVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    getVersionHistoryAction(episodeId)
      .then(setVersions)
      .finally(() => setLoading(false))
  }, [episodeId])

  const handleRestore = (versionId: string) => {
    setRestoringId(versionId)
    startTransition(async () => {
      const result = await restoreEpisodeVersionAction(versionId)
      if (result.success) {
        // Refresh version list
        const updated = await getVersionHistoryAction(episodeId)
        setVersions(updated)
      }
      setRestoringId(null)
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <History className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">لا يوجد سجل تعديلات لهذه الحلقة بعد</p>
          <p className="mt-1 text-xs text-muted-foreground">
            سيظهر هنا سجل بكل التعديلات عند إجراء أي تغيير
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">سجل التعديلات ({versions.length})</h3>
      </div>

      <div className="space-y-3">
        {versions.map((version) => (
          <Card key={version.id} className="transition-colors hover:bg-muted/30">
            <CardContent className="flex items-center justify-between p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    v{version.version_number}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {CHANGE_TYPE_LABELS[version.change_type] || version.change_type}
                  </Badge>
                </div>
                {version.change_summary && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                    {version.change_summary}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(version.created_at)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRestore(version.id)}
                disabled={isPending}
                className="shrink-0 gap-1.5"
              >
                {restoringId === version.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                استعادة
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
