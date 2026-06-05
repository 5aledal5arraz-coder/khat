"use client"

/**
 * Phase 2.4.d — shared canonical-link dialog.
 *
 * Reusable across both flows:
 *   • `kind="candidate"`   → /api/admin/guest-candidates/:id/link-canonical
 *   • `kind="application"` → /api/admin/submissions/guests/:id/link-canonical
 *
 * The dialog runs a two-step interaction:
 *   1. On open, fire GET (preview). Read-only — no DB writes.
 *   2. If preview confidence is high or medium, surface a confirm CTA.
 *      On click, fire POST (confirm). The server re-runs the matcher
 *      internally; this client never sends the preview state back.
 *
 * Low-confidence / requires-review cases render a warning state with
 * zero destructive CTA (operator constraint §10). The admin can read
 * the reasons + dismiss; no override path exists in v1.
 *
 * Already-linked cases (existing junction row) render a "linked to X"
 * state with no further action. Visible whenever the dialog is opened
 * on a candidate that has already been bound.
 *
 * The router.refresh() call fires only after a true success (server
 * status === "linked"). "already_linked" returns from the server are
 * surfaced informationally and do NOT trigger a refresh — the page is
 * already showing the correct state.
 *
 * Success toast text varies by `created_guest`:
 *   • created_guest=true   → "تم إنشاء ضيف قانوني جديد وربطه ✓"
 *   • created_guest=false  → "تم ربط الهوية القانونية بـ <name> ✓"
 *
 * Both messages are operator-prescribed verbatim in §10.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, AlertTriangle, CheckCircle2, Link2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/lib/use-toast"

// ─── Server response shapes ───────────────────────────────────────────

interface ExistingLink {
  junction_id: string
  guest_id: string
  guest_name: string | null
  guest_slug: string | null
  link_type: string
  confidence?: string
  linked_at: string | Date
}

interface PreviewBody {
  guest_id: string | null
  confidence: "high" | "medium" | "low" | "none"
  reasons: string[]
  requires_review: boolean
  would_create_slug: string | null
}

interface PreviewResponse {
  candidate?: { id: string; name: string; country: string | null }
  application?: { id: string; name: string; country: string | null }
  existing_link: ExistingLink | null
  preview: PreviewBody
}

interface ConfirmLinkedResponse {
  status: "linked"
  junction_id: string
  guest_id: string
  guest_name: string | null
  guest_slug: string | null
  confidence: "high" | "medium"
  created_guest: boolean
}

interface ConfirmAlreadyLinkedResponse {
  status: "already_linked"
  junction_id: string
  guest_id: string
  guest_name: string | null
}

type ConfirmResponse = ConfirmLinkedResponse | ConfirmAlreadyLinkedResponse

// ─── Props ────────────────────────────────────────────────────────────

export interface LinkCanonicalDialogProps {
  /** Which junction this dialog drives. Determines the API path used. */
  kind: "candidate" | "application"
  /** The candidate or application id. */
  sourceId: string
  /** The display name shown in the dialog header. */
  sourceName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function endpointFor(
  kind: "candidate" | "application",
  sourceId: string,
): string {
  return kind === "candidate"
    ? `/api/admin/guest-candidates/${sourceId}/link-canonical`
    : `/api/admin/submissions/guests/${sourceId}/link-canonical`
}

// ─── Component ────────────────────────────────────────────────────────

export function LinkCanonicalDialog({
  kind,
  sourceId,
  sourceName,
  open,
  onOpenChange,
}: LinkCanonicalDialogProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null)

  // Reset state every time the dialog opens — never leak stale preview
  // payload across openings (operator constraint: confirm re-runs
  // server-side anyway, but stale UI is still confusing).
  React.useEffect(() => {
    if (!open) {
      setPreview(null)
      setError(null)
      setLoading(false)
      setSubmitting(false)
      return
    }
    let cancelled = false
    const url = endpointFor(kind, sourceId)
    setLoading(true)
    setError(null)
    fetch(url, {
      method: "GET",
      headers: { "x-requested-with": "khat" },
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        > & { error?: string }
        if (!res.ok) {
          throw new Error(
            (body.error as string) || "فشل في تحميل معاينة الربط",
          )
        }
        if (!cancelled) setPreview(body as unknown as PreviewResponse)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, kind, sourceId])

  const confirm = React.useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(endpointFor(kind, sourceId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "khat",
        },
      })
      const body = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      > & { error?: string }
      if (!res.ok) {
        throw new Error(
          (body.error as string) || "فشل في ربط الضيف القانوني",
        )
      }
      const data = body as unknown as ConfirmResponse

      if (data.status === "linked") {
        const displayName = data.guest_name?.trim() || "الضيف"
        toast({
          variant: "success",
          title: data.created_guest
            ? "تم إنشاء ضيف قانوني جديد وربطه ✓"
            : `تم ربط الهوية القانونية بـ ${displayName} ✓`,
        })
        // Refresh only on true success — operator constraint §10.
        router.refresh()
      } else {
        // already_linked — informational only, no refresh.
        const displayName = data.guest_name?.trim() || "الضيف"
        toast({
          variant: "default",
          title: `كان مرتبطًا مسبقًا بـ ${displayName}`,
        })
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع")
    } finally {
      setSubmitting(false)
    }
  }, [kind, sourceId, toast, router, onOpenChange])

  // Derive UI state. Server is authoritative — these are display-only.
  const existing = preview?.existing_link ?? null
  const previewBody = preview?.preview ?? null
  const canConfirm =
    !!previewBody &&
    !existing &&
    !previewBody.requires_review &&
    (previewBody.confidence === "high" ||
      previewBody.confidence === "medium" ||
      previewBody.confidence === "none")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            ربط بالضيف القانوني
          </DialogTitle>
          <DialogDescription>
            {kind === "candidate"
              ? `ربط المرشح "${sourceName}" بالهوية القانونية.`
              : `ربط الطلب "${sourceName}" بالهوية القانونية.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري تحميل المعاينة…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            </div>
          )}

          {!loading && !error && preview && (
            <>
              {existing && (
                <div className="rounded-md border bg-muted/40 p-3">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    مرتبط مسبقًا بـ {existing.guest_name ?? "ضيف"}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    نوع الرابط: {existing.link_type}
                  </div>
                </div>
              )}

              {!existing && previewBody && (
                <>
                  <div className="rounded-md border p-3">
                    <div className="font-medium">نتيجة المطابقة</div>
                    <ConfidenceBadge confidence={previewBody.confidence} />
                    <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                      {previewBody.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    {previewBody.confidence === "none" &&
                      previewBody.would_create_slug && (
                        <div className="mt-2 rounded bg-muted/50 px-2 py-1 text-xs">
                          سيتم إنشاء ضيف قانوني جديد بالمعرّف:{" "}
                          <code className="font-mono">
                            {previewBody.would_create_slug}
                          </code>
                        </div>
                      )}
                  </div>

                  {(previewBody.requires_review ||
                    previewBody.confidence === "low") && (
                    <div className="rounded-md border border-amber-300/40 bg-amber-50/60 p-3 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        تحتاج مراجعة يدوية
                      </div>
                      <p className="mt-1 text-xs">
                        مطابقة منخفضة الثقة — لن يتم الربط تلقائيًا. راجع
                        الأسباب أعلاه قبل اتخاذ إجراء يدوي.
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            إغلاق
          </Button>
          {canConfirm && (
            <Button type="button" onClick={confirm} disabled={submitting}>
              {submitting && (
                <Loader2 className="ms-2 h-4 w-4 animate-spin" />
              )}
              تأكيد الربط
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────

function ConfidenceBadge({
  confidence,
}: {
  confidence: "high" | "medium" | "low" | "none"
}) {
  const map: Record<typeof confidence, { label: string; cls: string }> = {
    high: {
      label: "ثقة عالية",
      cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
    },
    medium: {
      label: "ثقة متوسطة",
      cls: "bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200",
    },
    low: {
      label: "ثقة منخفضة",
      cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
    },
    none: {
      label: "بدون تطابق — سيُنشأ ضيف جديد",
      cls: "bg-muted text-muted-foreground",
    },
  }
  const { label, cls } = map[confidence]
  return (
    <span
      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${cls}`}
    >
      {label}
    </span>
  )
}
