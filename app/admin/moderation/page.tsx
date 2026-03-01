"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Check,
  X,
  EyeOff,
  Loader2,
  AlertTriangle,
  Shield,
  Pencil,
  Trash2,
  MessageSquare,
  FileText,
  Reply,
} from "lucide-react"
import { getModerationQueue, moderateContent } from "@/lib/space-api"
import { toast } from "@/lib/use-toast"

interface ModerationItem {
  id: string
  _type?: string
  title?: string
  content?: string
  moderation_status?: string
  moderation_reason?: string | null
  created_at: string
  profiles?: { id: string; display_name: string | null; avatar_url: string | null }
  // Report fields
  target_type?: string
  target_id?: string
  reason?: string
  details?: string
  status?: string
}

const TYPE_LABELS: Record<string, string> = {
  article: "مقال",
  thought: "خاطرة",
  comment: "تعليق",
  reply: "رد",
  report: "بلاغ",
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  article: FileText,
  thought: MessageSquare,
  comment: MessageSquare,
  reply: Reply,
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  article: { bg: "bg-blue-500/10", text: "text-blue-500" },
  thought: { bg: "bg-purple-500/10", text: "text-purple-500" },
  comment: { bg: "bg-cyan-500/10", text: "text-cyan-500" },
  reply: { bg: "bg-teal-500/10", text: "text-teal-500" },
  report: { bg: "bg-red-500/10", text: "text-red-500" },
}

const REASON_LABELS: Record<string, string> = {
  spam: "سبام",
  harassment: "تحرش",
  inappropriate: "محتوى غير لائق",
  misinformation: "معلومات مضللة",
  other: "أخرى",
}

const TABS = [
  { value: "pending", label: "قيد المراجعة" },
  { value: "flagged", label: "مُبلَّغ تلقائياً" },
  { value: "reports", label: "بلاغات المستخدمين" },
]

export default function ModerationPage() {
  const [tab, setTab] = useState("pending")
  const [items, setItems] = useState<ModerationItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const fetchQueue = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await getModerationQueue(tab) as {
      data?: { items: ModerationItem[]; total: number }
      error?: string
    }
    if (error) {
      toast({ title: "خطأ", description: error, variant: "destructive" })
    } else if (data) {
      setItems(data.items || [])
      setTotal(data.total || 0)
    }
    setIsLoading(false)
  }, [tab])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  const handleAction = async (
    itemId: string,
    action: string,
    targetType: string,
    extra?: { content?: string }
  ) => {
    setActionLoading(itemId)
    const { error } = await moderateContent(itemId, {
      action,
      target_type: targetType,
      ...extra,
    })
    if (error) {
      toast({ title: "خطأ", description: error, variant: "destructive" })
    } else {
      const actionLabels: Record<string, string> = {
        approve: "تمت الموافقة",
        reject: "تم الرفض",
        hide: "تم الإخفاء",
        edit: "تم التعديل والنشر",
        delete: "تم الحذف",
      }
      toast({
        title: actionLabels[action] || "تم تنفيذ الإجراء",
        variant: "success",
        duration: 2000,
      })
      setItems((prev) => prev.filter((item) => item.id !== itemId))
      setTotal((prev) => prev - 1)
      setEditingId(null)
      setConfirmDeleteId(null)
    }
    setActionLoading(null)
  }

  const handleSaveEdit = async (item: ModerationItem) => {
    if (!editContent.trim()) return
    const itemType = getItemType(item)
    await handleAction(item.id, "edit", itemType, { content: editContent.trim() })
  }

  const getItemType = (item: ModerationItem) => {
    if (tab === "reports") return "report"
    return item._type || "article"
  }

  return (
    <div className="space-y-6">
      {/* Compact Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">الإشراف على المحتوى</h1>
        <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {total} عنصر
        </span>
      </div>

      {/* Custom Tabs */}
      <div className="flex items-center gap-2 rounded-xl border border-border/30 bg-card/50 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={
              tab === t.value
                ? "rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm font-medium ring-1 ring-border/50"
                : "rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/[0.03]"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/[0.03] ring-1 ring-border/50">
            <Check className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold text-muted-foreground">لا توجد عناصر في الانتظار</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground/60">كل المحتوى تمت مراجعته</p>
        </div>
      ) : (
        <div className="divide-y divide-border/20 rounded-xl border border-border/30 bg-card/50">
          {items.map((item) => {
            const itemType = getItemType(item)
            const isReport = tab === "reports"
            const isProcessing = actionLoading === item.id
            const isEditing = editingId === item.id
            const isConfirmingDelete = confirmDeleteId === item.id
            const TypeIcon = TYPE_ICONS[itemType] || MessageSquare
            const colors = TYPE_COLORS[itemType] || TYPE_COLORS.article

            return (
              <div key={item.id} className="px-4 py-3 transition-colors hover:bg-muted/50">
                {/* Row Header */}
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${colors.bg}`}>
                    <TypeIcon className={`h-4 w-4 ${colors.text}`} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                      {TYPE_LABELS[itemType] || itemType}
                    </span>
                    {isReport && (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
                        بلاغ
                      </span>
                    )}
                    {item.moderation_status === "auto_flagged" && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        مُبلَّغ تلقائياً
                      </span>
                    )}
                    {item.moderation_reason && (
                      <span className="flex items-center gap-1 rounded-full bg-yellow-500/5 px-2 py-0.5 text-[10px] font-medium text-yellow-600">
                        <Shield className="h-2.5 w-2.5" />
                        {item.moderation_reason}
                      </span>
                    )}
                  </div>
                  <div className="flex-1" />
                  {item.profiles && (
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {item.profiles.display_name || "مجهول"}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {(() => { const d = new Date(item.created_at); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` })()}
                  </span>
                </div>

                {/* Content (indented) */}
                <div className="ms-11 mt-2">
                  {!isReport && (
                    <>
                      {item.title && (
                        <p className="text-sm font-medium">{item.title}</p>
                      )}
                      {!item.title && item.content && (
                        <p className="text-sm font-medium">{item.content.substring(0, 80)}</p>
                      )}

                      {item.content && (
                        <>
                          {isEditing ? (
                            <div className="mt-2 space-y-2">
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setEditingId(null)
                                }}
                                dir="auto"
                                className="w-full resize-none rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                                rows={4}
                                autoFocus
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveEdit(item)}
                                  disabled={isProcessing || !editContent.trim()}
                                  className="h-8 gap-1 rounded-xl text-xs"
                                >
                                  {isProcessing ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                  حفظ ونشر
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingId(null)}
                                  className="h-8 rounded-xl text-xs"
                                >
                                  إلغاء
                                </Button>
                              </div>
                            </div>
                          ) : (
                            item.title && (
                              <div className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white/[0.02] p-3 text-sm ring-1 ring-border/15">
                                {item.content.substring(0, 500)}
                                {(item.content.length || 0) > 500 && "..."}
                              </div>
                            )
                          )}
                        </>
                      )}
                    </>
                  )}

                  {isReport && (
                    <div className="space-y-1.5">
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
                        {REASON_LABELS[item.reason || ""] || item.reason}
                      </span>
                      {item.details && (
                        <p className="text-sm text-muted-foreground">{item.details}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        نوع المحتوى: {TYPE_LABELS[item.target_type || ""] || item.target_type} | المعرف:{" "}
                        {item.target_id?.substring(0, 8)}...
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  {!isEditing && (
                    <div className="mt-2 flex items-center gap-2">
                      {isConfirmingDelete ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleAction(item.id, "delete", itemType)}
                            disabled={isProcessing}
                            className="h-8 gap-1 rounded-xl text-xs"
                          >
                            {isProcessing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            تأكيد الحذف
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(null)}
                            className="h-8 rounded-xl text-xs"
                          >
                            إلغاء
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleAction(item.id, "approve", itemType)}
                            disabled={isProcessing}
                            className="h-8 gap-1 rounded-xl text-xs"
                          >
                            {isProcessing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            {isReport ? "تم حلها" : "قبول"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleAction(item.id, "reject", itemType)}
                            disabled={isProcessing}
                            className="h-8 gap-1 rounded-xl text-xs"
                          >
                            <X className="h-3.5 w-3.5" />
                            رفض
                          </Button>
                          {!isReport && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingId(item.id)
                                  setEditContent(item.content || "")
                                }}
                                disabled={isProcessing}
                                className="h-8 w-8 rounded-xl p-0"
                                title="تعديل"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleAction(item.id, "hide", itemType)}
                                disabled={isProcessing}
                                className="h-8 w-8 rounded-xl p-0"
                                title="إخفاء"
                              >
                                <EyeOff className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDeleteId(item.id)}
                                disabled={isProcessing}
                                className="h-8 w-8 rounded-xl p-0 text-destructive hover:text-destructive"
                                title="حذف"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
