"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Plus,
  Loader2,
  Upload,
  X,
  Pencil,
  Trash2,
  GripVertical,
  ExternalLink,
} from "lucide-react"
import type { TrustedPartner } from "@/lib/queries/partnerships"
import {
  createPartnerAction,
  updatePartnerAction,
  deletePartnerAction,
  reorderPartnersAction,
} from "./actions"

interface PartnershipsFormProps {
  initialPartners: TrustedPartner[]
}

interface PartnerFormData {
  name: string
  description: string
  logo_url: string
  website_url: string
  show_on_homepage: boolean
  is_active: boolean
  display_order: number
}

const emptyForm: PartnerFormData = {
  name: "",
  description: "",
  logo_url: "",
  website_url: "",
  show_on_homepage: true,
  is_active: true,
  display_order: 0,
}

export function PartnershipsForm({ initialPartners }: PartnershipsFormProps) {
  const [partners, setPartners] = useState(initialPartners)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PartnerFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const showMessage = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), 3000)
  }

  const handleNew = () => {
    setEditingId(null)
    setForm({ ...emptyForm, display_order: partners.length })
    setShowForm(true)
  }

  const handleEdit = (partner: TrustedPartner) => {
    setEditingId(partner.id)
    setForm({
      name: partner.name,
      description: partner.description || "",
      logo_url: partner.logo_url || "",
      website_url: partner.website_url || "",
      show_on_homepage: partner.show_on_homepage ?? true,
      is_active: partner.is_active ?? true,
      display_order: partner.display_order ?? 0,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        const updated = await updatePartnerAction(editingId, form)
        if (updated) {
          setPartners((prev) => prev.map((p) => (p.id === editingId ? updated : p)))
          showMessage("تم التحديث بنجاح")
        }
      } else {
        const created = await createPartnerAction(form)
        if (created) {
          setPartners((prev) => [...prev, created])
          showMessage("تمت الإضافة بنجاح")
        }
      }
      handleCancel()
    } catch {
      showMessage("حدث خطأ أثناء الحفظ")
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الشريك؟")) return
    setSaving(true)
    try {
      const success = await deletePartnerAction(id)
      if (success) {
        setPartners((prev) => prev.filter((p) => p.id !== id))
        showMessage("تم الحذف بنجاح")
        if (editingId === id) handleCancel()
      }
    } catch {
      showMessage("حدث خطأ أثناء الحذف")
    }
    setSaving(false)
  }

  const handleReorder = async (id: string, newOrder: number) => {
    const updated = partners.map((p) =>
      p.id === id ? { ...p, display_order: newOrder } : p
    ).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    setPartners(updated)
    await reorderPartnersAction(
      updated.map((p) => ({ id: p.id, display_order: p.display_order ?? 0 }))
    )
  }

  const activeCount = partners.filter((p) => p.is_active).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">الشركاء</h1>
        <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {partners.length} شريك
        </span>
        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
          {activeCount} نشط
        </span>
        <div className="flex-1" />
        {message && (
          <span className={`text-sm ${message.includes("خطأ") ? "text-destructive" : "text-green-700"}`}>
            {message}
          </span>
        )}
        <Button onClick={handleNew} className="h-9 gap-2 rounded-lg text-[11px]" disabled={showForm}>
          <Plus className="h-4 w-4" />
          إضافة شريك
        </Button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="rounded-xl border border-border/30 bg-card/50 p-5 space-y-4">
          <h2 className="text-[13px] font-semibold">
            {editingId ? "تعديل الشريك" : "إضافة شريك جديد"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>الاسم *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="اسم الجهة أو المؤسسة"
                className="rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <Label>الموقع الإلكتروني</Label>
              <Input
                value={form.website_url}
                onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                placeholder="https://example.com"
                dir="ltr"
                className="rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              الوصف
              <span className="text-muted-foreground text-xs me-2">
                ({form.description.length}/200)
              </span>
            </Label>
            <Textarea
              value={form.description}
              onChange={(e) => {
                if (e.target.value.length <= 200) {
                  setForm({ ...form, description: e.target.value })
                }
              }}
              placeholder="وصف مختصر عن الشراكة"
              rows={2}
              className="rounded-xl"
            />
          </div>

          <ImageUploadField
            value={form.logo_url}
            onChange={(url) => setForm({ ...form, logo_url: url })}
          />

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
              <Label className="text-sm">نشط</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.show_on_homepage}
                onCheckedChange={(checked) => setForm({ ...form, show_on_homepage: checked })}
              />
              <Label className="text-sm">عرض في الرئيسية</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">الترتيب</Label>
              <Input
                type="number"
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
                className="w-20 rounded-xl"
                min={0}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="gap-2 rounded-xl">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "تحديث" : "إضافة"}
            </Button>
            <Button variant="outline" onClick={handleCancel} className="rounded-xl">
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {/* Partner List */}
      {partners.length === 0 && !showForm && (
        <div className="admin-card flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[13px] font-semibold text-muted-foreground">لا توجد جهات شريكة بعد</p>
          <p className="mt-1.5 text-[12px] text-muted-foreground">أضف أول شريك لعرضه في الموقع</p>
        </div>
      )}

      <div className="space-y-2">
        {partners.map((partner) => (
          <div
            key={partner.id}
            className="flex items-center gap-3 rounded-xl border border-border/30 bg-card/50 px-4 py-3"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />

            {/* Logo */}
            {partner.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={partner.logo_url}
                alt={partner.name}
                className="h-10 w-10 rounded-lg border border-border/30 object-contain bg-card p-1"
              />
            ) : (
              <div className="h-10 w-10 rounded-lg border border-border/30 bg-muted flex items-center justify-center text-xs text-muted-foreground">
                Logo
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[13px] truncate">{partner.name}</span>
                {partner.website_url && (
                  <a
                    href={partner.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {partner.description && (
                <p className="text-[11px] text-muted-foreground truncate">{partner.description}</p>
              )}
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  partner.is_active
                    ? "bg-emerald-500/10 text-emerald-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {partner.is_active ? "نشط" : "غير نشط"}
              </span>
              {partner.show_on_homepage && (
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  الرئيسية
                </span>
              )}
              <Input
                type="number"
                value={partner.display_order ?? 0}
                onChange={(e) => handleReorder(partner.id, parseInt(e.target.value) || 0)}
                className="w-14 h-7 text-xs rounded-lg text-center"
                min={0}
                title="ترتيب العرض"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleEdit(partner)}
                className="h-8 w-8 rounded-lg"
                title="تعديل"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(partner.id)}
                className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                title="حذف"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* --- Image Upload Field --- */

function ImageUploadField({
  value,
  onChange,
}: {
  value: string
  onChange: (url: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/admin/partnerships/upload", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "حدث خطأ أثناء الرفع")
        return
      }
      onChange(data.url)
    } catch {
      setError("حدث خطأ في الاتصال")
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ""
  }

  return (
    <div className="space-y-2">
      <Label>الشعار</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => { setError(null); onChange(e.target.value) }}
          placeholder="/partners/logo.png"
          dir="ltr"
          className="flex-1 rounded-xl"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          title="رفع صورة"
          className="rounded-xl"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {value && (
        <div className="relative mt-2 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="معاينة"
            className="h-16 rounded-xl border border-border/30 object-contain bg-card p-1"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -end-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
            title="إزالة الصورة"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}
