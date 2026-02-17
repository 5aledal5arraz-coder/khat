"use client"

import { useState, useTransition, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Pencil, Trash2, Loader2, Tag, X } from "lucide-react"
import type { TopicConfig } from "@/types/topics"
import { createTopicAction, updateTopicAction, deleteTopicAction } from "./actions"

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#10b981", "#06b6d4", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899", "#f43f5e", "#64748b",
]

const ICON_OPTIONS = [
  "Heart", "Star", "Zap", "BookOpen", "Mic", "Users",
  "Lightbulb", "Brain", "Globe", "Compass", "Flame", "Award",
]

interface TopicsManagerProps {
  initialTopics: TopicConfig[]
}

export function TopicsManager({ initialTopics }: TopicsManagerProps) {
  const [topics, setTopics] = useState<TopicConfig[]>(initialTopics)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    color: "#3b82f6",
    icon: "",
  })

  // Close modal on Escape
  useEffect(() => {
    if (!showForm) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") resetForm()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [showForm])

  function resetForm() {
    setFormData({ name: "", slug: "", description: "", color: "#3b82f6", icon: "" })
    setEditingId(null)
    setShowForm(false)
  }

  function handleEdit(topic: TopicConfig) {
    setFormData({
      name: topic.name,
      slug: topic.slug,
      description: topic.description || "",
      color: topic.color,
      icon: topic.icon || "",
    })
    setEditingId(topic.id)
    setShowForm(true)
  }

  function autoSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\u0621-\u064Aa-z0-9-]/g, "")
  }

  function handleSave() {
    if (!formData.name || !formData.slug) return
    setMessage(null)
    startTransition(async () => {
      try {
        if (editingId) {
          await updateTopicAction(editingId, formData)
          setTopics((prev) =>
            prev.map((t) =>
              t.id === editingId
                ? { ...t, ...formData, updated_at: new Date().toISOString() }
                : t
            )
          )
        } else {
          await createTopicAction(formData)
          setTopics((prev) => [
            ...prev,
            {
              ...formData,
              id: `topic-${crypto.randomUUID()}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ])
        }
        setMessage(editingId ? "تم تحديث الموضوع" : "تم إضافة الموضوع")
        resetForm()
        setTimeout(() => setMessage(null), 3000)
      } catch {
        setMessage("حدث خطأ")
      }
    })
  }

  function handleDelete(id: string) {
    setMessage(null)
    startTransition(async () => {
      try {
        await deleteTopicAction(id)
        setTopics((prev) => prev.filter((t) => t.id !== id))
        setMessage("تم حذف الموضوع")
        setTimeout(() => setMessage(null), 3000)
      } catch {
        setMessage("حدث خطأ أثناء الحذف")
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">المواضيع</h1>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {topics.length} موضوع
        </span>
        <div className="flex-1" />
        <Button onClick={() => setShowForm(true)} className="h-10 gap-2 rounded-xl">
          <Plus className="h-4 w-4" />
          إضافة موضوع
        </Button>
      </div>

      {message && (
        <p className={`text-sm ${message.includes("خطأ") ? "text-destructive" : "text-green-500"}`}>
          {message}
        </p>
      )}

      {/* Topic list */}
      {topics.length > 0 ? (
        <div className="divide-y divide-border/20 rounded-xl border border-border/30 bg-card/50">
          {topics.map((topic) => (
            <div key={topic.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: topic.color }}
              >
                {topic.icon ? topic.icon.charAt(0) : topic.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{topic.name}</span>
                  <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {topic.slug}
                  </span>
                </div>
                {topic.description && (
                  <p className="hidden truncate text-xs text-muted-foreground md:block">
                    {topic.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(topic)}
                  disabled={isPending}
                  className="h-8 w-8 rounded-xl"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(topic.id)}
                  disabled={isPending}
                  className="h-8 w-8 rounded-xl text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/[0.03] ring-1 ring-border/50">
            <Tag className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold text-muted-foreground">لا توجد مواضيع</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground/60">
            أضف أول موضوع لتصنيف الحلقات
          </p>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={(e) => { if (e.target === e.currentTarget) resetForm() }}>
          <div className="relative mx-4 w-full max-w-md rounded-3xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl">
            {/* Modal header */}
            <div className="flex items-center gap-3 border-b border-border/20 px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <Tag className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-base font-semibold">
                {editingId ? "تعديل الموضوع" : "إضافة موضوع جديد"}
              </h2>
              <div className="flex-1" />
              <Button variant="ghost" size="icon" onClick={resetForm} className="h-8 w-8 rounded-xl">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal body */}
            <div className="space-y-4 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>الاسم</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => {
                      const name = e.target.value
                      setFormData((prev) => ({
                        ...prev,
                        name,
                        slug: editingId ? prev.slug : autoSlug(name),
                      }))
                    }}
                    placeholder="مثال: تطوير ذاتي"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>المعرّف (slug)</Label>
                  <Input
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, slug: e.target.value }))
                    }
                    placeholder="self-development"
                    dir="ltr"
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>الوصف (اختياري)</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="وصف مختصر للموضوع"
                  rows={2}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label>اللون</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, color: c }))}
                      className="h-8 w-8 rounded-lg border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: formData.color === c ? "white" : "transparent",
                        boxShadow: formData.color === c ? `0 0 0 2px ${c}` : "none",
                      }}
                    />
                  ))}
                  <Input
                    type="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, color: e.target.value }))
                    }
                    className="h-8 w-8 cursor-pointer border-0 p-0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>الأيقونة (اختياري)</Label>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          icon: prev.icon === icon ? "" : icon,
                        }))
                      }
                      className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                        formData.icon === icon
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 border-t border-border/20 px-6 py-4">
              <Button variant="outline" onClick={resetForm} disabled={isPending} className="rounded-xl">
                إلغاء
              </Button>
              <Button onClick={handleSave} disabled={isPending || !formData.name || !formData.slug} className="rounded-xl">
                {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {editingId ? "تحديث" : "إضافة"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
