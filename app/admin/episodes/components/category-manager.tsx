"use client"

import { useState, useRef, useEffect } from "react"
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Tag,
  Loader2,
  FolderOpen,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  createEpisodeCategory,
  updateEpisodeCategory,
  deleteEpisodeCategory,
} from "../actions"
import type { CategoryWithCount } from "./shared"

interface CategoryManagerProps {
  categories: CategoryWithCount[]
  activeCategory: string | null
  onCategoryChange: (id: string | null) => void
  totalEpisodes: number
  uncategorizedCount: number
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\u0621-\u064Aa-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function CategoryManager({
  categories,
  activeCategory,
  onCategoryChange,
  totalEpisodes,
  uncategorizedCount,
}: CategoryManagerProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if ((showForm || editingId) && inputRef.current) inputRef.current.focus()
  }, [showForm, editingId])

  const handleNameChange = (val: string) => {
    setName(val)
    // Auto-generate slug only when creating new
    if (!editingId) {
      setSlug(slugify(val))
    }
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const result = await createEpisodeCategory(name, slug || slugify(name))
    if (!result.success) {
      setError(result.error || "حدث خطأ")
    } else {
      setName("")
      setSlug("")
      setShowForm(false)
    }
    setSaving(false)
  }

  const handleStartEdit = (cat: CategoryWithCount) => {
    setEditingId(cat.id)
    setName(cat.name)
    setSlug(cat.slug)
    setShowForm(false)
    setError(null)
  }

  const handleUpdate = async () => {
    if (!editingId || !name.trim()) return
    setSaving(true)
    setError(null)
    const result = await updateEpisodeCategory(editingId, name, slug)
    if (!result.success) {
      setError(result.error || "حدث خطأ")
    } else {
      setEditingId(null)
      setName("")
      setSlug("")
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    // Two-step inline confirmation: first click arms, second click commits
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      return
    }
    setDeleting(id)
    await deleteEpisodeCategory(id)
    if (activeCategory === id) onCategoryChange(null)
    setDeleting(null)
    setConfirmDeleteId(null)
  }

  // Auto-cancel the armed delete state after 4 seconds of no action
  useEffect(() => {
    if (!confirmDeleteId) return
    const t = setTimeout(() => setConfirmDeleteId(null), 4000)
    return () => clearTimeout(t)
  }, [confirmDeleteId])

  const handleCancel = () => {
    setEditingId(null)
    setShowForm(false)
    setName("")
    setSlug("")
    setError(null)
  }

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {/* All tab */}
        <button
          onClick={() => onCategoryChange(null)}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${
            activeCategory === null
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
          }`}
        >
          الكل
          <span className="ms-1.5 text-[10px] opacity-60">{totalEpisodes}</span>
        </button>

        {/* Category tabs */}
        {categories.map((cat) => (
          <div key={cat.id} className="group/tab relative flex shrink-0 items-center">
            {editingId === cat.id ? (
              <div className="flex items-center gap-1.5">
                <Input
                  ref={inputRef}
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpdate()
                    if (e.key === "Escape") handleCancel()
                  }}
                  className="h-7 w-32 rounded-lg text-xs"
                  placeholder="اسم التصنيف"
                />
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpdate()
                    if (e.key === "Escape") handleCancel()
                  }}
                  className="h-7 w-24 rounded-lg text-xs"
                  placeholder="slug"
                  dir="ltr"
                />
                <button
                  onClick={handleUpdate}
                  disabled={saving}
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </button>
                <button
                  onClick={handleCancel}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/30"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onCategoryChange(activeCategory === cat.id ? null : cat.id)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${
                    activeCategory === cat.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <Tag className="mb-px me-1 inline h-3 w-3 opacity-50" />
                  {cat.name}
                  <span className="ms-1.5 text-[10px] opacity-60">{cat.episodeCount}</span>
                </button>
                {/* Edit/delete on hover */}
                <div className="absolute -end-1 -top-1 hidden items-center gap-0.5 group-hover/tab:flex">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStartEdit(cat)
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded-md bg-card border border-border/30 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(cat.id)
                    }}
                    disabled={deleting === cat.id}
                    title={
                      confirmDeleteId === cat.id
                        ? "اضغط مرة أخرى للتأكيد — الحلقات المرتبطة ستصبح بدون تصنيف"
                        : "حذف التصنيف"
                    }
                    className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                      confirmDeleteId === cat.id
                        ? "border-destructive/60 bg-destructive/15 text-destructive"
                        : "border-border/30 bg-card text-muted-foreground hover:text-destructive"
                    }`}
                  >
                    {deleting === cat.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {/* Uncategorized tab */}
        {uncategorizedCount > 0 && uncategorizedCount < totalEpisodes && (
          <button
            onClick={() => onCategoryChange("__uncategorized")}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${
              activeCategory === "__uncategorized"
                ? "bg-muted/60 text-foreground"
                : "text-muted-foreground/50 hover:bg-muted/30 hover:text-muted-foreground"
            }`}
          >
            <FolderOpen className="mb-px me-1 inline h-3 w-3 opacity-50" />
            بدون تصنيف
            <span className="ms-1.5 text-[10px] opacity-60">{uncategorizedCount}</span>
          </button>
        )}

        {/* Add new */}
        {showForm ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
                if (e.key === "Escape") handleCancel()
              }}
              className="h-7 w-32 rounded-lg text-xs"
              placeholder="اسم التصنيف"
            />
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
                if (e.key === "Escape") handleCancel()
              }}
              className="h-7 w-24 rounded-lg text-xs"
              placeholder="slug"
              dir="ltr"
            />
            <button
              onClick={handleCreate}
              disabled={saving || !name.trim()}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </button>
            <button
              onClick={handleCancel}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/30"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setShowForm(true)
              setEditingId(null)
              setName("")
              setSlug("")
              setError(null)
            }}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-border/40 px-2.5 py-1.5 text-[11px] text-muted-foreground/60 transition-all hover:border-border/60 hover:text-muted-foreground"
          >
            <Plus className="h-3 w-3" />
            تصنيف جديد
          </button>
        )}
      </div>

      {error && (
        <p className="text-[11px] text-destructive">{error}</p>
      )}
    </div>
  )
}
