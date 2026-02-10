"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Save, Loader2, Upload, X } from "lucide-react"
import type { AdSettings } from "@/types/ads"
import { updateAdSettings } from "./actions"

interface AdsFormProps {
  initialSettings: AdSettings
}

export function AdsForm({ initialSettings }: AdsFormProps) {
  const [settings, setSettings] = useState<AdSettings>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await updateAdSettings(settings)
      setMessage("تم الحفظ بنجاح")
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setMessage("حدث خطأ أثناء الحفظ")
    }
    setSaving(false)
  }

  return (
    <div className="space-y-8">
      {/* Sponsored Card Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>المحتوى المدعوم</CardTitle>
              <CardDescription>
                بطاقة الراعي الرسمي في صفحة الحلقات
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="sponsored-enabled" className="text-sm text-muted-foreground">
                {settings.sponsoredCard.enabled ? "مفعّل" : "معطّل"}
              </Label>
              <Switch
                id="sponsored-enabled"
                checked={settings.sponsoredCard.enabled}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    sponsoredCard: { ...settings.sponsoredCard, enabled: checked },
                  })
                }
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sponsor-name">اسم الراعي</Label>
              <Input
                id="sponsor-name"
                value={settings.sponsoredCard.data.name}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sponsoredCard: {
                      ...settings.sponsoredCard,
                      data: { ...settings.sponsoredCard.data, name: e.target.value },
                    },
                  })
                }
                placeholder="مثال: شركة XYZ"
              />
            </div>
            <ImageUploadField
              id="sponsor-logo"
              label="الشعار"
              value={settings.sponsoredCard.data.logo}
              onChange={(url) =>
                setSettings({
                  ...settings,
                  sponsoredCard: {
                    ...settings.sponsoredCard,
                    data: { ...settings.sponsoredCard.data, logo: url },
                  },
                })
              }
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sponsor-title">عنوان الإعلان</Label>
            <Input
              id="sponsor-title"
              value={settings.sponsoredCard.data.title}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  sponsoredCard: {
                    ...settings.sponsoredCard,
                    data: { ...settings.sponsoredCard.data, title: e.target.value },
                  },
                })
              }
              placeholder="عنوان جذاب للإعلان"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sponsor-description">وصف الإعلان</Label>
            <Textarea
              id="sponsor-description"
              value={settings.sponsoredCard.data.description}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  sponsoredCard: {
                    ...settings.sponsoredCard,
                    data: { ...settings.sponsoredCard.data, description: e.target.value },
                  },
                })
              }
              placeholder="وصف مختصر عن المنتج أو الخدمة"
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sponsor-url">رابط الإعلان</Label>
              <Input
                id="sponsor-url"
                value={settings.sponsoredCard.data.url}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sponsoredCard: {
                      ...settings.sponsoredCard,
                      data: { ...settings.sponsoredCard.data, url: e.target.value },
                    },
                  })
                }
                placeholder="https://sponsor-website.com"
                dir="ltr"
              />
            </div>
            <ImageUploadField
              id="sponsor-image"
              label="صورة الإعلان"
              value={settings.sponsoredCard.data.image}
              onChange={(url) =>
                setSettings({
                  ...settings,
                  sponsoredCard: {
                    ...settings.sponsoredCard,
                    data: { ...settings.sponsoredCard.data, image: url },
                  },
                })
              }
              placeholder="https://example.com/banner.jpg"
            />
          </div>
        </CardContent>
      </Card>

      {/* Banner Ad Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>البانر الإعلاني</CardTitle>
              <CardDescription>
                الإعلان الأفقي في صفحة الحلقات
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="banner-enabled" className="text-sm text-muted-foreground">
                {settings.bannerAd.enabled ? "مفعّل" : "معطّل"}
              </Label>
              <Switch
                id="banner-enabled"
                checked={settings.bannerAd.enabled}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    bannerAd: { ...settings.bannerAd, enabled: checked },
                  })
                }
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ImageUploadField
            id="banner-image"
            label="صورة البانر"
            value={settings.bannerAd.data.image}
            onChange={(url) =>
              setSettings({
                ...settings,
                bannerAd: {
                  ...settings.bannerAd,
                  data: { ...settings.bannerAd.data, image: url },
                },
              })
            }
            placeholder="https://example.com/banner.jpg"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="banner-url">رابط البانر</Label>
              <Input
                id="banner-url"
                value={settings.bannerAd.data.url}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    bannerAd: {
                      ...settings.bannerAd,
                      data: { ...settings.bannerAd.data, url: e.target.value },
                    },
                  })
                }
                placeholder="https://sponsor-website.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banner-alt">النص البديل</Label>
              <Input
                id="banner-alt"
                value={settings.bannerAd.data.alt}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    bannerAd: {
                      ...settings.bannerAd,
                      data: { ...settings.bannerAd.data, alt: e.target.value },
                    },
                  })
                }
                placeholder="وصف الصورة للوصولية"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="me-2 h-4 w-4" />
          )}
          حفظ التغييرات
        </Button>
        {message && (
          <span className={`text-sm ${message.includes("خطأ") ? "text-destructive" : "text-green-500"}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  )
}

/* ─── Image Upload Field ─── */

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
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          title="رفع صورة"
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
            className="h-20 rounded-lg border border-border object-contain"
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
