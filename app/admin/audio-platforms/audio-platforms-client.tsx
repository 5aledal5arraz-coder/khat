"use client"

import { useState, useCallback, useMemo } from "react"
import {
  Plus, Trash2, Pencil, GripVertical, Link2,
  Loader2, CheckCircle, AlertCircle, ExternalLink, Search, Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { PlatformIcon, KNOWN_ICON_NAMES } from "@/components/platforms/platform-icon"
import {
  createPlatformLinkAction,
  updatePlatformLinkAction,
  deletePlatformLinkAction,
  reorderPlatformLinksAction,
} from "./actions"
import type {
  OfficialPlatformLink,
  PlatformCategory,
  PlatformSurface,
} from "@/lib/queries/official-platforms"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: Array<{ value: PlatformCategory; label: string }> = [
  { value: "audio", label: "صوت" },
  { value: "video", label: "فيديو" },
  { value: "social", label: "اجتماعي" },
  { value: "community", label: "مجتمع" },
  { value: "website", label: "موقع" },
  { value: "newsletter", label: "نشرة" },
  { value: "other", label: "أخرى" },
]

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
)

const SURFACES: Array<{ key: PlatformSurface; field: keyof OfficialPlatformLink; label: string }> = [
  { key: "header", field: "show_in_header", label: "الهيدر" },
  { key: "footer", field: "show_in_footer", label: "الفوتر" },
  { key: "homepage", field: "show_on_homepage", label: "الرئيسية" },
  { key: "episode_page", field: "show_on_episode_page", label: "الحلقة" },
  { key: "about_page", field: "show_on_about_page", label: "من نحن" },
  { key: "contact_page", field: "show_on_contact_page", label: "تواصل" },
  { key: "guest_page", field: "show_on_guest_page", label: "الضيوف" },
]

const ICON_CHOICES = [
  { value: "", label: "— (افتراضي)" },
  ...KNOWN_ICON_NAMES.map((k) => ({ value: k, label: k })),
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  initialPlatforms: OfficialPlatformLink[]
}

type FormState = {
  platform_key: string
  platform_name: string
  url: string
  handle: string
  icon_name: string
  category: PlatformCategory
  is_primary: boolean
  is_active: boolean
  sort_order: number
  show_in_header: boolean
  show_in_footer: boolean
  show_on_homepage: boolean
  show_on_episode_page: boolean
  show_on_about_page: boolean
  show_on_contact_page: boolean
  show_on_guest_page: boolean
  notes_internal: string
}

const emptyForm = (sort_order = 0): FormState => ({
  platform_key: "",
  platform_name: "",
  url: "",
  handle: "",
  icon_name: "",
  category: "other",
  is_primary: false,
  is_active: true,
  sort_order,
  show_in_header: false,
  show_in_footer: true,
  show_on_homepage: false,
  show_on_episode_page: false,
  show_on_about_page: false,
  show_on_contact_page: false,
  show_on_guest_page: false,
  notes_internal: "",
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OfficialPlatformsClient({ initialPlatforms }: Props) {
  const [platforms, setPlatforms] = useState(initialPlatforms)

  // Filter state
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<PlatformCategory | "all">("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm(0))
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return platforms.filter((p) => {
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false
      if (statusFilter === "active" && !p.is_active) return false
      if (statusFilter === "inactive" && p.is_active) return false
      if (q) {
        const hay = `${p.platform_key} ${p.platform_name} ${p.handle ?? ""} ${p.url}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [platforms, search, categoryFilter, statusFilter])

  // Stats
  const stats = useMemo(() => {
    const byCat: Record<string, number> = {}
    let active = 0
    for (const p of platforms) {
      byCat[p.category] = (byCat[p.category] || 0) + 1
      if (p.is_active) active++
    }
    return { total: platforms.length, active, byCat }
  }, [platforms])

  // ---------------------------------------------------------------------------
  // Form handlers
  // ---------------------------------------------------------------------------
  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm(platforms.length * 10))
    setFormError("")
    setShowForm(false)
  }

  const openAddForm = () => {
    setEditingId(null)
    setForm(emptyForm((platforms.length + 1) * 10))
    setFormError("")
    setShowForm(true)
  }

  const openEditForm = (p: OfficialPlatformLink) => {
    setEditingId(p.id)
    setForm({
      platform_key: p.platform_key,
      platform_name: p.platform_name,
      url: p.url,
      handle: p.handle ?? "",
      icon_name: p.icon_name ?? "",
      category: (p.category as PlatformCategory) ?? "other",
      is_primary: !!p.is_primary,
      is_active: p.is_active ?? true,
      sort_order: p.sort_order ?? 0,
      show_in_header: !!p.show_in_header,
      show_in_footer: !!p.show_in_footer,
      show_on_homepage: !!p.show_on_homepage,
      show_on_episode_page: !!p.show_on_episode_page,
      show_on_about_page: !!p.show_on_about_page,
      show_on_contact_page: !!p.show_on_contact_page,
      show_on_guest_page: !!p.show_on_guest_page,
      notes_internal: p.notes_internal ?? "",
    })
    setFormError("")
    setShowForm(true)
  }

  const handleSave = async () => {
    setFormError("")

    if (!form.platform_key.trim()) { setFormError("المعرّف مطلوب"); return }
    if (!form.platform_name.trim()) { setFormError("اسم المنصة مطلوب"); return }
    if (!form.url.trim()) { setFormError("الرابط مطلوب"); return }
    if (!/^https?:\/\/.+/i.test(form.url.trim())) {
      setFormError("الرابط يجب أن يبدأ بـ http:// أو https://"); return
    }

    // Check duplicate key
    const duplicate = platforms.find(
      (p) => p.platform_key === form.platform_key.trim() && p.id !== editingId,
    )
    if (duplicate) { setFormError("هذا المعرّف مستخدم بالفعل"); return }

    setSaving(true)
    try {
      const data = {
        platform_key: form.platform_key.trim(),
        platform_name: form.platform_name.trim(),
        url: form.url.trim(),
        handle: form.handle.trim() || null,
        icon_name: form.icon_name || null,
        category: form.category,
        is_primary: form.is_primary,
        is_active: form.is_active,
        sort_order: form.sort_order,
        show_in_header: form.show_in_header,
        show_in_footer: form.show_in_footer,
        show_on_homepage: form.show_on_homepage,
        show_on_episode_page: form.show_on_episode_page,
        show_on_about_page: form.show_on_about_page,
        show_on_contact_page: form.show_on_contact_page,
        show_on_guest_page: form.show_on_guest_page,
        notes_internal: form.notes_internal.trim() || null,
      }

      if (editingId) {
        const updated = await updatePlatformLinkAction(editingId, data)
        if (updated) {
          setPlatforms((prev) =>
            prev.map((p) => (p.id === editingId ? updated : p))
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
          )
          showToast("success", "تم تحديث الرابط")
        }
      } else {
        const created = await createPlatformLinkAction(data)
        if (created) {
          setPlatforms((prev) =>
            [...prev, created].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
          )
          showToast("success", "تمت إضافة الرابط")
        }
      }
      resetForm()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "حدث خطأ")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deletePlatformLinkAction(id)
      setPlatforms((prev) => prev.filter((p) => p.id !== id))
      showToast("success", "تم الحذف")
    } catch {
      showToast("error", "فشل الحذف")
    }
    setConfirmDeleteId(null)
  }

  const handleToggleActive = async (p: OfficialPlatformLink) => {
    try {
      const updated = await updatePlatformLinkAction(p.id, { is_active: !p.is_active })
      if (updated) {
        setPlatforms((prev) => prev.map((x) => (x.id === p.id ? updated : x)))
      }
    } catch {
      showToast("error", "فشل التحديث")
    }
  }

  const handleToggleSurface = async (
    p: OfficialPlatformLink,
    field: keyof OfficialPlatformLink,
  ) => {
    try {
      const updated = await updatePlatformLinkAction(p.id, {
        [field]: !p[field],
      } as Partial<OfficialPlatformLink>)
      if (updated) {
        setPlatforms((prev) => prev.map((x) => (x.id === p.id ? updated : x)))
      }
    } catch {
      showToast("error", "فشل تحديث الظهور")
    }
  }

  const handleReorder = useCallback(
    async (id: string, newOrder: number) => {
      const updated = platforms
        .map((p) => (p.id === id ? { ...p, sort_order: newOrder } : p))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      setPlatforms(updated)
      await reorderPlatformLinksAction(
        updated.map((p) => ({ id: p.id, sort_order: p.sort_order ?? 0 })),
      )
    },
    [platforms],
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">روابط المنصات الرسمية</h1>
            <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {stats.active}/{stats.total} فعّال
            </span>
          </div>
          <Button size="sm" onClick={openAddForm} className="gap-1.5">
            <Plus className="h-4 w-4" />
            إضافة رابط
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          المصدر الوحيد لكل الحسابات الخارجية الرسمية لخط (وسائل تواصل، منصات صوت، فيديو، نشرات).
          جميع صفحات الموقع تقرأ من هنا — لا روابط ثابتة في الكود.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm",
            toast.type === "success"
              ? "bg-emerald-500/10 text-emerald-700"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {toast.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/30 bg-card/50 p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم، المعرّف، أو الرابط..."
            className="h-9 pr-9"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as PlatformCategory | "all")}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">كل التصنيفات</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} {stats.byCat[o.value] ? `(${stats.byCat[o.value]})` : ""}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">كل الحالات</option>
          <option value="active">الفعّالة فقط</option>
          <option value="inactive">المعطّلة فقط</option>
        </select>

        {filtered.length !== platforms.length && (
          <span className="text-xs text-muted-foreground">
            عرض {filtered.length} من {platforms.length}
          </span>
        )}
      </div>

      {/* List */}
      <div className="rounded-xl border border-border/30 bg-card/50">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Link2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {platforms.length === 0 ? "لا توجد روابط بعد" : "لا توجد نتائج مطابقة"}
            </p>
            {platforms.length === 0 && (
              <Button variant="outline" size="sm" onClick={openAddForm} className="mt-3">
                إضافة أول رابط
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="group relative px-5 py-3.5 transition-colors hover:bg-muted/20"
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />

                  <Input
                    type="number"
                    value={p.sort_order ?? 0}
                    onChange={(e) => handleReorder(p.id, parseInt(e.target.value) || 0)}
                    className="h-7 w-14 rounded-lg text-center text-xs"
                    min={0}
                    title="ترتيب العرض"
                  />

                  <PlatformIcon
                    iconName={p.icon_name}
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{p.platform_name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {p.platform_key}
                      </span>
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        {CATEGORY_LABEL[p.category] ?? p.category}
                      </span>
                      {p.is_primary && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700">
                          <Star className="h-2.5 w-2.5" />
                          أساسي
                        </span>
                      )}
                      {!p.is_active && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700">
                          معطّل
                        </span>
                      )}
                    </div>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      dir="ltr"
                    >
                      {p.url.length > 70 ? p.url.slice(0, 70) + "…" : p.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => handleToggleActive(p)}
                      className={cn(
                        "rounded-md px-2 py-1 text-[11px] font-medium",
                        p.is_active
                          ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20"
                          : "bg-muted text-muted-foreground hover:bg-muted/80",
                      )}
                      title={p.is_active ? "تعطيل" : "تفعيل"}
                    >
                      {p.is_active ? "فعّال" : "معطّل"}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditForm(p)}
                      title="تعديل"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDeleteId(p.id)}
                      title="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Surface quick toggles */}
                <div className="mt-2 flex flex-wrap gap-1.5 ps-10">
                  {SURFACES.map((s) => {
                    const on = !!p[s.field]
                    return (
                      <button
                        key={s.key}
                        onClick={() => handleToggleSurface(p, s.field)}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                          on
                            ? "bg-primary/15 text-primary hover:bg-primary/25"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted",
                        )}
                        title={`${on ? "مخفي" : "إظهار"} في ${s.label}`}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>

                {/* Delete confirmation */}
                {confirmDeleteId === p.id && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 rounded-xl bg-card/95 backdrop-blur-sm">
                    <span className="text-sm">حذف {p.platform_name}؟</span>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(p.id)}>
                      حذف
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                      إلغاء
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={resetForm}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-border/30 bg-card px-6 py-4">
              <h3 className="font-semibold text-base">
                {editingId ? "تعديل الرابط" : "إضافة رابط جديد"}
              </h3>
            </div>

            <div className="space-y-5 px-6 py-5">
              {formError && (
                <div className="rounded-md bg-destructive/10 p-2.5 text-center text-xs text-destructive">
                  {formError}
                </div>
              )}

              {/* Identity */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  الهوية
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">المعرّف (key)</label>
                    <Input
                      value={form.platform_key}
                      onChange={(e) =>
                        setForm({ ...form, platform_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })
                      }
                      placeholder="spotify"
                      dir="ltr"
                      disabled={!!editingId}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">اسم العرض</label>
                    <Input
                      value={form.platform_name}
                      onChange={(e) => setForm({ ...form, platform_name: e.target.value })}
                      placeholder="Spotify"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">الرابط (URL)</label>
                  <Input
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder="https://open.spotify.com/show/..."
                    dir="ltr"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">المعرّف العام (handle)</label>
                    <Input
                      value={form.handle}
                      onChange={(e) => setForm({ ...form, handle: e.target.value })}
                      placeholder="@KhatPodcast"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">الأيقونة</label>
                    <select
                      value={form.icon_name}
                      onChange={(e) => setForm({ ...form, icon_name: e.target.value })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {ICON_CHOICES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Classification */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  التصنيف
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">الفئة</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value as PlatformCategory })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {CATEGORY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">الترتيب</label>
                    <Input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                      min={0}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="text-sm">مفعّل</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_primary}
                      onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="text-sm">أساسي</span>
                  </label>
                </div>
              </div>

              {/* Visibility */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  الظهور في الصفحات
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {SURFACES.map((s) => (
                    <label key={s.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form[s.field as keyof FormState]}
                        onChange={(e) => setForm({ ...form, [s.field]: e.target.checked } as FormState)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">ملاحظات داخلية (اختياري)</label>
                <Input
                  value={form.notes_internal}
                  onChange={(e) => setForm({ ...form, notes_internal: e.target.value })}
                  placeholder="مثال: يدار من حساب الفريق..."
                />
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border/30 bg-card px-6 py-4">
              <Button variant="outline" size="sm" onClick={resetForm}>
                إلغاء
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
                {editingId ? "تحديث" : "إضافة"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
