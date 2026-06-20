"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Mail,
  MessageCircle,
  Send,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Trash2,
  Plus,
} from "lucide-react"
import { useToast } from "@/lib/use-toast"
import { candidatesApi } from "../lib/api"
import type { OutreachChannel, OutreachTone, GuestCandidateOutreachMessage } from "@/types/database"

interface Props {
  candidateId: string
  initialMessages: GuestCandidateOutreachMessage[]
  onChange?: () => void
}

const CHANNELS: { value: OutreachChannel; label: string; icon: typeof Mail }[] = [
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "email",    label: "بريد إلكتروني", icon: Mail },
  { value: "dm",       label: "رسالة مباشرة", icon: Send },
]

const TONES: { value: OutreachTone; label: string }[] = [
  { value: "warm",    label: "دافئ ودود" },
  { value: "formal",  label: "رسمي محترم" },
  { value: "concise", label: "موجز ومباشر" },
  { value: "premium", label: "راقي وأنيق" },
]

const LENGTHS = [
  { value: "short", label: "قصيرة" },
  { value: "medium", label: "متوسطة" },
  { value: "long", label: "مفصلة" },
] as const

export function OutreachPanel({ candidateId, initialMessages, onChange }: Props) {
  const { toast } = useToast()

  const [channel, setChannel] = useState<OutreachChannel>("whatsapp")
  const [tone, setTone] = useState<OutreachTone>("warm")
  const [length, setLength] = useState<"short" | "medium" | "long">("medium")
  const [customNote, setCustomNote] = useState("")

  const [draftSubject, setDraftSubject] = useState<string | null>(null)
  const [draftBody, setDraftBody] = useState("")
  const [hasDraft, setHasDraft] = useState(false)
  const [draftEdited, setDraftEdited] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Reset draft state when channel changes (subject_line only relevant for email)
  useEffect(() => {
    if (channel !== "email") setDraftSubject(null)
  }, [channel])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const result = await candidatesApi.generateOutreach(candidateId, {
        channel,
        tone,
        length,
        customNote: customNote.trim() || undefined,
      })
      setDraftSubject(result.draft.subject_line)
      setDraftBody(result.draft.message_body)
      setHasDraft(true)
      setDraftEdited(false)
      toast({ title: "تم التوليد", description: "يمكنك التعديل ثم الحفظ" })
    } catch (err) {
      toast({ variant: "destructive", title: "فشل التوليد", description: err instanceof Error ? err.message : "خطأ" })
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!draftBody.trim() || draftBody.trim().length < 10) {
      toast({ variant: "destructive", title: "نص الرسالة قصير جداً" })
      return
    }
    setSaving(true)
    try {
      await candidatesApi.saveOutreach(candidateId, {
        channel,
        tone,
        subject_line: channel === "email" ? draftSubject : null,
        message_body: draftBody.trim(),
        generated_by_ai: true,
        edited_by_admin: draftEdited,
      })
      toast({ title: "تم الحفظ", description: "تمت إضافة الرسالة إلى السجل" })
      setHasDraft(false)
      setDraftBody("")
      setDraftSubject(null)
      setDraftEdited(false)
      onChange?.()
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الحفظ", description: err instanceof Error ? err.message : "خطأ" })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(messageId: string) {
    if (!confirm("حذف هذه الرسالة من السجل؟")) return
    try {
      await candidatesApi.deleteOutreach(candidateId, messageId)
      toast({ title: "تم الحذف" })
      onChange?.()
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الحذف", description: err instanceof Error ? err.message : "خطأ" })
    }
  }

  async function handleCopy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      toast({ variant: "destructive", title: "فشل النسخ" })
    }
  }

  return (
    <div className="space-y-4">
      {/* Generator controls */}
      <div className="rounded-lg border border-border/40 bg-background/30 p-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">القناة</label>
            <div className="flex gap-1">
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setChannel(c.value)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors ${
                    channel === c.value
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-input bg-transparent text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">النبرة</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as OutreachTone)}
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
            >
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">الطول</label>
            <select
              value={length}
              onChange={(e) => setLength(e.target.value as typeof length)}
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
            >
              {LENGTHS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">
            ملاحظة للذكاء الاصطناعي (اختياري)
          </label>
          <Input
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            placeholder="مثال: نريد التركيز على موضوع التعليم في الحوار"
            className="h-8 text-xs"
          />
        </div>

        <Button onClick={handleGenerate} disabled={generating} size="sm" className="w-full">
          {generating ? <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="ms-1 h-3.5 w-3.5" />}
          {generating ? "جارٍ التوليد..." : hasDraft ? "إعادة التوليد" : "توليد رسالة بالذكاء الاصطناعي"}
        </Button>
      </div>

      {/* Draft editor */}
      {hasDraft && (
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
              مسودة جديدة {draftEdited && "(تم التعديل)"}
            </span>
          </div>
          {channel === "email" && (
            <div>
              <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">الموضوع</label>
              <Input
                value={draftSubject || ""}
                onChange={(e) => { setDraftSubject(e.target.value); setDraftEdited(true) }}
                className="h-8 text-xs"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">نص الرسالة</label>
            <Textarea
              value={draftBody}
              onChange={(e) => { setDraftBody(e.target.value); setDraftEdited(true) }}
              rows={8}
              className="text-xs leading-relaxed"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setHasDraft(false); setDraftBody(""); setDraftSubject(null); setDraftEdited(false) }}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" />}
              <Plus className="ms-1 h-3.5 w-3.5" />
              حفظ كنسخة
            </Button>
          </div>
        </div>
      )}

      {/* Saved messages history */}
      {initialMessages.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-semibold text-muted-foreground">السجل ({initialMessages.length})</h4>
          <div className="space-y-2">
            {initialMessages.map((msg) => (
              <div key={msg.id} className="rounded-lg border border-border/30 bg-background/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase">
                      v{msg.version_number}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {CHANNELS.find((c) => c.value === msg.channel_type)?.label || msg.channel_type}
                      {" • "}
                      {TONES.find((t) => t.value === msg.tone)?.label || msg.tone}
                    </span>
                    {msg.edited_by_admin && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-400">
                        معدلة
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopy(
                        msg.subject_line ? `${msg.subject_line}\n\n${msg.message_body}` : msg.message_body,
                        msg.id,
                      )}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="نسخ"
                    >
                      {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => handleDelete(msg.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700"
                      title="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {msg.subject_line && (
                  <div className="mb-1 text-[11px] font-semibold text-foreground/90">
                    {msg.subject_line}
                  </div>
                )}
                <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/80">
                  {msg.message_body}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
