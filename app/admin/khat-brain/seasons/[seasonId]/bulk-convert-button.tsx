"use client"

/**
 * Production-readiness fix sprint #2.9 + #2.10 — bulk convert UI.
 *
 * One button. Operator clicks it; we call `bulkConvertApprovedAction`,
 * show partial-progress per-card. Removes the "I accepted everything,
 * why is nothing in preparation?" trap (fix #2.10) by making the
 * convert step explicit and discoverable.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Workflow,
  AlertTriangle,
} from "lucide-react"
import { toast } from "@/lib/use-toast"
import {
  bulkConvertApprovedAction,
  type BulkConvertResult,
} from "./bulk-convert-actions"

export function BulkConvertButton({
  seasonId,
  approvedCount,
  convertableCount,
  blockedItems = [],
}: {
  seasonId: string
  approvedCount: number
  /**
   * Count of approved candidates that pass preflight (have a linked
   * guest). Defaults to approvedCount for backwards compatibility.
   */
  convertableCount?: number
  /** Approved candidates blocked by missing guest. Shown as a preflight list. */
  blockedItems?: Array<{ id: string; title: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<BulkConvertResult | null>(null)

  const convertable = convertableCount ?? approvedCount
  const blocked = blockedItems.length

  const onClick = () => {
    setResult(null)
    startTransition(async () => {
      const r = await bulkConvertApprovedAction(seasonId)
      setResult(r)
      toast({
        title: r.ok ? "تم تحويل الحلقات إلى الإعداد" : "تعذّر التحويل",
        description: r.message,
        variant: r.ok ? "success" : "error",
      })
      if (r.ok) router.refresh()
    })
  }

  if (approvedCount === 0) return null

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 text-[12px] font-semibold text-violet-700">
            تحويل الحلقات المعتمدة إلى الإعداد
          </div>
          <p className="text-[11px] leading-relaxed text-foreground/80">
            القبول وحده لا يكفي — حتى يتم التحويل، سجلّ الإعداد لا
            يُنشأ. {convertable > 0
              ? `جاهز للتحويل: ${convertable}/${approvedCount} حلقة.`
              : `جميع الحلقات الـ${approvedCount} محجوبة — راجع القائمة أدناه.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={pending || convertable === 0}
          data-bulk-convert-button
          data-convertable={convertable}
          data-blocked={blocked}
          title={
            convertable === 0
              ? "لا توجد حلقات قابلة للتحويل — جميع الحلقات بدون ضيف مرتبط."
              : undefined
          }
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] font-medium text-violet-700 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              جارٍ التحويل…
            </>
          ) : (
            <>
              <Workflow className="h-3 w-3" />
              تحويل {convertable} حلقة
            </>
          )}
        </button>
      </div>

      {blocked > 0 && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5">
          <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
            <AlertTriangle className="h-3 w-3" /> محجوب — بدون ضيف ({blocked})
          </div>
          <ul className="space-y-0.5 text-[11px] text-foreground/85">
            {blockedItems.slice(0, 6).map((b) => (
              <li
                key={b.id}
                className="truncate"
                data-bulk-convert-blocked-item
              >
                • {b.title}
              </li>
            ))}
            {blockedItems.length > 6 && (
              <li className="text-muted-foreground">
                + {blockedItems.length - 6} حلقة أخرى…
              </li>
            )}
          </ul>
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            افتح بطاقة كل حلقة من القائمة أدناه واربط ضيفاً قبل التحويل.
          </p>
        </div>
      )}

      {result && (
        <div className="mt-3 space-y-1.5">
          <div className="text-[11px] text-foreground/85">
            {result.message}
          </div>
          {result.per_card.length > 0 && (
            <ul className="space-y-1 text-[10.5px]">
              {result.per_card.map((c) => (
                <li
                  key={c.candidate_id}
                  className="flex items-center gap-2 rounded-lg border border-border/30 bg-background/30 px-2 py-1"
                >
                  {c.status === "converted" ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-700" />
                  ) : c.status === "skipped_existing" ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <XCircle className="h-3 w-3 shrink-0 text-rose-700" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.reason && (
                    <span className="text-[10px] text-rose-700" dir="ltr">
                      {c.reason}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
