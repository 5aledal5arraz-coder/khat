"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  PlayCircle,
  User,
  Users,
  Sparkles,
  X,
  Check,
  Loader2,
  Camera,
  Upload,
  Link2,
  Instagram,
  Youtube,
  Globe,
  ChevronDown,
  MoreVertical,
  Mail,
  Linkedin,
  Quote,
} from "lucide-react"
import { XIcon } from "@/components/icons/x-icon"
import { TikTokIcon } from "@/components/icons/tiktok-icon"
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon"
import { SnapchatIcon } from "@/components/icons/snapchat-icon"
import { FacebookIcon } from "@/components/icons/facebook-icon"
import { ThreadsIcon } from "@/components/icons/threads-icon"
import { TelegramIcon } from "@/components/icons/telegram-icon"
import { SpotifyIcon } from "@/components/icons/spotify-icon"
import { PinterestIcon } from "@/components/icons/pinterest-icon"
import { TwitchIcon } from "@/components/icons/twitch-icon"
import { DiscordIcon } from "@/components/icons/discord-icon"
import { SoundCloudIcon } from "@/components/icons/soundcloud-icon"
import type { Guest } from "@/types/database"
import { normalizeArabic } from "@/lib/search"
import { AtharCard } from "@/components/guests/athar-card"

/* ─── Types ─── */

interface GuestWithCount extends Guest {
  episodeCount: number
}

interface GuestsListProps {
  guests: GuestWithCount[]
}

/* ─── Glow Card ─── */

function GlowCard({
  children,
  color = "primary",
  className = "",
}: {
  children: React.ReactNode
  color?: "primary" | "purple" | "muted"
  className?: string
}) {
  const glowMap = {
    primary: "from-primary/20 via-transparent to-primary/5",
    purple: "from-accent/20 via-transparent to-accent/5",
    muted: "from-muted-foreground/10 via-transparent to-muted-foreground/5",
  }

  return (
    <div
      className={`group/card relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm transition-all hover:border-border ${className}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${glowMap[color]} opacity-0 transition-opacity group-hover/card:opacity-100`}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

/* ─── Social Platform Helpers ─── */

const SOCIAL_PLATFORMS = [
  { key: "twitter", label: "X / Twitter", icon: XIcon, placeholder: "https://x.com/username" },
  { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "https://instagram.com/username" },
  { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "https://youtube.com/@channel" },
  { key: "tiktok", label: "TikTok", icon: TikTokIcon, placeholder: "https://tiktok.com/@username" },
  { key: "snapchat", label: "Snapchat", icon: SnapchatIcon, placeholder: "https://snapchat.com/add/username" },
  { key: "facebook", label: "Facebook", icon: FacebookIcon, placeholder: "https://facebook.com/username" },
  { key: "threads", label: "Threads", icon: ThreadsIcon, placeholder: "https://threads.net/@username" },
  { key: "whatsapp", label: "WhatsApp", icon: WhatsAppIcon, placeholder: "https://wa.me/966XXXXXXXXX" },
  { key: "telegram", label: "Telegram", icon: TelegramIcon, placeholder: "https://t.me/username" },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, placeholder: "https://linkedin.com/in/username" },
  { key: "spotify", label: "Spotify", icon: SpotifyIcon, placeholder: "https://open.spotify.com/artist/..." },
  { key: "soundcloud", label: "SoundCloud", icon: SoundCloudIcon, placeholder: "https://soundcloud.com/username" },
  { key: "twitch", label: "Twitch", icon: TwitchIcon, placeholder: "https://twitch.tv/username" },
  { key: "discord", label: "Discord", icon: DiscordIcon, placeholder: "https://discord.gg/invite" },
  { key: "pinterest", label: "Pinterest", icon: PinterestIcon, placeholder: "https://pinterest.com/username" },
  { key: "email", label: "البريد", icon: Mail, placeholder: "mailto:name@example.com" },
  { key: "website", label: "الموقع", icon: Globe, placeholder: "https://example.com" },
] as const

function getSocialIcon(key: string) {
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key)
  return platform?.icon || Link2
}

/* ─── Action Menu ─── */

function ActionMenu({
  children,
}: {
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="خيارات الضيف"
        className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-2xl shadow-black/20 backdrop-blur-xl"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  variant,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  variant?: "default" | "danger"
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-all ${
        variant === "danger"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-white/5"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-60" />
      {label}
    </button>
  )
}

/* ─── Photo Upload ─── */

function PhotoUploader({
  currentUrl,
  name,
  onUpload,
}: {
  currentUrl: string
  name: string
  onUpload: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError("")

    if (!file.type.startsWith("image/")) {
      setError("الملف ليس صورة")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("حجم الملف يتجاوز 5 ميجابايت")
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/admin/guests/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      if (data.success) {
        onUpload(data.url)
      } else {
        setError(data.error || "فشل رفع الصورة")
      }
    } catch {
      setError("حدث خطأ أثناء الرفع")
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const initials = name
    ? name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
    : "?"

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`group relative h-28 w-28 cursor-pointer overflow-hidden rounded-2xl ring-2 transition-all ${
          dragOver
            ? "ring-primary scale-105 bg-primary/10"
            : "ring-border/50 hover:ring-border"
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {currentUrl ? (
          <Image
            src={currentUrl}
            alt={name || "صورة الضيف"}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-accent/10 to-primary/5">
            <span className="text-3xl font-bold text-muted-foreground/60">
              {initials}
            </span>
          </div>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          ) : (
            <>
              <Camera className="h-5 w-5 text-white" />
              <span className="text-[10px] font-medium text-white/80">
                رفع صورة
              </span>
            </>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ""
        }}
      />

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        JPG, PNG, WebP — حتى 5 ميجابايت
      </p>
    </div>
  )
}

/* ─── Guest Form Dialog ─── */

function GuestFormDialog({
  isNew,
  formData,
  setFormData,
  onSave,
  onClose,
  saving,
}: {
  isNew: boolean
  formData: {
    name: string
    bio: string
    photo_url: string
    testimonial: string
    external_links: Record<string, string>
  }
  setFormData: (data: typeof formData) => void
  onSave: () => void
  onClose: () => void
  saving: boolean
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [showLinkPicker, setShowLinkPicker] = useState(false)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const addLink = (key: string) => {
    setFormData({
      ...formData,
      external_links: {
        ...formData.external_links,
        [key]: "",
      },
    })
    setShowLinkPicker(false)
  }

  const updateLink = (key: string, value: string) => {
    setFormData({
      ...formData,
      external_links: {
        ...formData.external_links,
        [key]: value,
      },
    })
  }

  const removeLink = (key: string) => {
    const { [key]: _, ...rest } = formData.external_links
    setFormData({
      ...formData,
      external_links: rest,
    })
  }

  const availablePlatforms = SOCIAL_PLATFORMS.filter(
    (p) => !(p.key in formData.external_links)
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-border/50 bg-card/95 shadow-2xl shadow-black/30 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 rounded-t-3xl border-b border-border/30 bg-card/95 px-8 pb-4 pt-8 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold">
                {isNew ? "إضافة ضيف جديد" : "تعديل الضيف"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isNew
                  ? "أدخل معلومات الضيف الجديد"
                  : "عدّل معلومات الضيف"}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-6 px-8 py-6">
          {/* Photo Upload */}
          <div className="flex justify-center">
            <PhotoUploader
              currentUrl={formData.photo_url}
              name={formData.name}
              onUpload={(url) =>
                setFormData({ ...formData, photo_url: url })
              }
            />
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              الاسم <span className="text-destructive">*</span>
            </label>
            <Input
              ref={nameRef}
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="اسم الضيف"
              dir="auto"
              className="h-11 rounded-xl"
            />
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              نبذة
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) =>
                setFormData({ ...formData, bio: e.target.value })
              }
              placeholder="نبذة مختصرة عن الضيف"
              dir="auto"
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* أثر الضيف — Athar */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Quote className="h-3.5 w-3.5 text-primary" />
              أثر الضيف
            </label>
            <textarea
              value={formData.testimonial}
              onChange={(e) => {
                if (e.target.value.length <= 450) {
                  setFormData({ ...formData, testimonial: e.target.value })
                }
              }}
              placeholder="رسالة شخصية من الضيف — شكر، تأمل، اقتباس، أو شعور بعد الحلقة..."
              dir="auto"
              rows={4}
              className="w-full resize-none rounded-xl border border-border bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground/50">
                أثر شخصي يتركه الضيف — ستظهر كبطاقة مميزة في ملفه الشخصي
              </p>
              <span className={`text-[10px] tabular-nums ${formData.testimonial.length > 400 ? "text-primary" : "text-muted-foreground/40"}`}>
                {formData.testimonial.length}/450
              </span>
            </div>

            {/* Live preview */}
            {formData.testimonial.trim() && (
              <div className="pt-1">
                <p className="mb-2 text-[10px] text-muted-foreground/40">معاينة:</p>
                <AtharCard
                  text={formData.testimonial}
                  guestName={formData.name || "اسم الضيف"}
                  compact
                />
              </div>
            )}
          </div>

          {/* External URL input (optional, for pasting a URL instead of uploading) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              أو رابط صورة خارجي
            </label>
            <Input
              value={formData.photo_url}
              onChange={(e) =>
                setFormData({ ...formData, photo_url: e.target.value })
              }
              placeholder="https://..."
              dir="ltr"
              className="h-10 rounded-xl text-xs"
            />
          </div>

          {/* Social Links */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">
                الروابط الخارجية
              </label>
              {availablePlatforms.length > 0 && (
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLinkPicker(!showLinkPicker)}
                    className="h-8 gap-1.5 rounded-xl text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    إضافة رابط
                  </Button>
                  {showLinkPicker && (
                    <div className="absolute end-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-xl backdrop-blur-xl">
                      {availablePlatforms.map((p) => {
                        const Icon = p.icon
                        return (
                          <button
                            key={p.key}
                            onClick={() => addLink(p.key)}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-all hover:bg-white/5"
                          >
                            <Icon className="h-4 w-4 opacity-60" />
                            {p.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {Object.entries(formData.external_links).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(formData.external_links).map(
                  ([key, value]) => {
                    const Icon = getSocialIcon(key)
                    const platform = SOCIAL_PLATFORMS.find(
                      (p) => p.key === key
                    )
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.03] ring-1 ring-border/50">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <Input
                          value={value}
                          onChange={(e) => updateLink(key, e.target.value)}
                          placeholder={
                            platform?.placeholder || "https://..."
                          }
                          dir="ltr"
                          className="h-9 flex-1 rounded-xl text-xs"
                        />
                        <button
                          onClick={() => removeLink(key)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  }
                )}
              </div>
            ) : (
              <p className="rounded-xl bg-white/[0.02] py-4 text-center text-xs text-muted-foreground/50 ring-1 ring-border/30">
                لا توجد روابط — اضغط &quot;إضافة رابط&quot;
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex justify-end gap-3 rounded-b-3xl border-t border-border/30 bg-card/95 px-8 py-4 backdrop-blur-xl">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl"
          >
            إلغاء
          </Button>
          <Button
            onClick={onSave}
            disabled={!formData.name.trim() || saving}
            className="gap-2 rounded-xl px-6"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ الحفظ...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {isNew ? "إضافة الضيف" : "حفظ التعديلات"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ─── Guest Card ─── */

function GuestCard({
  guest,
  onEdit,
  onDelete,
}: {
  guest: GuestWithCount
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const initials = guest.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")

  const socialLinks = guest.external_links
    ? Object.entries(guest.external_links)
    : []

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm transition-all hover:border-border/60 hover:bg-card/80">
      {/* Top accent bar */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-primary/40 via-accent/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="p-5">
        {/* Header: Avatar + Info + Actions */}
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl ring-2 ring-border/30 transition-all group-hover:ring-border/60">
            {guest.photo_url ? (
              <Image
                src={guest.photo_url}
                alt={guest.name}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-accent/10 to-primary/5">
                <span className="text-xl font-bold text-muted-foreground/60">
                  {initials}
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold transition-colors group-hover:text-foreground">
              {guest.name}
            </h3>
            {guest.bio && (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {guest.bio}
              </p>
            )}
          </div>

          {/* Actions */}
          <ActionMenu>
            {(close) => (
              <>
                <MenuItem
                  icon={Pencil}
                  label="تعديل"
                  onClick={() => {
                    onEdit()
                    close()
                  }}
                />
                <MenuItem
                  icon={ExternalLink}
                  label="عرض الملف"
                  onClick={() => {
                    window.open(`/guests/${guest.slug}`, "_blank")
                    close()
                  }}
                />
                <div className="my-1 border-t border-border/50" />
                <MenuItem
                  icon={Trash2}
                  label="حذف"
                  variant="danger"
                  onClick={() => {
                    setConfirmDelete(true)
                    close()
                  }}
                />
              </>
            )}
          </ActionMenu>
        </div>

        {/* أثر */}
        {guest.testimonial && (
          <div className="mt-3">
            <AtharCard
              text={guest.testimonial}
              guestName={guest.name}
              compact
            />
          </div>
        )}

        {/* Stats & Links Row */}
        <div className="mt-4 flex items-center justify-between">
          {/* Episode count */}
          <div className="flex items-center gap-1.5 rounded-xl bg-primary/5 px-3 py-1.5 ring-1 ring-primary/10">
            <PlayCircle className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">
              {guest.episodeCount} حلقة
            </span>
          </div>

          {/* Social icons */}
          {socialLinks.length > 0 && (
            <div className="flex gap-1">
              {socialLinks.map(([key, url]) => {
                const Icon = getSocialIcon(key)
                return (
                  <a
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/50 transition-all hover:bg-white/5 hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </a>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/95 backdrop-blur-sm">
          <div className="space-y-3 text-center">
            <p className="text-sm font-medium">
              حذف &quot;{guest.name}&quot;؟
            </p>
            <div className="flex justify-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={onDelete}
                className="h-8 rounded-xl text-xs"
              >
                تأكيد الحذف
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
                className="h-8 rounded-xl text-xs"
              >
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Main GuestsList ─── */

export function GuestsList({ guests: initialGuests }: GuestsListProps) {
  const [guests, setGuests] = useState(initialGuests)
  const [search, setSearch] = useState("")
  const [editingGuest, setEditingGuest] = useState<GuestWithCount | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    bio: "",
    photo_url: "",
    testimonial: "",
    external_links: {} as Record<string, string>,
  })

  // Arabic-aware search
  const normalizedSearch = normalizeArabic(search)
  const filteredGuests = !normalizedSearch
    ? guests
    : guests.filter(
        (g) =>
          normalizeArabic(g.name).includes(normalizedSearch) ||
          (g.bio && normalizeArabic(g.bio).includes(normalizedSearch))
      )

  // Stats
  const totalEpisodes = guests.reduce((sum, g) => sum + g.episodeCount, 0)
  const withPhoto = guests.filter((g) => g.photo_url).length

  const openAddDialog = () => {
    setFormData({ name: "", bio: "", photo_url: "", testimonial: "", external_links: {} })
    setIsAddingNew(true)
  }

  const openEditDialog = (guest: GuestWithCount) => {
    setFormData({
      name: guest.name,
      bio: guest.bio || "",
      photo_url: guest.photo_url || "",
      testimonial: guest.testimonial || "",
      external_links: guest.external_links || {},
    })
    setEditingGuest(guest)
  }

  const closeDialog = () => {
    setEditingGuest(null)
    setIsAddingNew(false)
  }

  const handleSave = async () => {
    setIsSaving(true)

    try {
      if (isAddingNew) {
        const response = await fetch("/api/admin/guests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            slug: formData.name
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^\w\u0600-\u06FF-]/g, ""),
            bio: formData.bio || null,
            photo_url: formData.photo_url || null,
            testimonial: formData.testimonial || null,
            external_links:
              Object.keys(formData.external_links).length > 0
                ? formData.external_links
                : null,
          }),
        })

        if (response.ok) {
          const newGuest = await response.json()
          setGuests([...guests, { ...newGuest, episodeCount: 0 }])
        }
      } else if (editingGuest) {
        const response = await fetch(
          `/api/admin/guests/${editingGuest.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: formData.name,
              bio: formData.bio || null,
              photo_url: formData.photo_url || null,
              testimonial: formData.testimonial || null,
              external_links:
                Object.keys(formData.external_links).length > 0
                  ? formData.external_links
                  : null,
            }),
          }
        )

        if (response.ok) {
          setGuests(
            guests.map((g) =>
              g.id === editingGuest.id
                ? {
                    ...g,
                    name: formData.name,
                    bio: formData.bio || null,
                    photo_url: formData.photo_url || null,
                    testimonial: formData.testimonial || null,
                    external_links:
                      Object.keys(formData.external_links).length > 0
                        ? formData.external_links
                        : null,
                  }
                : g
            )
          )
        }
      }

      closeDialog()
    } catch (error) {
      console.error("Error saving guest:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (guest: GuestWithCount) => {
    try {
      const response = await fetch(`/api/admin/guests/${guest.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setGuests(guests.filter((g) => g.id !== guest.id))
      }
    } catch (error) {
      console.error("Error deleting guest:", error)
    }
  }

  return (
    <div className="space-y-8">
      {/* ─── Page Header ─── */}
      <div className="relative overflow-hidden rounded-3xl border border-border/30 bg-gradient-to-bl from-accent/10 via-card/80 to-primary/5 p-8 backdrop-blur-sm">
        <div className="pointer-events-none absolute -end-20 -top-20 h-60 w-60 rounded-full bg-accent/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -start-10 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              <span className="text-xs font-semibold uppercase tracking-widest text-accent">
                لوحة التحكم
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">إدارة الضيوف</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              إضافة وتعديل معلومات ضيوف البودكاست
            </p>
          </div>
          <Button
            onClick={openAddDialog}
            className="gap-2 rounded-2xl bg-accent/90 px-5 shadow-lg shadow-accent/20 transition-all hover:bg-accent hover:shadow-accent/30"
          >
            <Plus className="h-4 w-4" />
            إضافة ضيف
          </Button>
        </div>
      </div>

      {/* ─── Stats Grid ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <GlowCard color="purple">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10">
                <Users className="h-5 w-5 text-accent" />
              </div>
              <span className="text-3xl font-bold">{guests.length}</span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              إجمالي الضيوف
            </p>
          </div>
        </GlowCard>

        <GlowCard color="primary">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <PlayCircle className="h-5 w-5 text-primary" />
              </div>
              <span className="text-3xl font-bold">{totalEpisodes}</span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              إجمالي الحلقات
            </p>
          </div>
        </GlowCard>

        <GlowCard color="muted">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                <Camera className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-3xl font-bold">{withPhoto}</span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              لديهم صورة
            </p>
          </div>
        </GlowCard>

        <GlowCard color="purple">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10">
                <Link2 className="h-5 w-5 text-accent" />
              </div>
              <span className="text-3xl font-bold">
                {guests.filter((g) => g.external_links && Object.keys(g.external_links).length > 0).length}
              </span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              لديهم روابط
            </p>
          </div>
        </GlowCard>
      </div>

      {/* ─── Search Bar ─── */}
      <div className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ابحث عن ضيف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-12 rounded-2xl border-border/50 bg-card/80 ps-11 text-sm backdrop-blur-sm transition-all focus:border-primary/50 focus:bg-card"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute end-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ─── Guests Grid ─── */}
      {filteredGuests.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGuests.map((guest) => (
            <GuestCard
              key={guest.id}
              guest={guest}
              onEdit={() => openEditDialog(guest)}
              onDelete={() => handleDelete(guest)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/[0.03] ring-1 ring-border/50">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold text-muted-foreground">
            {search ? "لم يتم العثور على ضيوف" : "لا يوجد ضيوف بعد"}
          </p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground/60">
            {search
              ? `لم يتم العثور على ضيوف يطابقون "${search}"`
              : "اضغط على \"إضافة ضيف\" لإضافة أول ضيف"}
          </p>
        </div>
      )}

      {/* ─── Add/Edit Dialog ─── */}
      {(isAddingNew || editingGuest) && (
        <GuestFormDialog
          isNew={isAddingNew}
          formData={formData}
          setFormData={setFormData}
          onSave={handleSave}
          onClose={closeDialog}
          saving={isSaving}
        />
      )}
    </div>
  )
}
