"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Send,
  Loader2,
  Copy,
  Check,
  X,
  ExternalLink,
  Plus,
  Mail,
  MessageCircle,
  Link2,
  Clock,
  CheckCircle2,
  CircleDashed,
} from "lucide-react"
import { useToast } from "@/lib/use-toast"
import { formatDate, formatDateTime } from "@/lib/shared/formatters"
import { candidatesApi } from "../lib/api"
import type {
  PrepFormLink,
  PrepFormLinkStatus,
  PrepFormTemplate,
} from "@/types/database"

interface Props {
  candidateId: string
  initialLinks: PrepFormLink[]
  onChange?: () => void
}

const STATUS_META: Record<PrepFormLinkStatus, { label: string; icon: typeof Clock; color: string }> = {
  draft:       { label: "مسودة",     icon: CircleDashed, color: "text-slate-500" },
  sent:        { label: "أُرسل",     icon: Send,         color: "text-blue-500" },
  opened:      { label: "تم الفتح",  icon: ExternalLink, color: "text-sky-500" },
  in_progress: { label: "قيد التعبئة", icon: Clock,        color: "text-amber-500" },
  completed:   { label: "مكتمل",     icon: CheckCircle2, color: "text-emerald-500" },
  expired:     { label: "منتهي",     icon: Clock,        color: "text-zinc-500" },
  cancelled:   { label: "ملغى",      icon: X,            color: "text-rose-500" },
}

export function PrepLinkPanel({ candidateId, initialLinks, onChange }: Props) {
  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [templates, setTemplates] = useState<PrepFormTemplate[]>([])
  const [templateId, setTemplateId] = useState<string>("")
  const [expiresInDays, setExpiresInDays] = useState(30)
  const [adminMessage, setAdminMessage] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Lazy-load templates when create form opens
  useEffect(() => {
    if (!showCreate || templates.length > 0) return
    candidatesApi
      .listPrepTemplates(true)
      .then(({ templates: t }) => {
        setTemplates(t)
        const def = t.find((x) => x.is_default) || t[0]
        if (def) setTemplateId(def.id)
      })
      .catch((err) => {
        toast({
          variant: "destructive",
          title: "فشل تحميل القوالب",
          description: err instanceof Error ? err.message : "خطأ",
        })
      })
  }, [showCreate, templates.length, toast])

  function publicUrl(token: string): string {
    if (typeof window === "undefined") return `/candidate-prep/${token}`
    return `${window.location.origin}/candidate-prep/${token}`
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const { link } = await candidatesApi.createPrepLink(candidateId, {
        template_id: templateId || undefined,
        expires_in_days: expiresInDays,
        admin_message: adminMessage.trim() || undefined,
      })
      toast({
        title: "تم إنشاء الرابط",
        description: "يمكنك نسخه ومشاركته الآن",
      })
      // Auto-copy
      try {
        await navigator.clipboard.writeText(publicUrl(link.token))
        setCopiedId(link.id)
        setTimeout(() => setCopiedId(null), 1500)
      } catch {
        // ignore
      }
      setShowCreate(false)
      setAdminMessage("")
      onChange?.()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "فشل الإنشاء",
        description: err instanceof Error ? err.message : "خطأ",
      })
    } finally {
      setCreating(false)
    }
  }

  async function handleCopy(link: PrepFormLink) {
    try {
      await navigator.clipboard.writeText(publicUrl(link.token))
      setCopiedId(link.id)
      setTimeout(() => setCopiedId(null), 1500)
      toast({ title: "تم النسخ" })
    } catch {
      toast({ variant: "destructive", title: "فشل النسخ" })
    }
  }

  async function handleMarkSent(link: PrepFormLink, channel: "whatsapp" | "email" | "manual_copy") {
    try {
      await candidatesApi.markPrepLinkSent(candidateId, link.id, channel)
      toast({ title: "تم تعليم الرابط كمُرسَل" })
      onChange?.()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "فشل التحديث",
        description: err instanceof Error ? err.message : "خطأ",
      })
    }
  }

  async function handleCancel(link: PrepFormLink) {
    if (!confirm("إلغاء هذا الرابط؟ لن يستطيع الضيف الوصول إليه بعد الإلغاء.")) return
    try {
      await candidatesApi.cancelPrepLink(candidateId, link.id)
      toast({ title: "تم الإلغاء" })
      onChange?.()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "فشل الإلغاء",
        description: err instanceof Error ? err.message : "خطأ",
      })
    }
  }

  function whatsappShareUrl(link: PrepFormLink): string {
    const text = encodeURIComponent(
      `أهلاً، يسعدنا أن تكون ضيفاً على بودكاست خط. يمكنك تعبئة نموذج التحضير من هنا:\n${publicUrl(link.token)}`,
    )
    return `https://wa.me/?text=${text}`
  }

  function mailtoUrl(link: PrepFormLink): string {
    const subject = encodeURIComponent("نموذج تحضير — خط بودكاست")
    const body = encodeURIComponent(
      `مرحباً،\n\nيسعدنا أن تكون ضيفاً معنا في بودكاست خط. لنتمكن من التحضير لاستضافتك بأفضل شكل، يرجى تعبئة هذا النموذج:\n\n${publicUrl(link.token)}\n\nشكراً لك،\nفريق خط`,
    )
    return `mailto:?subject=${subject}&body=${body}`
  }

  return (
    <div className="space-y-3">
      {/* Create form */}
      {showCreate ? (
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">القالب</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
            >
              {templates.length === 0 && <option value="">جارٍ التحميل...</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_default ? "(افتراضي)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">صلاحية الرابط (بالأيام)</label>
            <Input
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Math.max(1, parseInt(e.target.value || "30", 10)))}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">
              رسالة شخصية للضيف (تظهر أعلى النموذج، اختياري)
            </label>
            <Textarea
              value={adminMessage}
              onChange={(e) => setAdminMessage(e.target.value)}
              rows={3}
              placeholder="مثال: شكراً لاهتمامك بالحوار معنا. هذه أسئلة سريعة لنحضّر بشكل مناسب."
              className="text-xs leading-relaxed"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={creating || (!templateId && templates.length > 0)}>
              {creating && <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" />}
              <Plus className="ms-1 h-3.5 w-3.5" />
              إنشاء الرابط
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowCreate(true)} size="sm" className="w-full">
          <Plus className="ms-1 h-3.5 w-3.5" />
          إنشاء رابط تحضير جديد
        </Button>
      )}

      {/* Active links list */}
      {initialLinks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/40 p-6 text-center">
          <Link2 className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            لم يُرسل أي رابط تحضير لهذا المرشح بعد
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {initialLinks.map((link) => {
            const meta = STATUS_META[link.status]
            const Icon = meta.icon
            const url = publicUrl(link.token)
            const expired = link.expires_at && new Date(link.expires_at).getTime() < Date.now()
            const isOver = link.status === "completed" || link.status === "cancelled" || expired
            return (
              <div key={link.id} className="rounded-lg border border-border/30 bg-background/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                    <span className="text-[11px] font-semibold">{meta.label}</span>
                    {expired && link.status !== "completed" && (
                      <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-[9px] text-zinc-600 dark:text-zinc-400">
                        منتهي الصلاحية
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60">
                    {formatDate(link.created_at)}
                  </div>
                </div>

                <div className="mb-2 flex items-center gap-1">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted/40 px-2 py-1 text-[10px] text-foreground/70">
                    {url}
                  </code>
                  <button
                    onClick={() => handleCopy(link)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="نسخ"
                  >
                    {copiedId === link.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="فتح"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

                {!isOver && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <a
                      href={whatsappShareUrl(link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleMarkSent(link, "whatsapp")}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                    >
                      <MessageCircle className="h-3 w-3" />
                      واتساب
                    </a>
                    <a
                      href={mailtoUrl(link)}
                      onClick={() => handleMarkSent(link, "email")}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] text-blue-700 hover:bg-blue-500/20 dark:text-blue-400"
                    >
                      <Mail className="h-3 w-3" />
                      بريد
                    </a>
                    <button
                      onClick={() => handleCancel(link)}
                      className="ms-auto rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                      title="إلغاء"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Activity meta */}
                {(link.first_opened_at || link.submitted_at || link.sent_via) && (
                  <div className="mt-2 border-t border-border/20 pt-2 text-[9px] text-muted-foreground/70 space-y-0.5">
                    {link.sent_via && <div>أُرسل عبر: {link.sent_via === "whatsapp" ? "واتساب" : link.sent_via === "email" ? "بريد" : "نسخ يدوي"}</div>}
                    {link.first_opened_at && <div>فُتح أول مرة: {formatDateTime(link.first_opened_at)}</div>}
                    {link.submitted_at && <div>تم الإرسال: {formatDateTime(link.submitted_at)}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
