"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Loader2, Rocket, CheckCircle2, ExternalLink, Info, CalendarClock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useToast } from "@/lib/use-toast"
import { candidatesApi } from "../lib/api"
import type { GuestCandidateStatus } from "@/types/database"

export interface LinkedEir {
  id: string
  phase: string
  working_title: string
  recording_scheduled_at: string | null
}

/** Convert a stored ISO string to the value a datetime-local input expects. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  candidateId: string
  status: GuestCandidateStatus
  productionEir: LinkedEir | null
  hasCanonicalLink: boolean
}

const PHASE_LABEL: Record<string, string> = {
  guest_assigned: "الضيف مُعيّن",
  approved: "معتمدة",
  researching: "قيد البحث",
  prepared: "جاهزة للتحضير",
  ready_to_record: "جاهزة للتسجيل",
  recording: "قيد التسجيل",
  recorded: "مُسجّلة",
  producing: "قيد الإنتاج",
  ready_to_publish: "جاهزة للنشر",
  published: "منشورة",
}

export function ProductionBridgePanel({ candidateId, status, productionEir, hasCanonicalLink }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [recDate, setRecDate] = useState(() => isoToLocalInput(productionEir?.recording_scheduled_at ?? null))
  const [savingRec, setSavingRec] = useState(false)

  async function handleSaveRecording() {
    setSavingRec(true)
    try {
      const iso = recDate ? new Date(recDate).toISOString() : null
      await candidatesApi.setRecordingSchedule(candidateId, iso)
      toast({ title: iso ? "تم حفظ موعد التصوير" : "تم مسح موعد التصوير" })
      router.refresh()
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر حفظ الموعد", description: err instanceof Error ? err.message : "خطأ" })
    } finally {
      setSavingRec(false)
    }
  }

  // State 1 — already bridged into production.
  if (productionEir) {
    const phaseLabel = PHASE_LABEL[productionEir.phase] ?? productionEir.phase
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-emerald-700">في خط الإنتاج · {phaseLabel}</p>
            <p className="truncate text-[11px] text-muted-foreground">{productionEir.working_title}</p>
          </div>
        </div>

        {/* Recording schedule — internal filming date, NOT publish. */}
        <div className="rounded-lg border border-border/30 bg-background/30 p-2.5">
          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarClock className="h-3 w-3" /> موعد التصوير
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="datetime-local"
              value={recDate}
              onChange={(e) => setRecDate(e.target.value)}
              className="h-8 flex-1 text-xs"
            />
            <Button size="sm" onClick={handleSaveRecording} disabled={savingRec}>
              {savingRec && <Loader2 className="ms-1 h-3 w-3 animate-spin" />}
              حفظ
            </Button>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            موعد داخلي للتصوير — ليس تاريخ النشر. لا يظهر للعامة.
          </p>
        </div>

        <Link
          href={`/admin/khat-brain/episodes/${productionEir.id}`}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border/40 bg-background px-3 py-2 text-xs font-medium hover:bg-muted/40"
        >
          <ExternalLink className="h-3.5 w-3.5" /> فتح الحلقة في خط الإنتاج
        </Link>
      </div>
    )
  }

  // State 4 — not accepted yet: no production path.
  if (status !== "accepted") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-border/40 p-3 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>يُتاح النقل للإنتاج بعد تغيير الحالة إلى «وافق».</span>
      </div>
    )
  }

  // State 3 — accepted but not yet linked to a canonical guest.
  if (!hasCanonicalLink) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-700">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>اربط المرشّح بضيف قانوني أولاً (زر «ربط بضيف قانوني» بالأعلى) ثم انقله للإنتاج.</span>
      </div>
    )
  }

  async function handlePromote() {
    if (!confirm("نقل هذا المرشّح إلى خط الإنتاج؟ سيتم إنشاء حلقة مرتبطة بالضيف في مرحلة «الضيف مُعيّن».")) return
    setBusy(true)
    try {
      const res = await candidatesApi.promoteToProduction(candidateId)
      toast({ title: "تم النقل للإنتاج", description: res.working_title ?? undefined })
      router.refresh()
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر النقل للإنتاج", description: err instanceof Error ? err.message : "خطأ" })
    } finally {
      setBusy(false)
    }
  }

  // State 2 — accepted + linked + no EIR yet → the explicit action.
  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        المرشّح وافق ومرتبط بضيف قانوني — انقله إلى خط الإنتاج لإنشاء حلقة في مرحلة «الضيف مُعيّن».
      </p>
      <Button onClick={handlePromote} disabled={busy} className="w-full">
        {busy ? <Loader2 className="ms-1 h-4 w-4 animate-spin" /> : <Rocket className="ms-1 h-4 w-4" />}
        نقل للإنتاج
      </Button>
    </div>
  )
}
