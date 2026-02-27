"use client"

import { useState, useMemo } from "react"
import {
  Loader2,
  Sparkles,
  BookOpen,
  FileText,
  ExternalLink,
  Check,
  X,
  RotateCcw,
  Pencil,
  ChevronDown,
  AlertCircle,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { CuratedResource } from "@/lib/queries/curated-resources"
import {
  approveResourceAction,
  rejectResourceAction,
  editResourceAction,
  resetResourceAction,
  deleteResourceAction,
} from "./actions"

interface ResourcesAdminProps {
  initialResources: CuratedResource[]
  counts: { pending: number; approved: number; rejected: number; total: number }
  lastGenerated: string | null
}

type FilterStatus = "all" | "pending" | "approved" | "rejected" | "deleted"

const typeConfig: Record<string, { label: string; icon: typeof BookOpen; color: string }> = {
  book: { label: "كتاب", icon: BookOpen, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  article: { label: "مقال", icon: FileText, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  link: { label: "رابط", icon: ExternalLink, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "معلّقة", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  approved: { label: "مُوافق", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  rejected: { label: "مرفوض", color: "bg-red-500/10 text-red-600 dark:text-red-400" },
  deleted: { label: "محذوفة", color: "bg-gray-500/10 text-gray-500 dark:text-gray-400" },
}

export function ResourcesAdmin({ initialResources, counts, lastGenerated }: ResourcesAdminProps) {
  const [resources, setResources] = useState(initialResources)
  const [filter, setFilter] = useState<FilterStatus>("all")
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState("")
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ title: string; url: string; author: string }>({ title: "", url: "", author: "" })
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)

  const showMessage = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), 3000)
  }

  const filtered = useMemo(() => {
    if (filter === "all") return resources.filter((r) => r.status !== "deleted")
    return resources.filter((r) => r.status === filter)
  }, [resources, filter])

  const liveCounts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, deleted: 0, total: 0 }
    for (const r of resources) {
      if (r.status === "deleted") { c.deleted++; continue }
      if (r.status === "pending") c.pending++
      else if (r.status === "approved") c.approved++
      else if (r.status === "rejected") c.rejected++
      c.total++
    }
    return c
  }, [resources])

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError("")
    try {
      const res = await fetch("/api/admin/resources/generate", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setGenError(data.error || "حدث خطأ")
        return
      }
      showMessage(`تم إنشاء ${data.count} مورد جديد`)
      // Refresh page to get new data
      window.location.reload()
    } catch {
      setGenError("حدث خطأ في الاتصال")
    } finally {
      setGenerating(false)
    }
  }

  const handleApprove = async (id: string) => {
    setActioningId(id)
    try {
      const updated = await approveResourceAction(id)
      if (updated) {
        setResources((prev) => prev.map((r) => (r.id === id ? updated : r)))
        showMessage("تمت الموافقة")
      }
    } catch {
      showMessage("حدث خطأ")
    }
    setActioningId(null)
  }

  const handleReject = async (id: string) => {
    setActioningId(id)
    try {
      const updated = await rejectResourceAction(id)
      if (updated) {
        setResources((prev) => prev.map((r) => (r.id === id ? updated : r)))
        showMessage("تم الرفض")
      }
    } catch {
      showMessage("حدث خطأ")
    }
    setActioningId(null)
  }

  const handleReset = async (id: string) => {
    setActioningId(id)
    try {
      const updated = await resetResourceAction(id)
      if (updated) {
        setResources((prev) => prev.map((r) => (r.id === id ? updated : r)))
        showMessage("تم الإرجاع للمعلّقة")
      }
    } catch {
      showMessage("حدث خطأ")
    }
    setActioningId(null)
  }

  const handleDelete = async (id: string) => {
    setActioningId(id)
    try {
      const updated = await deleteResourceAction(id)
      if (updated) {
        setResources((prev) => prev.map((r) => (r.id === id ? updated : r)))
        showMessage("تم الحذف")
      }
    } catch {
      showMessage("حدث خطأ")
    }
    setActioningId(null)
  }

  const startEdit = (r: CuratedResource) => {
    setEditingId(r.id)
    setEditForm({ title: r.title, url: r.url || "", author: r.author || "" })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    setActioningId(editingId)
    try {
      const updated = await editResourceAction(editingId, editForm)
      if (updated) {
        setResources((prev) => prev.map((r) => (r.id === editingId ? updated : r)))
        showMessage("تم الحفظ")
      }
    } catch {
      showMessage("حدث خطأ")
    }
    setEditingId(null)
    setActioningId(null)
  }

  const toggleReasoning = (id: string) => {
    setExpandedReasoning((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">خطوط</h1>
        <span className="rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-400">
          {liveCounts.pending} معلّقة
        </span>
        <span className="rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
          {liveCounts.approved} مُوافق
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {liveCounts.total} إجمالي
        </span>
        <div className="flex-1" />
        {message && (
          <span className={`text-sm ${message.includes("خطأ") ? "text-destructive" : "text-green-500"}`}>
            {message}
          </span>
        )}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generating ? "جارٍ الإنشاء..." : "طلب تحديث"}
        </button>
      </div>

      {/* Last generated */}
      {lastGenerated && (
        <p className="text-xs text-muted-foreground">
          آخر تحديث: {new Date(lastGenerated).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          {" "}
          {new Date(lastGenerated).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

      {/* Generation error */}
      {genError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{genError}</p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "pending", "approved", "rejected", "deleted"] as FilterStatus[]).map((s) => {
          const label = s === "all" ? "الكل" : statusConfig[s].label
          const count = s === "all" ? liveCounts.total : liveCounts[s as keyof typeof liveCounts]
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                filter === s
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {label}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/50 p-12 text-center text-muted-foreground">
          {resources.length === 0 ? (
            <>
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="mb-1">لا توجد موارد بعد</p>
              <p className="text-sm">اضغط "طلب تحديث" لبدء اقتراحات الذكاء الاصطناعي</p>
            </>
          ) : (
            <p>لا توجد موارد بحالة "{statusConfig[filter]?.label || filter}"</p>
          )}
        </div>
      )}

      {/* Resource cards */}
      <div className="space-y-3">
        {filtered.map((resource) => {
          const tc = typeConfig[resource.type] || typeConfig.link
          const sc = statusConfig[resource.status || "pending"]
          const TypeIcon = tc.icon
          const isEditing = editingId === resource.id
          const isActioning = actioningId === resource.id
          const isReasoningExpanded = expandedReasoning.has(resource.id)

          return (
            <div
              key={resource.id}
              className="rounded-xl border border-border/30 bg-card/50 p-4 space-y-3"
            >
              {/* Top row: type + title + status + actions */}
              <div className="flex items-start gap-3">
                {/* Type icon */}
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tc.color)}>
                  <TypeIcon className="h-4 w-4" />
                </div>

                {/* Title + author */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <input
                        value={editForm.author}
                        onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                        placeholder="المؤلف"
                        className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <input
                        value={editForm.url}
                        onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                        placeholder="الرابط"
                        dir="ltr"
                        className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={isActioning}
                          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                        >
                          {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          حفظ
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-lg px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-sm leading-tight">{resource.title}</p>
                      {resource.author && (
                        <p className="text-xs text-muted-foreground mt-0.5">{resource.author}</p>
                      )}
                    </>
                  )}
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tc.color)}>
                    {tc.label}
                  </span>
                  {resource.topic && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {resource.topic}
                    </span>
                  )}
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", sc.color)}>
                    {sc.label}
                  </span>
                </div>
              </div>

              {/* Description */}
              {resource.description && !isEditing && (
                <p className="text-xs text-muted-foreground leading-relaxed">{resource.description}</p>
              )}

              {/* URL */}
              {resource.url && !isEditing && (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline truncate"
                  dir="ltr"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {resource.url}
                </a>
              )}

              {/* AI Reasoning (collapsible) */}
              {resource.ai_reasoning && !isEditing && (
                <div>
                  <button
                    onClick={() => toggleReasoning(resource.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className={cn("h-3 w-3 transition-transform", !isReasoningExpanded && "-rotate-90")} />
                    سبب الاقتراح
                  </button>
                  {isReasoningExpanded && (
                    <p className="mt-1 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                      {resource.ai_reasoning}
                    </p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {!isEditing && (
                <div className="flex gap-2 pt-1">
                  {resource.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleApprove(resource.id)}
                        disabled={isActioning}
                        className="flex items-center gap-1 rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-500/20 dark:text-green-400 disabled:opacity-50"
                      >
                        {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        موافقة
                      </button>
                      <button
                        onClick={() => handleReject(resource.id)}
                        disabled={isActioning}
                        className="flex items-center gap-1 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/20 dark:text-red-400 disabled:opacity-50"
                      >
                        {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                        رفض
                      </button>
                      <button
                        onClick={() => startEdit(resource)}
                        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                        تعديل
                      </button>
                      <button
                        onClick={() => handleDelete(resource.id)}
                        disabled={isActioning}
                        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        حذف
                      </button>
                    </>
                  )}
                  {resource.status === "rejected" && (
                    <>
                      <button
                        onClick={() => handleReset(resource.id)}
                        disabled={isActioning}
                        className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        إعادة للمراجعة
                      </button>
                      <button
                        onClick={() => handleDelete(resource.id)}
                        disabled={isActioning}
                        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        حذف
                      </button>
                    </>
                  )}
                  {resource.status === "approved" && (
                    <>
                      <button
                        onClick={() => startEdit(resource)}
                        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                        تعديل
                      </button>
                      <button
                        onClick={() => handleDelete(resource.id)}
                        disabled={isActioning}
                        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        حذف
                      </button>
                    </>
                  )}
                  {resource.status === "deleted" && (
                    <button
                      onClick={() => handleReset(resource.id)}
                      disabled={isActioning}
                      className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                      استعادة
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
