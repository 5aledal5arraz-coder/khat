"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileEdit, X } from "lucide-react"
import { getDrafts, deleteDraft } from "@/lib/space-storage"
import type { Draft } from "@/types/space"

export function DraftIndicator() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [mounted, setMounted] = useState(false)

  // Hydration: Load client-side localStorage state after mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    setDrafts(getDrafts())
  }, [])

  const handleDelete = (e: React.MouseEvent, draftId: string) => {
    e.preventDefault()
    e.stopPropagation()
    deleteDraft(draftId)
    setDrafts(getDrafts())
  }

  if (!mounted || drafts.length === 0) {
    return null
  }

  return (
    <Card className="border-yellow-500/30 bg-yellow-500/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/20">
            <FileEdit className="h-5 w-5 text-yellow-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium">لديك {drafts.length} مسودة محفوظة</p>
            <p className="text-sm text-muted-foreground">
              آخر تعديل: {(() => { const d = new Date(drafts[0].lastSaved); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` })()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/space/write?draft=${drafts[0].id}`}>
              <Button size="sm">أكمل الكتابة</Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-muted-foreground hover:text-destructive"
              onClick={(e) => handleDelete(e, drafts[0].id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {drafts.length > 1 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">مسودات أخرى:</p>
            <div className="space-y-2">
              {drafts.slice(1, 3).map((draft) => (
                <Link
                  key={draft.id}
                  href={`/space/write?draft=${draft.id}`}
                  className="flex items-center justify-between rounded-lg bg-background/50 p-2 hover:bg-background"
                >
                  <span className="text-sm truncate flex-1">
                    {draft.title || "مسودة بدون عنوان"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => handleDelete(e, draft.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
