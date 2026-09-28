"use client"

/**
 * Per-topic actions on an approved-topic card in the season workspace.
 *
 * Three things an operator needs on ONE topic, without waiting for the
 * whole season to be complete:
 *   - «تعديل»               → the existing EpisodeEditModal (title, hook,
 *                              goal, description…). editEpisodeAction also
 *                              re-syncs the topic's EIR when one exists.
 *   - «عيّن ضيفاً معروفاً»  → pick an existing `guests` row. For the case
 *                              discovery can't serve: the guest is already
 *                              known (discovery memory excludes known guests).
 *   - «تحويل لإعداد»         → convert this single topic once it has a guest.
 *                              The bulk button above still converts all.
 */

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Search, Send, UserPlus, X } from "lucide-react"
import { toast } from "@/lib/use-toast"
import { runAction } from "@/app/admin/components/run-action"
import type { KhatMapEpisodeCandidate } from "@/types/khat-map"
import {
  assignKnownGuestToTopicAction,
  convertV2CardToPreparationAction,
} from "../../actions"
import { EpisodeEditModal } from "./episode-edit-modal"

export interface GuestOption {
  id: string
  name: string
}

export function TopicCardActions({
  seasonId,
  topic,
  hasGuest,
  currentGuestId,
  guests,
}: {
  seasonId: string
  topic: KhatMapEpisodeCandidate
  /** The topic already has a linked guest (conversion is unblocked). */
  hasGuest: boolean
  /** Canonical `guests.id` behind the linked guest, when known. */
  currentGuestId: string | null
  guests: GuestOption[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string>("")
  const [assignPending, startAssign] = useTransition()
  const [convertPending, startConvert] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return guests
    return guests.filter((g) => g.name.toLowerCase().includes(q))
  }, [guests, query])

  const busy = assignPending || convertPending

  const handleAssign = () => {
    if (!selected || busy) return
    setError(null)
    startAssign(async () => {
      const outcome = await runAction(() =>
        assignKnownGuestToTopicAction({
          seasonId,
          topicCandidateId: topic.id,
          guestId: selected,
        }),
      )
      if (!outcome.ok) {
        setError(outcome.message)
        return
      }
      const res = outcome.data
      if (!res.success) {
        setError(res.error)
        return
      }
      toast({
        title: "تم تعيين الضيف",
        description: "الحلقة جاهزة للتحويل إلى الإعداد.",
        variant: "success",
      })
      setPicking(false)
      setQuery("")
      setSelected("")
      router.refresh()
    })
  }

  const handleConvert = () => {
    if (busy) return
    setError(null)
    startConvert(async () => {
      const outcome = await runAction(() =>
        convertV2CardToPreparationAction({
          seasonId,
          topicCandidateId: topic.id,
        }),
      )
      if (!outcome.ok) {
        setError(outcome.message)
        return
      }
      const res = outcome.data
      if (!res.success) {
        setError(res.error)
        return
      }
      toast({
        title: res.data.was_existing ? "الإعداد موجود مسبقاً" : "تم التحويل إلى الإعداد",
        description:
          res.data.warning ??
          (res.data.job
            ? "توليد الإعداد العميق يعمل في الخلفية — ننقلك إلى صفحة الإعداد لمتابعته…"
            : "ننقلك إلى صفحة الإعداد…"),
        variant: res.data.warning ? "error" : "success",
      })
      // The topic leaves the approved list once converted, so the season
      // page would lose it — open the preparation, which is the next step.
      router.push(res.data.href)
    })
  }

  return (
    <div className="mt-3 border-t border-border/40 pt-3" data-topic-actions>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
        >
          <Pencil className="h-3 w-3" />
          تعديل
        </button>
        <button
          type="button"
          onClick={() => {
            setPicking((v) => !v)
            setError(null)
          }}
          disabled={busy}
          aria-expanded={picking}
          className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
        >
          <UserPlus className="h-3 w-3" />
          {hasGuest ? "غيّر الضيف" : "عيّن ضيفاً معروفاً"}
        </button>
        {hasGuest && (
          <button
            type="button"
            onClick={handleConvert}
            disabled={busy}
            className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1 text-[11px] font-bold text-background hover:opacity-90 disabled:opacity-60"
          >
            {convertPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            {convertPending ? "تحويل…" : "تحويل لإعداد"}
          </button>
        )}
      </div>

      {picking && (
        <div className="mt-2 rounded-xl border border-border/50 bg-background/40 p-2.5">
          {guests.length === 0 ? (
            <p className="text-[11.5px] text-amber-700">
              لا يوجد ضيوف مسجّلين بعد. أضف ضيفاً من صفحة الضيوف ثم عد إلى هنا.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث باسم الضيف…"
                  disabled={assignPending}
                  className="h-8 w-full rounded-lg border border-input bg-background ps-8 pe-2 text-[12px] focus:border-primary focus:outline-none disabled:opacity-50"
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  disabled={assignPending}
                  aria-label="الضيف"
                  className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-[12px] disabled:opacity-50"
                >
                  <option value="" disabled>
                    {filtered.length === 0 ? "لا نتائج" : `اختر ضيفاً… (${filtered.length})`}
                  </option>
                  {filtered.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={assignPending || !selected || selected === currentGuestId}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-[12px] text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  {assignPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <UserPlus className="h-3 w-3" />
                  )}
                  {assignPending ? "جارٍ التعيين…" : "تعيين"}
                </button>
                <button
                  type="button"
                  onClick={() => setPicking(false)}
                  disabled={assignPending}
                  aria-label="إغلاق"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-[11.5px] text-rose-700">
          {error}
        </div>
      )}

      {editing && (
        <EpisodeEditModal
          open
          seasonId={seasonId}
          topic={topic}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
