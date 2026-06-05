"use client"

import { useState, useTransition, useRef } from "react"
import Image from "next/image"
import type { Episode, Guest } from "@/types/database"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { saveFeaturedEpisodesAction, setFeaturedModeAction } from "./featured-actions"
import { saveThinkersAction, setThinkersModeAction } from "./thinkers-actions"
import type { HomepageFeaturedRow } from "@/lib/queries/homepage-featured"
import type { HomepageThinkerRow } from "@/lib/queries/homepage-thinkers"
import { Star, Brain, Loader2, Check, Pencil, ToggleLeft, ToggleRight, Upload, X, ImageIcon } from "lucide-react"

// ─── Types ──────────────────────────────────────────────────

interface LatestEpisode {
  id: string
  title: string
  slug: string
  description: string | null
  youtube_url: string
  thumbnail_url: string | null
  episode_number: number | null
  guest_id: string | null
  release_date: string
}

interface LatestGuest {
  id: string
  name: string
  bio: string | null
  photo_url: string | null
}

interface Props {
  allEpisodes: Episode[]
  featuredRows: HomepageFeaturedRow[]
  latestEpisodes: LatestEpisode[]
  allGuests: Guest[]
  thinkerRows: HomepageThinkerRow[]
  latestGuests: LatestGuest[]
  featuredMode: "auto" | "manual"
  thinkersMode: "auto" | "manual"
}

// ─── Image Uploader ─────────────────────────────────────────

function ImageUploader({
  currentImage,
  fallbackImage,
  onUpload,
  onRemove,
  disabled,
}: {
  currentImage: string | null
  fallbackImage: string
  onUpload: (url: string) => void
  onRemove: () => void
  disabled?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const isCustom = !!currentImage
  const displayImage = currentImage || fallbackImage

  async function handleFile(file: File) {
    setError("")
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/admin/home/upload-image", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        onUpload(data.url)
      } else {
        setError(data.error || "فشل الرفع")
      }
    } catch {
      setError("حدث خطأ أثناء الرفع")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-border/30 bg-black/20">
        <div className="relative aspect-video">
          {displayImage ? (
            <Image
              src={displayImage}
              alt=""
              fill
              className="object-cover"
              unoptimized={displayImage.startsWith("/home/")}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}
          {/* Badge */}
          <div className="absolute start-2 top-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              isCustom
                ? "bg-primary/90 text-primary-foreground"
                : "bg-black/60 text-white/70"
            }`}>
              {isCustom ? "صورة مخصصة" : "صورة افتراضية"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ""
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="h-7 gap-1.5 text-[11px]"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {isCustom ? "استبدال" : "رفع صورة"}
        </Button>
        {isCustom && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={disabled || uploading}
            className="h-7 gap-1 text-[11px] text-destructive hover:text-destructive"
          >
            <X className="h-3 w-3" />
            إزالة
          </Button>
        )}
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}

// ─── Mode Toggle ────────────────────────────────────────────

function ModeToggle({
  mode,
  onToggle,
  disabled,
}: {
  mode: "auto" | "manual"
  onToggle: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium transition-all hover:bg-muted disabled:opacity-50"
    >
      {mode === "auto" ? (
        <>
          <ToggleRight className="h-4 w-4 text-green-400" />
          <span className="text-green-400">تلقائي</span>
        </>
      ) : (
        <>
          <ToggleLeft className="h-4 w-4 text-primary" />
          <span className="text-primary">يدوي</span>
        </>
      )}
    </button>
  )
}

// ─── Featured Episodes Tab ──────────────────────────────────

interface FeaturedSlot {
  episode_id: string
  custom_quote: string
  custom_description: string
  custom_image: string
}

function getYouTubeThumbnail(youtubeUrl: string): string {
  const videoId = youtubeUrl?.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1] || ""
  return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : ""
}

function FeaturedTab({
  allEpisodes,
  featuredRows,
  latestEpisodes,
  guests,
  initialMode,
}: {
  allEpisodes: Episode[]
  featuredRows: HomepageFeaturedRow[]
  latestEpisodes: LatestEpisode[]
  guests: Guest[]
  initialMode: "auto" | "manual"
}) {
  const [mode, setMode] = useState(initialMode)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  function buildInitialSlots(): FeaturedSlot[] {
    if (mode === "manual" && featuredRows.length > 0) {
      return featuredRows.map((r) => ({
        episode_id: r.episode_id,
        custom_quote: r.custom_quote || "",
        custom_description: r.custom_description || "",
        custom_image: r.custom_image || "",
      }))
    }
    return latestEpisodes.slice(0, 3).map((ep) => {
      const existing = featuredRows.find((r) => r.episode_id === ep.id)
      return {
        episode_id: ep.id,
        custom_quote: existing?.custom_quote || "",
        custom_description: existing?.custom_description || "",
        custom_image: existing?.custom_image || "",
      }
    })
  }

  const [slots, setSlots] = useState<FeaturedSlot[]>(buildInitialSlots)

  function getEpisodeInfo(episodeId: string) {
    return allEpisodes.find((e) => e.id === episodeId)
  }

  function getGuestName(guestId: string | null | undefined) {
    if (!guestId) return ""
    return guests.find((g) => g.id === guestId)?.name || ""
  }

  function handleToggleMode() {
    const newMode = mode === "auto" ? "manual" : "auto"
    startTransition(async () => {
      await setFeaturedModeAction(newMode)
      setMode(newMode)
      if (newMode === "auto") {
        setSlots(
          latestEpisodes.slice(0, 3).map((ep) => {
            const existing = featuredRows.find((r) => r.episode_id === ep.id)
            return {
              episode_id: ep.id,
              custom_quote: existing?.custom_quote || "",
              custom_description: existing?.custom_description || "",
              custom_image: existing?.custom_image || "",
            }
          })
        )
      }
    })
  }

  function handleEpisodeChange(idx: number, episodeId: string) {
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = { episode_id: episodeId, custom_quote: "", custom_description: "", custom_image: "" }
      return next
    })
  }

  function handleFieldChange(idx: number, field: keyof FeaturedSlot, value: string) {
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function handleSave() {
    startTransition(async () => {
      await saveFeaturedEpisodesAction(
        slots.map((s, i) => ({
          position: i + 1,
          episode_id: s.episode_id,
          custom_quote: s.custom_quote,
          custom_description: s.custom_description,
          custom_image: s.custom_image,
        }))
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  while (slots.length < 3) {
    slots.push({ episode_id: "", custom_quote: "", custom_description: "", custom_image: "" })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">قاعة الحلقات</h2>
          <ModeToggle mode={mode} onToggle={handleToggleMode} disabled={pending} />
        </div>
        <Button onClick={handleSave} disabled={pending} size="sm" className="gap-2">
          {saved ? <Check className="h-4 w-4" /> : pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saved ? "تم الحفظ" : "حفظ"}
        </Button>
      </div>

      {mode === "auto" && (
        <p className="text-xs text-muted-foreground">
          يتم عرض آخر 3 حلقات تلقائياً. التبديل إلى الوضع اليدوي يتيح اختيار حلقات محددة.
        </p>
      )}

      <div className="space-y-4">
        {slots.map((slot, idx) => {
          const ep = getEpisodeInfo(slot.episode_id)
          const guestName = ep ? getGuestName(ep.guest_id) : ""
          const displayQuote = slot.custom_quote || ""
          const displayDesc = slot.custom_description || ep?.description || ""
          const fallbackImage = ep ? getYouTubeThumbnail(ep.youtube_url) : ""
          const isEditing = editingIdx === idx

          return (
            <Card key={idx}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wider text-primary">الموضع {idx + 1}</span>
                  <Button variant="ghost" size="sm" onClick={() => setEditingIdx(isEditing ? null : idx)} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />
                    {isEditing ? "إغلاق" : "تعديل"}
                  </Button>
                </div>

                {mode === "manual" ? (
                  <select
                    value={slot.episode_id}
                    onChange={(e) => handleEpisodeChange(idx, e.target.value)}
                    className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm"
                  >
                    <option value="">اختر حلقة...</option>
                    {allEpisodes.map((e) => (
                      <option key={e.id} value={e.id}>{e.title}</option>
                    ))}
                  </select>
                ) : ep ? (
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-sm font-medium">{ep.title}</p>
                    {guestName && <p className="text-xs text-muted-foreground">{guestName}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">لا توجد حلقة</p>
                )}

                {/* Image upload */}
                {slot.episode_id && (
                  <ImageUploader
                    currentImage={slot.custom_image || null}
                    fallbackImage={fallbackImage}
                    onUpload={(url) => handleFieldChange(idx, "custom_image", url)}
                    onRemove={() => handleFieldChange(idx, "custom_image", "")}
                    disabled={pending}
                  />
                )}

                {/* Content preview */}
                {slot.episode_id && !isEditing && (
                  <div className="space-y-2 rounded-lg border border-border/20 bg-muted/10 p-3">
                    {displayQuote && <p className="text-sm italic text-muted-foreground">&ldquo;{displayQuote}&rdquo;</p>}
                    {displayDesc && <p className="text-xs text-muted-foreground">{displayDesc}</p>}
                    {!displayQuote && !displayDesc && (
                      <p className="text-xs text-muted-foreground/50">لا يوجد محتوى بعد — اضغط &ldquo;تعديل&rdquo; لإضافة محتوى مخصص</p>
                    )}
                  </div>
                )}

                {isEditing && slot.episode_id && (
                  <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">اقتباس مخصص</label>
                      <textarea
                        value={slot.custom_quote}
                        onChange={(e) => handleFieldChange(idx, "custom_quote", e.target.value)}
                        placeholder="اكتب اقتباساً مخصصاً..."
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm min-h-[60px] resize-none"
                        dir="auto"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">وصف مخصص</label>
                      <textarea
                        value={slot.custom_description}
                        onChange={(e) => handleFieldChange(idx, "custom_description", e.target.value)}
                        placeholder="اكتب وصفاً مخصصاً أو اترك فارغاً لاستخدام الوصف الأصلي..."
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm min-h-[60px] resize-none"
                        dir="auto"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ─── Thinkers Tab ───────────────────────────────────────────

interface ThinkerSlot {
  guest_id: string
  custom_title: string
  custom_description: string
  custom_image: string
}

function ThinkersTab({
  allGuests,
  thinkerRows,
  latestGuests,
  initialMode,
}: {
  allGuests: Guest[]
  thinkerRows: HomepageThinkerRow[]
  latestGuests: LatestGuest[]
  initialMode: "auto" | "manual"
}) {
  const [mode, setMode] = useState(initialMode)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  function buildInitialSlots(): ThinkerSlot[] {
    if (mode === "manual" && thinkerRows.length > 0) {
      return thinkerRows.map((r) => ({
        guest_id: r.guest_id,
        custom_title: r.custom_title || "",
        custom_description: r.custom_description || "",
        custom_image: r.custom_image || "",
      }))
    }
    return latestGuests.slice(0, 3).map((g) => {
      const existing = thinkerRows.find((r) => r.guest_id === g.id)
      return {
        guest_id: g.id,
        custom_title: existing?.custom_title || "",
        custom_description: existing?.custom_description || "",
        custom_image: existing?.custom_image || "",
      }
    })
  }

  const [slots, setSlots] = useState<ThinkerSlot[]>(buildInitialSlots)

  function getGuestInfo(guestId: string) {
    return allGuests.find((g) => g.id === guestId)
  }

  function handleToggleMode() {
    const newMode = mode === "auto" ? "manual" : "auto"
    startTransition(async () => {
      await setThinkersModeAction(newMode)
      setMode(newMode)
      if (newMode === "auto") {
        setSlots(
          latestGuests.slice(0, 3).map((g) => {
            const existing = thinkerRows.find((r) => r.guest_id === g.id)
            return {
              guest_id: g.id,
              custom_title: existing?.custom_title || "",
              custom_description: existing?.custom_description || "",
              custom_image: existing?.custom_image || "",
            }
          })
        )
      }
    })
  }

  function handleGuestChange(idx: number, guestId: string) {
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = { guest_id: guestId, custom_title: "", custom_description: "", custom_image: "" }
      return next
    })
  }

  function handleFieldChange(idx: number, field: keyof ThinkerSlot, value: string) {
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function handleSave() {
    startTransition(async () => {
      await saveThinkersAction(
        slots
          .filter((s) => s.guest_id)
          .map((s, i) => ({
            position: i + 1,
            guest_id: s.guest_id,
            custom_title: s.custom_title,
            custom_description: s.custom_description,
            custom_image: s.custom_image,
          }))
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  while (slots.length < 3) {
    slots.push({ guest_id: "", custom_title: "", custom_description: "", custom_image: "" })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">معرض العقول</h2>
          <ModeToggle mode={mode} onToggle={handleToggleMode} disabled={pending} />
        </div>
        <Button onClick={handleSave} disabled={pending} size="sm" className="gap-2">
          {saved ? <Check className="h-4 w-4" /> : pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saved ? "تم الحفظ" : "حفظ"}
        </Button>
      </div>

      {mode === "auto" && (
        <p className="text-xs text-muted-foreground">
          يتم عرض آخر 3 ضيوف ظهروا في الحلقات تلقائياً. التبديل إلى الوضع اليدوي يتيح اختيار ضيوف محددين.
        </p>
      )}

      <div className="space-y-4">
        {slots.map((slot, idx) => {
          const guest = getGuestInfo(slot.guest_id)
          const displayTitle = slot.custom_title || ""
          const displayDesc = slot.custom_description || guest?.bio || ""
          const fallbackImage = guest?.photo_url || ""
          const isEditing = editingIdx === idx

          return (
            <Card key={idx}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wider text-primary">الموضع {idx + 1}</span>
                  <Button variant="ghost" size="sm" onClick={() => setEditingIdx(isEditing ? null : idx)} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />
                    {isEditing ? "إغلاق" : "تعديل"}
                  </Button>
                </div>

                {mode === "manual" ? (
                  <select
                    value={slot.guest_id}
                    onChange={(e) => handleGuestChange(idx, e.target.value)}
                    className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm"
                  >
                    <option value="">اختر ضيف...</option>
                    {allGuests.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                ) : guest ? (
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-sm font-medium">{guest.name}</p>
                    {guest.bio && <p className="text-xs text-muted-foreground line-clamp-1">{guest.bio}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">لا يوجد ضيف</p>
                )}

                {/* Image upload */}
                {slot.guest_id && (
                  <ImageUploader
                    currentImage={slot.custom_image || null}
                    fallbackImage={fallbackImage}
                    onUpload={(url) => handleFieldChange(idx, "custom_image", url)}
                    onRemove={() => handleFieldChange(idx, "custom_image", "")}
                    disabled={pending}
                  />
                )}

                {/* Content preview */}
                {slot.guest_id && !isEditing && (
                  <div className="space-y-2 rounded-lg border border-border/20 bg-muted/10 p-3">
                    {displayTitle && <p className="text-xs font-bold tracking-wider text-primary">{displayTitle}</p>}
                    {displayDesc && <p className="text-xs text-muted-foreground">{displayDesc}</p>}
                    {!displayTitle && !displayDesc && (
                      <p className="text-xs text-muted-foreground/50">لا يوجد محتوى بعد — اضغط &ldquo;تعديل&rdquo; لإضافة محتوى مخصص</p>
                    )}
                  </div>
                )}

                {isEditing && slot.guest_id && (
                  <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">لقب مخصص</label>
                      <input
                        type="text"
                        value={slot.custom_title}
                        onChange={(e) => handleFieldChange(idx, "custom_title", e.target.value)}
                        placeholder="مثال: باحث في التاريخ الإسلامي"
                        className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                        dir="auto"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">وصف مخصص</label>
                      <textarea
                        value={slot.custom_description}
                        onChange={(e) => handleFieldChange(idx, "custom_description", e.target.value)}
                        placeholder="اكتب وصفاً مخصصاً أو اترك فارغاً..."
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm min-h-[60px] resize-none"
                        dir="auto"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

export function HomeContentTabs({
  allEpisodes,
  featuredRows,
  latestEpisodes,
  allGuests,
  thinkerRows,
  latestGuests,
  featuredMode,
  thinkersMode,
}: Props) {
  return (
    <Tabs defaultValue="gallery">
      <TabsList className="mb-6 w-full justify-start">
        <TabsTrigger value="gallery" className="gap-2">
          <Star className="h-4 w-4" />
          قاعة الحلقات
        </TabsTrigger>
        <TabsTrigger value="thinkers" className="gap-2">
          <Brain className="h-4 w-4" />
          معرض العقول
        </TabsTrigger>
      </TabsList>

      <TabsContent value="gallery">
        <FeaturedTab
          allEpisodes={allEpisodes}
          featuredRows={featuredRows}
          latestEpisodes={latestEpisodes}
          guests={allGuests}
          initialMode={featuredMode}
        />
      </TabsContent>

      <TabsContent value="thinkers">
        <ThinkersTab
          allGuests={allGuests}
          thinkerRows={thinkerRows}
          latestGuests={latestGuests}
          initialMode={thinkersMode}
        />
      </TabsContent>
    </Tabs>
  )
}
