"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Save, Loader2, Upload, X, CalendarDays } from "lucide-react"
import type { EnhancedAdSettings, AdSlot } from "@/types/ads"
import { updateEnhancedAdSettings } from "./actions"

interface AdsFormProps {
  initialSettings: EnhancedAdSettings
}

export function AdsForm({ initialSettings }: AdsFormProps) {
  const [settings, setSettings] = useState<EnhancedAdSettings>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await updateEnhancedAdSettings(settings)
      setMessage("تم الحفظ بنجاح")
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setMessage("حدث خطأ أثناء الحفظ")
    }
    setSaving(false)
  }

  function updateSlot(id: string, updates: Partial<AdSlot>) {
    setSettings((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }))
  }

  function isSlotActive(slot: AdSlot): boolean {
    if (!slot.enabled) return false
    const now = new Date()
    if (slot.schedule.startDate && new Date(slot.schedule.startDate) > now) return false
    if (slot.schedule.endDate && new Date(slot.schedule.endDate) < now) return false
    return true
  }

  const activeCount = settings.slots.filter(isSlotActive).length

  return (
    <div className="space-y-6">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">إدارة الإعلانات</h1>
        <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {settings.slots.length} مواقع
        </span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
          {activeCount} نشط
        </span>
        <div className="flex-1" />
        {message && (
          <span className={`text-sm ${message.includes("خطأ") ? "text-destructive" : "text-green-500"}`}>
            {message}
          </span>
        )}
        <Button onClick={handleSave} disabled={saving} className="h-10 gap-2 rounded-xl">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          حفظ التغييرات
        </Button>
      </div>

      {/* Slot Sections */}
      {settings.slots.map((slot) => (
        <div key={slot.id} className="rounded-xl border border-border/30 bg-card/50">
          {/* Section Header */}
          <div className="flex items-center gap-3 border-b border-border/20 px-4 py-3">
            <h2 className="text-sm font-semibold">{slot.label}</h2>
            <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {slot.type === "sponsored_card" ? "محتوى مدعوم" : "بانر"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                isSlotActive(slot)
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isSlotActive(slot) ? "نشط" : "غير نشط"}
            </span>
            <div className="flex-1" />
            <Label htmlFor={`${slot.id}-enabled`} className="text-sm text-muted-foreground">
              {slot.enabled ? "مفعّل" : "معطّل"}
            </Label>
            <Switch
              id={`${slot.id}-enabled`}
              checked={slot.enabled}
              onCheckedChange={(checked) => updateSlot(slot.id, { enabled: checked })}
            />
          </div>

          {/* Section Body */}
          <div className="space-y-4 p-4">
            {/* Schedule */}
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">الجدولة</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">تاريخ البداية</Label>
                <Input
                  type="datetime-local"
                  value={slot.schedule.startDate || ""}
                  onChange={(e) =>
                    updateSlot(slot.id, {
                      schedule: { ...slot.schedule, startDate: e.target.value || null },
                    })
                  }
                  dir="ltr"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">تاريخ النهاية</Label>
                <Input
                  type="datetime-local"
                  value={slot.schedule.endDate || ""}
                  onChange={(e) =>
                    updateSlot(slot.id, {
                      schedule: { ...slot.schedule, endDate: e.target.value || null },
                    })
                  }
                  dir="ltr"
                  className="rounded-xl"
                />
              </div>
            </div>

            {/* Type-specific fields */}
            {slot.type === "sponsored_card" && slot.sponsoredData && (
              <div className="space-y-4 border-t border-border/20 pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>اسم الراعي</Label>
                    <Input
                      value={slot.sponsoredData.name}
                      onChange={(e) =>
                        updateSlot(slot.id, {
                          sponsoredData: { ...slot.sponsoredData!, name: e.target.value },
                        })
                      }
                      placeholder="مثال: شركة XYZ"
                      className="rounded-xl"
                    />
                  </div>
                  <ImageUploadField
                    id={`${slot.id}-logo`}
                    label="الشعار"
                    value={slot.sponsoredData.logo}
                    onChange={(url) =>
                      updateSlot(slot.id, {
                        sponsoredData: { ...slot.sponsoredData!, logo: url },
                      })
                    }
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                <div className="space-y-2">
                  <Label>عنوان الإعلان</Label>
                  <Input
                    value={slot.sponsoredData.title}
                    onChange={(e) =>
                      updateSlot(slot.id, {
                        sponsoredData: { ...slot.sponsoredData!, title: e.target.value },
                      })
                    }
                    placeholder="عنوان جذاب للإعلان"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>وصف الإعلان</Label>
                  <Textarea
                    value={slot.sponsoredData.description}
                    onChange={(e) =>
                      updateSlot(slot.id, {
                        sponsoredData: { ...slot.sponsoredData!, description: e.target.value },
                      })
                    }
                    placeholder="وصف مختصر عن المنتج أو الخدمة"
                    rows={3}
                    className="rounded-xl"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>رابط الإعلان</Label>
                    <Input
                      value={slot.sponsoredData.url}
                      onChange={(e) =>
                        updateSlot(slot.id, {
                          sponsoredData: { ...slot.sponsoredData!, url: e.target.value },
                        })
                      }
                      placeholder="https://sponsor-website.com"
                      dir="ltr"
                      className="rounded-xl"
                    />
                  </div>
                  <ImageUploadField
                    id={`${slot.id}-image`}
                    label="صورة الإعلان"
                    value={slot.sponsoredData.image}
                    onChange={(url) =>
                      updateSlot(slot.id, {
                        sponsoredData: { ...slot.sponsoredData!, image: url },
                      })
                    }
                    placeholder="https://example.com/banner.jpg"
                  />
                </div>
              </div>
            )}

            {slot.type === "banner" && slot.bannerData && (
              <div className="space-y-4 border-t border-border/20 pt-4">
                <ImageUploadField
                  id={`${slot.id}-banner-image`}
                  label="صورة البانر"
                  value={slot.bannerData.image}
                  onChange={(url) =>
                    updateSlot(slot.id, {
                      bannerData: { ...slot.bannerData!, image: url },
                    })
                  }
                  placeholder="https://example.com/banner.jpg"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>رابط البانر</Label>
                    <Input
                      value={slot.bannerData.url}
                      onChange={(e) =>
                        updateSlot(slot.id, {
                          bannerData: { ...slot.bannerData!, url: e.target.value },
                        })
                      }
                      placeholder="https://sponsor-website.com"
                      dir="ltr"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>النص البديل</Label>
                    <Input
                      value={slot.bannerData.alt}
                      onChange={(e) =>
                        updateSlot(slot.id, {
                          bannerData: { ...slot.bannerData!, alt: e.target.value },
                        })
                      }
                      placeholder="وصف الصورة للوصولية"
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* --- Image Upload Field --- */

function ImageUploadField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (url: string) => void
  placeholder: string
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
      const res = await fetch("/api/admin/ads/upload", {
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
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => { setError(null); onChange(e.target.value) }}
          placeholder={placeholder}
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
            className="h-20 rounded-xl border border-border/30 object-contain"
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
