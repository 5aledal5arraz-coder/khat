"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Plus, Trash2, Calendar, Check, X, RotateCcw } from "lucide-react"
import { useToast } from "@/lib/use-toast"
import { formatDateTime } from "@/lib/shared/formatters"
import { candidatesApi } from "../lib/api"
import type { GuestPrepMeeting, GuestPrepMeetingStatus } from "@/types/database"

interface Props {
  candidateId: string
  initialMeetings: GuestPrepMeeting[]
}

const TYPE_OPTIONS = [
  { value: "video", label: "فيديو" },
  { value: "call", label: "مكالمة" },
  { value: "in_person", label: "حضوري" },
]

const TYPE_LABEL: Record<string, string> = {
  video: "فيديو",
  call: "مكالمة",
  in_person: "حضوري",
}

const STATUS_META: Record<GuestPrepMeetingStatus, { label: string; badgeClass: string }> = {
  scheduled: { label: "مجدول", badgeClass: "bg-sky-500/15 text-sky-700" },
  completed: { label: "تم", badgeClass: "bg-emerald-500/15 text-emerald-700" },
  cancelled: { label: "ملغى", badgeClass: "bg-stone-500/15 text-stone-700" },
}

function sortMeetings(list: GuestPrepMeeting[]): GuestPrepMeeting[] {
  return [...list].sort((a, b) => {
    const sa = a.scheduled_at ? Date.parse(a.scheduled_at) : 0
    const sb = b.scheduled_at ? Date.parse(b.scheduled_at) : 0
    if (sb !== sa) return sb - sa
    return Date.parse(b.created_at) - Date.parse(a.created_at)
  })
}

export function PrepMeetingsPanel({ candidateId, initialMeetings }: Props) {
  const { toast } = useToast()
  const [meetings, setMeetings] = useState<GuestPrepMeeting[]>(() => sortMeetings(initialMeetings))

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [type, setType] = useState("video")
  const [scheduledAt, setScheduledAt] = useState("")
  const [duration, setDuration] = useState("")
  const [notes, setNotes] = useState("")
  const [creating, setCreating] = useState(false)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [outcomeEditId, setOutcomeEditId] = useState<string | null>(null)
  const [outcomeDraft, setOutcomeDraft] = useState("")

  function resetForm() {
    setTitle("")
    setType("video")
    setScheduledAt("")
    setDuration("")
    setNotes("")
    setShowForm(false)
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const { meeting } = await candidatesApi.createPrepMeeting(candidateId, {
        title: title.trim() || "لقاء تحضيري",
        type,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        duration_minutes: duration ? Number(duration) : null,
        notes: notes.trim() || null,
      })
      setMeetings((m) => sortMeetings([meeting, ...m]))
      toast({ title: "تمت جدولة اللقاء" })
      resetForm()
    } catch (err) {
      toast({ variant: "destructive", title: "فشلت الجدولة", description: err instanceof Error ? err.message : "خطأ" })
    } finally {
      setCreating(false)
    }
  }

  async function patchMeeting(id: string, body: Partial<{ status: string; outcome: string | null }>) {
    setBusyId(id)
    try {
      const { meeting } = await candidatesApi.updatePrepMeeting(candidateId, id, body)
      setMeetings((m) => sortMeetings(m.map((x) => (x.id === id ? meeting : x))))
      return true
    } catch (err) {
      toast({ variant: "destructive", title: "فشل التحديث", description: err instanceof Error ? err.message : "خطأ" })
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function handleStatus(id: string, status: GuestPrepMeetingStatus) {
    const ok = await patchMeeting(id, { status })
    if (ok) toast({ title: "تم تحديث الحالة", description: STATUS_META[status].label })
  }

  async function handleSaveOutcome(id: string) {
    const ok = await patchMeeting(id, { outcome: outcomeDraft.trim() || null })
    if (ok) {
      setOutcomeEditId(null)
      setOutcomeDraft("")
      toast({ title: "تم حفظ النتيجة" })
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("حذف هذا اللقاء؟")) return
    setBusyId(id)
    try {
      await candidatesApi.deletePrepMeeting(candidateId, id)
      setMeetings((m) => m.filter((x) => x.id !== id))
      toast({ title: "تم الحذف" })
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الحذف", description: err instanceof Error ? err.message : "خطأ" })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      {meetings.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-border/40 p-6 text-center">
          <Calendar className="mx-auto mb-2 h-5 w-5 text-muted-foreground/70" />
          <p className="mb-3 text-xs text-muted-foreground">لا توجد لقاءات تحضيرية بعد</p>
          <Button size="sm" variant="ghost" onClick={() => setShowForm(true)}>
            <Plus className="ms-1 h-3.5 w-3.5" /> جدولة لقاء
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {meetings.map((mtg) => {
            const meta = STATUS_META[mtg.status] ?? STATUS_META.scheduled
            const isBusy = busyId === mtg.id
            return (
              <div key={mtg.id} className="rounded-lg border border-border/30 bg-background/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${meta.badgeClass}`}>
                    {meta.label}
                  </span>
                  <h4 className="text-xs font-semibold">{mtg.title}</h4>
                  <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    {TYPE_LABEL[mtg.type] ?? mtg.type}
                  </span>
                  {isBusy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {mtg.scheduled_at ? formatDateTime(mtg.scheduled_at) : "بدون موعد محدد"}
                  </span>
                  {mtg.duration_minutes != null && <span>{mtg.duration_minutes} دقيقة</span>}
                </div>

                {mtg.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/75">{mtg.notes}</p>
                )}

                {mtg.outcome && outcomeEditId !== mtg.id && (
                  <div className="mt-2 rounded-md bg-emerald-500/5 p-2 text-[11px] text-foreground/80">
                    <span className="font-semibold text-emerald-700">النتيجة: </span>
                    <span className="whitespace-pre-wrap">{mtg.outcome}</span>
                  </div>
                )}

                {outcomeEditId === mtg.id && (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={outcomeDraft}
                      onChange={(e) => setOutcomeDraft(e.target.value)}
                      placeholder="ماذا نتج عن اللقاء؟"
                      rows={2}
                      className="text-xs"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setOutcomeEditId(null); setOutcomeDraft("") }}>
                        إلغاء
                      </Button>
                      <Button size="sm" onClick={() => handleSaveOutcome(mtg.id)} disabled={isBusy}>
                        {isBusy && <Loader2 className="ms-1 h-3 w-3 animate-spin" />}
                        حفظ النتيجة
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/20 pt-2">
                  {mtg.status === "scheduled" && (
                    <>
                      <ActionBtn onClick={() => handleStatus(mtg.id, "completed")} disabled={isBusy} icon={<Check className="h-3 w-3" />}>
                        تم الاجتماع
                      </ActionBtn>
                      <ActionBtn onClick={() => handleStatus(mtg.id, "cancelled")} disabled={isBusy} icon={<X className="h-3 w-3" />}>
                        إلغاء
                      </ActionBtn>
                    </>
                  )}
                  {mtg.status === "completed" && (
                    <ActionBtn
                      onClick={() => { setOutcomeEditId(mtg.id); setOutcomeDraft(mtg.outcome ?? "") }}
                      disabled={isBusy}
                      icon={<Plus className="h-3 w-3" />}
                    >
                      {mtg.outcome ? "تعديل النتيجة" : "إضافة نتيجة"}
                    </ActionBtn>
                  )}
                  {mtg.status !== "scheduled" && (
                    <ActionBtn onClick={() => handleStatus(mtg.id, "scheduled")} disabled={isBusy} icon={<RotateCcw className="h-3 w-3" />}>
                      إعادة للجدولة
                    </ActionBtn>
                  )}
                  <button
                    onClick={() => handleDelete(mtg.id)}
                    disabled={isBusy}
                    className="ms-auto inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" /> حذف
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm ? (
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="لقاء تحضيري"
            className="h-8 text-xs"
          />
          <div className="flex gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-8 w-28 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="h-8 flex-1 text-xs"
            />
            <Input
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="دقائق"
              dir="ltr"
              className="h-8 w-20 text-xs"
            />
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات (اختياري)"
            rows={2}
            className="text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={resetForm} disabled={creating}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="ms-1 h-3 w-3 animate-spin" />}
              جدولة
            </Button>
          </div>
        </div>
      ) : (
        meetings.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowForm(true)} className="w-full text-xs">
            <Plus className="ms-1 h-3 w-3" /> جدولة لقاء آخر
          </Button>
        )
      )}
    </div>
  )
}

function ActionBtn({ onClick, disabled, icon, children }: { onClick: () => void; disabled?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded border border-border/40 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  )
}
