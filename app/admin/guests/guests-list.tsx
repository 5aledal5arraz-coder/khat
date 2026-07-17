"use client"

import { useState, useRef, useEffect, useLayoutEffect } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  User,
  X,
  Check,
  Loader2,
  Camera,
  Link2,
  Instagram,
  Youtube,
  Globe,
  MoreVertical,
  Mail,
  Linkedin,
  Quote,
  LinkIcon,
  AlertTriangle,
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
import { ImageCropModal } from "@/components/ui/image-crop-modal"
import type { Guest } from "@/types/database"
import { normalizeArabic } from "@/lib/search"
import { formatArabicCount, cn } from "@/lib/utils"
import { AtharCard } from "@/components/guests/athar-card"

/* ─── Types ─── */

interface GuestWithCount extends Guest {
  episodeCount: number
}

interface EpisodeSummary {
  id: string
  title: string
  guest_id: string | null
  release_date: string
}

interface GuestsListProps {
  guests: GuestWithCount[]
  episodes: EpisodeSummary[]
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
  return SOCIAL_PLATFORMS.find((p) => p.key === key)?.icon || Link2
}

/* ─── Action Menu (portal-based with auto-flip) ─── */

const MENU_WIDTH = 192 // w-48 = 12rem = 192px
const MENU_MARGIN = 8 // gap between trigger and menu, and viewport edge

function ActionMenu({ children }: { children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; placement: "bottom" | "top" }>({ top: 0, left: 0, placement: "bottom" })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const menuHeight = menuRef.current?.offsetHeight ?? 160 // estimated before measure
    const spaceBelow = window.innerHeight - rect.bottom - MENU_MARGIN
    const spaceAbove = rect.top - MENU_MARGIN
    const placement: "bottom" | "top" =
      spaceBelow >= menuHeight || spaceBelow >= spaceAbove ? "bottom" : "top"

    // Align menu's end-edge (right in RTL) with trigger's end-edge.
    // In RTL, trigger's "end" = its left side. In LTR, trigger's "end" = its right side.
    const isRTL = document.documentElement.dir === "rtl" || getComputedStyle(document.body).direction === "rtl"
    let left: number
    if (isRTL) {
      left = rect.left
    } else {
      left = rect.right - MENU_WIDTH
    }
    // Clamp to viewport
    left = Math.max(MENU_MARGIN, Math.min(left, window.innerWidth - MENU_WIDTH - MENU_MARGIN))

    const top = placement === "bottom" ? rect.bottom + MENU_MARGIN : rect.top - menuHeight - MENU_MARGIN
    setCoords({ top, left, placement })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    // Re-measure once the menu is in the DOM so we know its true height
    const id = requestAnimationFrame(updatePosition)
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const handleReposition = () => updatePosition()
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    window.addEventListener("scroll", handleReposition, true)
    window.addEventListener("resize", handleReposition)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
      window.removeEventListener("scroll", handleReposition, true)
      window.removeEventListener("resize", handleReposition)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="خيارات الضيف"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {mounted && open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: coords.top, left: coords.left, width: MENU_WIDTH }}
          className="z-[100] overflow-hidden rounded-xl border border-border/30 bg-card/95 py-1 shadow-xl shadow-black/20 backdrop-blur-xl"
        >
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </>
  )
}

function MenuItem({ icon: Icon, label, onClick, variant }: { icon: React.ElementType; label: string; onClick: () => void; variant?: "default" | "danger" }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2 text-[13px] transition-all duration-200 ${variant === "danger" ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-muted/40"}`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-60" />
      {label}
    </button>
  )
}

/* ─── Photo Picker (no upload — just selects + crops, stores File in parent) ─── */

function PhotoPicker({ previewUrl, name, onFileReady }: {
  previewUrl: string | null
  name: string
  onFileReady: (file: File) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState("")
  const [cropFile, setCropFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileSelected = (file: File) => {
    setError("")
    if (!file.type.startsWith("image/")) { setError("الملف ليس صورة"); return }
    if (file.size > 5 * 1024 * 1024) { setError("حجم الملف يتجاوز 5 ميجابايت"); return }
    setCropFile(file)
  }

  const handleCropConfirm = (croppedFile: File) => {
    setCropFile(null)
    onFileReady(croppedFile)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelected(file)
  }

  const initials = name ? name.split(" ").map((w) => w[0]).slice(0, 2).join("") : "?"

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`group relative h-28 w-28 cursor-pointer overflow-hidden rounded-2xl ring-2 transition-all ${dragOver ? "ring-primary scale-105 bg-primary/10" : "ring-border/50 hover:ring-border"}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {previewUrl ? (
          <Image src={previewUrl} alt={name || "صورة الضيف"} fill className="object-cover" unoptimized={previewUrl.startsWith("blob:")} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-accent/10 to-primary/5">
            <span className="text-3xl font-bold text-muted-foreground">{initials}</span>
          </div>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="h-5 w-5 text-white" />
          <span className="text-[10px] font-medium text-white/80">رفع صورة</span>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileSelected(file); e.target.value = "" }} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[10px] text-muted-foreground">JPG, PNG, WebP — حتى 5 ميجابايت</p>

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          aspect={1}
          cropShape="round"
          outputSize={800}
          outputQuality={0.88}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropFile(null)}
        />
      )}
    </div>
  )
}

/* ─── Linked Episodes Section ─── */

function LinkedEpisodesSection({ episodes, linkedEpisodeIds, onLink, onUnlink }: {
  episodes: EpisodeSummary[]
  linkedEpisodeIds: string[]
  onLink: (episodeId: string) => void
  onUnlink: (episodeId: string) => void
}) {
  const [epSearch, setEpSearch] = useState("")
  const [showPicker, setShowPicker] = useState(false)

  const linkedSet = new Set(linkedEpisodeIds)
  const linkedEpisodes = episodes.filter((ep) => linkedSet.has(ep.id))

  // For the picker: show ALL unlinked episodes, optionally filtered by search.
  // No slice/limit — every episode in the database must be selectable.
  const normalizedEpSearch = normalizeArabic(epSearch)
  const unlinkedEpisodes = episodes.filter((ep) => !linkedSet.has(ep.id))
  const availableEpisodes = !normalizedEpSearch
    ? unlinkedEpisodes
    : unlinkedEpisodes.filter((ep) =>
        normalizeArabic(ep.title).includes(normalizedEpSearch)
      )
  const totalUnlinked = unlinkedEpisodes.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ExternalLink className="h-3.5 w-3.5 text-primary" />
          الحلقات المرتبطة
          {linkedEpisodes.length > 0 && (
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{linkedEpisodes.length}</span>
          )}
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowPicker(!showPicker)} className="h-8 gap-1.5 rounded-xl text-xs">
          <Plus className="h-3.5 w-3.5" />
          ربط حلقة
        </Button>
      </div>

      {/* Linked episodes list */}
      {linkedEpisodes.length > 0 ? (
        <div className="space-y-1.5">
          {linkedEpisodes.map((ep) => (
            <div key={ep.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-border/30">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium" dir="auto">{ep.title}</p>
                <p className="text-[10px] text-muted-foreground">{ep.release_date}</p>
              </div>
              <button
                onClick={() => onUnlink(ep.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                title="إلغاء الربط"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-white/[0.02] py-4 text-center text-xs text-muted-foreground ring-1 ring-border/30">
          لا توجد حلقات مرتبطة — اضغط &quot;ربط حلقة&quot;
        </p>
      )}

      {/* Episode picker dropdown */}
      {showPicker && (
        <div className="space-y-2 rounded-xl border border-border/50 bg-card/95 p-3 shadow-lg">
          <Input
            value={epSearch}
            onChange={(e) => setEpSearch(e.target.value)}
            placeholder="ابحث عن حلقة..."
            dir="auto"
            className="h-9 rounded-xl text-xs"
          />
          <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground">
            <span>
              {epSearch
                ? `${availableEpisodes.length} من ${totalUnlinked} حلقة`
                : `${totalUnlinked} حلقة متاحة للربط`}
            </span>
            {availableEpisodes.length > 50 && (
              <span className="text-muted-foreground">مرّر للعرض الكامل</span>
            )}
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto overscroll-contain">
            {availableEpisodes.length > 0 ? (
              availableEpisodes.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => { onLink(ep.id); setEpSearch("") }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-[12px] transition-all hover:bg-primary/10"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate" dir="auto">{ep.title}</span>
                  {ep.release_date && (
                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                      {ep.release_date}
                    </span>
                  )}
                  {ep.guest_id && !linkedSet.has(ep.id) && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">مرتبطة بضيف آخر</span>
                  )}
                </button>
              ))
            ) : (
              <p className="py-3 text-center text-xs text-muted-foreground">
                {epSearch ? "لا توجد نتائج" : "جميع الحلقات مرتبطة"}
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setShowPicker(false); setEpSearch("") }} className="h-7 rounded-lg text-[10px]">إغلاق</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Guest Form Dialog ─── */

function GuestFormDialog({ isNew, formData, setFormData, onSave, onClose, saving, error: saveError, guestId, episodes, linkedEpisodeIds, onLinkEpisode, onUnlinkEpisode, pendingImage, onPendingImageChange }: {
  isNew: boolean
  formData: { name: string; bio: string; photo_url: string; testimonial: string; external_links: Record<string, string> }
  setFormData: (data: typeof formData | ((prev: typeof formData) => typeof formData)) => void
  onSave: () => void
  onClose: () => void
  saving: boolean
  error: string | null
  guestId: string | null
  episodes: EpisodeSummary[]
  linkedEpisodeIds: string[]
  onLinkEpisode: (episodeId: string) => void
  onUnlinkEpisode: (episodeId: string) => void
  pendingImage: File | null
  onPendingImageChange: (file: File) => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [showLinkPicker, setShowLinkPicker] = useState(false)

  // Compute preview URL: pending blob takes priority over saved URL
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!pendingImage) { setBlobUrl(null); return }
    const url = URL.createObjectURL(pendingImage)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingImage])
  const previewUrl = blobUrl || formData.photo_url || null

  useEffect(() => { nameRef.current?.focus() }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [saving, onClose])

  const addLink = (key: string) => {
    setFormData(prev => ({ ...prev, external_links: { ...prev.external_links, [key]: "" } }))
    setShowLinkPicker(false)
  }
  const updateLink = (key: string, value: string) => setFormData(prev => ({ ...prev, external_links: { ...prev.external_links, [key]: value } }))
  const removeLink = (key: string) => { setFormData(prev => { const { [key]: removed, ...rest } = prev.external_links; void removed; return { ...prev, external_links: rest } }) }
  const availablePlatforms = SOCIAL_PLATFORMS.filter((p) => !(p.key in formData.external_links))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-border/50 bg-card/95 shadow-2xl shadow-black/30 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 rounded-t-3xl border-b border-border/30 bg-card/95 px-8 pb-4 pt-8 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold">{isNew ? "إضافة ضيف جديد" : "تعديل الضيف"}</h3>
              <p className="text-sm text-muted-foreground">{isNew ? "أدخل معلومات الضيف الجديد" : "عدّل معلومات الضيف"}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-6 px-8 py-6">
          <div className="flex justify-center">
            <PhotoPicker previewUrl={previewUrl} name={formData.name} onFileReady={onPendingImageChange} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">الاسم <span className="text-destructive">*</span></label>
            <Input ref={nameRef} value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="اسم الضيف" dir="auto" className="h-11 rounded-xl" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">نبذة</label>
              <span className="text-[11px] text-muted-foreground">{formData.bio.length}/1000</span>
            </div>
            <textarea
              value={formData.bio}
              onChange={(e) => { if (e.target.value.length <= 1000) setFormData(prev => ({ ...prev, bio: e.target.value })) }}
              placeholder="نبذة مختصرة عن الضيف"
              dir="auto"
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Quote className="h-3.5 w-3.5 text-primary" />
              أثر الضيف
            </label>
            <textarea
              value={formData.testimonial}
              onChange={(e) => { if (e.target.value.length <= 450) setFormData(prev => ({ ...prev, testimonial: e.target.value })) }}
              placeholder="رسالة شخصية من الضيف — شكر، تأمل، اقتباس، أو شعور بعد الحلقة..."
              dir="auto" rows={4}
              className="w-full resize-none rounded-xl border border-border bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">أثر شخصي يتركه الضيف — ستظهر كبطاقة مميزة في ملفه الشخصي</p>
              <span className={`text-[10px] tabular-nums ${formData.testimonial.length > 400 ? "text-primary" : "text-muted-foreground"}`}>{formData.testimonial.length}/450</span>
            </div>
            {formData.testimonial.trim() && (
              <div className="pt-1">
                <p className="mb-2 text-[10px] text-muted-foreground">معاينة:</p>
                <AtharCard text={formData.testimonial} guestName={formData.name || "اسم الضيف"} compact />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">الروابط الخارجية</label>
              {availablePlatforms.length > 0 && (
                <div className="relative">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowLinkPicker(!showLinkPicker)} className="h-8 gap-1.5 rounded-xl text-xs">
                    <Plus className="h-3.5 w-3.5" />
                    إضافة رابط
                  </Button>
                  {showLinkPicker && (
                    <div className="absolute end-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-xl backdrop-blur-xl">
                      {availablePlatforms.map((p) => { const Icon = p.icon; return (
                        <button key={p.key} onClick={() => addLink(p.key)} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-all hover:bg-white/5">
                          <Icon className="h-4 w-4 opacity-60" />{p.label}
                        </button>
                      ) })}
                    </div>
                  )}
                </div>
              )}
            </div>
            {Object.entries(formData.external_links).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(formData.external_links).map(([key, value]) => {
                  const Icon = getSocialIcon(key)
                  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key)
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.03] ring-1 ring-border/50"><Icon className="h-4 w-4 text-muted-foreground" /></div>
                      <Input value={value} onChange={(e) => updateLink(key, e.target.value)} placeholder={platform?.placeholder || "https://..."} dir="ltr" className="h-9 flex-1 rounded-xl text-xs" />
                      <button onClick={() => removeLink(key)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-white/[0.02] py-4 text-center text-xs text-muted-foreground ring-1 ring-border/30">لا توجد روابط — اضغط &quot;إضافة رابط&quot;</p>
            )}
          </div>

          {/* Episode Linking — only show when editing an existing guest */}
          {!isNew && guestId && (
            <LinkedEpisodesSection
              episodes={episodes}
              linkedEpisodeIds={linkedEpisodeIds}
              onLink={onLinkEpisode}
              onUnlink={onUnlinkEpisode}
            />
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 space-y-2 rounded-b-3xl border-t border-border/30 bg-card/95 px-8 py-4 backdrop-blur-xl">
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={saving} className="rounded-xl">إلغاء</Button>
            <Button onClick={onSave} disabled={!formData.name.trim() || saving} className="gap-2 rounded-xl px-6">
              {saving ? (<><Loader2 className="h-4 w-4 animate-spin" />جارٍ الحفظ...</>) : (<><Check className="h-4 w-4" />{isNew ? "إضافة الضيف" : "حفظ التعديلات"}</>)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Guest List Row ─── */

function GuestListRow({ guest, selected, onToggleSelect, onEdit, onDelete }: { guest: GuestWithCount; selected: boolean; onToggleSelect: () => void; onEdit: () => void; onDelete: () => Promise<void> }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const initials = guest.name.split(" ").map((w) => w[0]).slice(0, 2).join("")
  const socialCount = guest.external_links ? Object.keys(guest.external_links).length : 0

  return (
    <div className={cn("group relative flex items-center gap-3 px-4 py-3 transition-all duration-200 hover:bg-muted/30", selected && "bg-primary/5")}>
      {/* Select checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`تحديد ${guest.name}`}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-border/60 accent-primary"
      />

      {/* Avatar */}
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl">
        {guest.photo_url ? (
          <Image src={guest.photo_url} alt={guest.name} fill sizes="36px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-accent/10 to-primary/5">
            <span className="text-xs font-bold text-muted-foreground">{initials}</span>
          </div>
        )}
      </div>

      {/* Name + bio */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">{guest.name}</p>
        {guest.bio && <p className="hidden truncate text-[11px] text-muted-foreground md:block">{guest.bio}</p>}
      </div>

      {/* Episode count pill */}
      <span className="hidden w-20 shrink-0 text-center sm:block">
        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          {formatArabicCount(guest.episodeCount, "حلقة")}
        </span>
      </span>

      {/* Social link count */}
      {socialCount > 0 && (
        <span className="hidden w-16 shrink-0 text-center text-[11px] text-muted-foreground md:block">
          {socialCount} {socialCount === 1 ? "رابط" : "روابط"}
        </span>
      )}
      {socialCount === 0 && <span className="hidden w-16 shrink-0 md:block" />}

      {/* Action menu */}
      <ActionMenu>
        {(close) => (
          <>
            <MenuItem icon={Pencil} label="تعديل" onClick={() => { onEdit(); close() }} />
            <MenuItem icon={ExternalLink} label="عرض الملف" onClick={() => { window.open(`/guests/${guest.slug}`, "_blank"); close() }} />
            <div className="my-1 border-t border-border/30" />
            <MenuItem icon={Trash2} label="حذف" variant="danger" onClick={() => { setConfirmDelete(true); close() }} />
          </>
        )}
      </ActionMenu>

      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-card/95 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium">حذف &quot;{guest.name}&quot;؟</p>
            <Button size="sm" variant="destructive" disabled={deleting} onClick={async () => { setDeleting(true); await onDelete(); setDeleting(false) }} className="h-8 gap-1.5 rounded-xl text-xs">
              {deleting ? <><Loader2 className="h-3 w-3 animate-spin" />جارٍ الحذف...</> : "تأكيد"}
            </Button>
            <Button size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirmDelete(false)} className="h-8 rounded-xl text-xs">إلغاء</Button>
          </div>
        </div>
      )}
    </div>
  )
}


/* ─── Main GuestsList ─── */

export function GuestsList({ guests: initialGuests, episodes: initialEpisodes }: GuestsListProps) {
  const router = useRouter()
  const [guests, setGuests] = useState(initialGuests)
  const [episodes, setEpisodes] = useState(initialEpisodes)
  const [search, setSearch] = useState("")
  const [editingGuest, setEditingGuest] = useState<GuestWithCount | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [listSuccess, setListSuccess] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: "", bio: "", photo_url: "", testimonial: "", external_links: {} as Record<string, string> })
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [linkedEpisodeIds, setLinkedEpisodeIds] = useState<string[]>([])
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false)
  const [bulkLinkLoading, setBulkLinkLoading] = useState(false)
  const [bulkLinkError, setBulkLinkError] = useState<string | null>(null)
  const [bulkLinkPreview, setBulkLinkPreview] = useState<{ total: number; alreadyLinked: number; toLink: number; items: { episodeId: string; episodeTitle: string; guestName: string; alreadyLinked: boolean }[] } | null>(null)
  const [bulkLinkResult, setBulkLinkResult] = useState<{ linked: number; guestsCreated: number; failed: number } | null>(null)

  // Bulk selection + delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Auto-clear top-level toasts
  useEffect(() => {
    if (!listSuccess) return
    const id = setTimeout(() => setListSuccess(null), 3500)
    return () => clearTimeout(id)
  }, [listSuccess])
  useEffect(() => {
    if (!listError) return
    const id = setTimeout(() => setListError(null), 5000)
    return () => clearTimeout(id)
  }, [listError])

  const handleBulkLinkPreview = async () => {
    setBulkLinkOpen(true)
    setBulkLinkLoading(true)
    setBulkLinkResult(null)
    setBulkLinkPreview(null)
    setBulkLinkError(null)
    try {
      const res = await fetch("/api/admin/guests/bulk-link")
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBulkLinkError(data.error || "فشل جلب بيانات الربط التلقائي")
        return
      }
      setBulkLinkPreview(data)
    } catch {
      setBulkLinkError("حدث خطأ في الاتصال. حاول مرة أخرى.")
    } finally {
      setBulkLinkLoading(false)
    }
  }

  const handleBulkLinkExecute = async () => {
    setBulkLinkLoading(true)
    setBulkLinkError(null)
    try {
      const res = await fetch("/api/admin/guests/bulk-link", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setBulkLinkError(data.error || "فشل تنفيذ الربط التلقائي")
        return
      }
      setBulkLinkResult(data.summary)
      // Refresh data without a full page reload
      setTimeout(() => {
        router.refresh()
        setBulkLinkOpen(false)
        setBulkLinkPreview(null)
        setBulkLinkResult(null)
      }, 2000)
    } catch {
      setBulkLinkError("حدث خطأ في الاتصال. حاول مرة أخرى.")
    } finally {
      setBulkLinkLoading(false)
    }
  }

  const normalizedSearch = normalizeArabic(search)
  const filteredGuests = !normalizedSearch ? guests : guests.filter((g) => normalizeArabic(g.name).includes(normalizedSearch) || (g.bio && normalizeArabic(g.bio).includes(normalizedSearch)))
  const totalEpisodes = guests.reduce((sum, g) => sum + g.episodeCount, 0)
  const withPhoto = guests.filter((g) => g.photo_url).length

  // Selection is scoped to the currently-visible (filtered) rows so
  // "select all" never silently selects guests hidden by the search.
  const selectedVisibleCount = filteredGuests.reduce((n, g) => n + (selectedIds.has(g.id) ? 1 : 0), 0)
  const allVisibleSelected = filteredGuests.length > 0 && selectedVisibleCount === filteredGuests.length

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) filteredGuests.forEach((g) => next.delete(g.id))
      else filteredGuests.forEach((g) => next.add(g.id))
      return next
    })
  }
  const clearSelection = () => {
    setSelectedIds(new Set())
    setConfirmBulkDelete(false)
  }

  const handleBulkDelete = async () => {
    const ids = filteredGuests.filter((g) => selectedIds.has(g.id)).map((g) => g.id)
    if (ids.length === 0) return
    setBulkDeleting(true)
    setListError(null)
    try {
      const res = await fetch("/api/admin/guests/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setListError(data.error || "حدث خطأ أثناء الحذف الجماعي")
        return
      }
      const deletedSet = new Set<string>(data.deletedIds ?? [])
      setGuests((prev) => prev.filter((g) => !deletedSet.has(g.id)))
      setSelectedIds(new Set())
      setConfirmBulkDelete(false)
      if (data.failed > 0) {
        setListError(`تم حذف ${data.deleted} ضيف، وتعذّر حذف ${data.failed}`)
      } else {
        setListSuccess(`تم حذف ${data.deleted} ${data.deleted === 1 ? "ضيف" : "ضيوف"}`)
      }
    } catch {
      setListError("حدث خطأ في الاتصال. حاول مرة أخرى.")
    } finally {
      setBulkDeleting(false)
    }
  }

  const openAddDialog = () => { setSaveError(null); setPendingImage(null); setFormData({ name: "", bio: "", photo_url: "", testimonial: "", external_links: {} }); setLinkedEpisodeIds([]); setIsAddingNew(true) }
  const openEditDialog = (guest: GuestWithCount) => {
    setSaveError(null)
    setPendingImage(null)
    setFormData({ name: guest.name, bio: guest.bio || "", photo_url: guest.photo_url || "", testimonial: guest.testimonial || "", external_links: guest.external_links || {} })
    setLinkedEpisodeIds(episodes.filter((ep) => ep.guest_id === guest.id).map((ep) => ep.id))
    setEditingGuest(guest)
  }
  const closeDialog = () => { setEditingGuest(null); setIsAddingNew(false); setSaveError(null); setPendingImage(null) }

  const handleLinkEpisode = async (episodeId: string) => {
    if (!editingGuest) return
    setSaveError(null)
    try {
      const res = await fetch(`/api/admin/guests/${editingGuest.id}/link-episode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError(data.error || "فشل ربط الحلقة")
        return
      }
      setLinkedEpisodeIds((prev) => [...prev, episodeId])
      setEpisodes((prev) => prev.map((ep) => ep.id === episodeId ? { ...ep, guest_id: editingGuest.id } : ep))
      setGuests((prev) => prev.map((g) => g.id === editingGuest.id ? { ...g, episodeCount: g.episodeCount + 1 } : g))
    } catch {
      setSaveError("حدث خطأ في الاتصال. حاول مرة أخرى.")
    }
  }

  const handleUnlinkEpisode = async (episodeId: string) => {
    if (!editingGuest) return
    setSaveError(null)
    try {
      const res = await fetch(`/api/admin/guests/${editingGuest.id}/link-episode`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError(data.error || "فشل إلغاء ربط الحلقة")
        return
      }
      setLinkedEpisodeIds((prev) => prev.filter((id) => id !== episodeId))
      setEpisodes((prev) => prev.map((ep) => ep.id === episodeId ? { ...ep, guest_id: null } : ep))
      setGuests((prev) => prev.map((g) => g.id === editingGuest.id ? { ...g, episodeCount: Math.max(0, g.episodeCount - 1) } : g))
    } catch {
      setSaveError("حدث خطأ في الاتصال. حاول مرة أخرى.")
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      // Step 1: Upload pending image file if user selected one
      let photoUrl: string | null = formData.photo_url || null
      if (pendingImage) {
        const uploadForm = new FormData()
        uploadForm.append("file", pendingImage)
        const uploadRes = await fetch("/api/admin/guests/upload", { method: "POST", body: uploadForm })
        const uploadData = await uploadRes.json()
        if (!uploadRes.ok || !uploadData.success) {
          console.error("[GuestSave] Upload failed:", uploadData)
          setSaveError(uploadData.error || "فشل رفع الصورة")
          return
        }
        photoUrl = uploadData.url
      }

      // Step 2: Save guest data with the resolved photo URL
      const payload = {
        name: formData.name,
        bio: formData.bio || null,
        photo_url: photoUrl,
        testimonial: formData.testimonial || null,
        external_links: Object.keys(formData.external_links).length > 0 ? formData.external_links : null,
      }

      if (isAddingNew) {
        const res = await fetch("/api/admin/guests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setSaveError(data.error || "حدث خطأ أثناء إضافة الضيف")
          return
        }
        const newGuest = await res.json()
        setGuests([...guests, { ...newGuest, episodeCount: 0 }])
        setListSuccess(`تم إضافة "${payload.name}"`)
      } else if (editingGuest) {
        const res = await fetch(`/api/admin/guests/${editingGuest.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setSaveError(data.error || "حدث خطأ أثناء تحديث الضيف")
          return
        }
        setGuests(guests.map((g) => g.id === editingGuest.id ? { ...g, ...payload } : g))
        setListSuccess(`تم تحديث "${payload.name}"`)
      }
      closeDialog()
      router.refresh()
    } catch {
      setSaveError("حدث خطأ في الاتصال. حاول مرة أخرى.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (guest: GuestWithCount) => {
    setListError(null)
    try {
      const res = await fetch(`/api/admin/guests/${guest.id}`, { method: "DELETE" })
      if (res.ok) {
        setGuests(guests.filter((g) => g.id !== guest.id))
        setSelectedIds((prev) => {
          if (!prev.has(guest.id)) return prev
          const next = new Set(prev)
          next.delete(guest.id)
          return next
        })
        setListSuccess(`تم حذف "${guest.name}"`)
      } else {
        const data = await res.json().catch(() => ({}))
        setListError(data.error || `حدث خطأ أثناء حذف "${guest.name}"`)
      }
    } catch {
      setListError("حدث خطأ في الاتصال. حاول مرة أخرى.")
    }
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">إدارة الضيوف</h1>
        <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{guests.length} ضيف</span>
        <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{totalEpisodes} حلقة</span>
        <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{withPhoto} صورة</span>
        <div className="flex-1" />
        <Button variant="outline" onClick={handleBulkLinkPreview} className="h-9 gap-2 rounded-lg text-[11px]"><LinkIcon className="h-4 w-4" />ربط تلقائي</Button>
        <Button onClick={openAddDialog} className="h-9 gap-2 rounded-lg text-[11px]"><Plus className="h-4 w-4" />إضافة ضيف</Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="ابحث عن ضيف..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-full rounded-lg border-border/40 bg-card/60 ps-10 text-[13px]" />
        {search && <button onClick={() => setSearch("")} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"><X className="h-4 w-4" /></button>}
      </div>

      {/* Toasts */}
      {listSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-2 text-[12px] text-green-700">
          <Check className="h-4 w-4 shrink-0" />
          <span>{listSuccess}</span>
        </div>
      )}
      {listError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2 text-[12px] text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{listError}</span>
          <button
            onClick={() => setListError(null)}
            className="ms-auto text-destructive/70 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Bulk selection action bar — visible only while rows are selected */}
      {selectedVisibleCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-2.5">
          <span className="text-[12px] font-medium text-foreground">
            {formatArabicCount(selectedVisibleCount, "ضيف")} محدّد
          </span>
          {confirmBulkDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-destructive">تأكيد حذف {selectedVisibleCount}؟</span>
              <Button size="sm" variant="destructive" disabled={bulkDeleting} onClick={handleBulkDelete} className="h-8 gap-1.5 rounded-lg text-xs">
                {bulkDeleting ? <><Loader2 className="h-3 w-3 animate-spin" />جارٍ الحذف...</> : "تأكيد الحذف"}
              </Button>
              <Button size="sm" variant="ghost" disabled={bulkDeleting} onClick={() => setConfirmBulkDelete(false)} className="h-8 rounded-lg text-xs">تراجع</Button>
            </div>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => setConfirmBulkDelete(true)} className="h-8 gap-1.5 rounded-lg text-xs">
              <Trash2 className="h-3.5 w-3.5" />حذف المحدّد
            </Button>
          )}
          <div className="flex-1" />
          <button onClick={clearSelection} className="text-[12px] text-muted-foreground hover:text-foreground">إلغاء التحديد</button>
        </div>
      )}

      {/* List */}
      {filteredGuests.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border/30 bg-card/50 admin-glow">
          {/* Select-all header */}
          <div className="flex items-center gap-3 border-b border-border/15 bg-muted/20 px-4 py-2">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(el) => { if (el) el.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected }}
              onChange={toggleSelectAllVisible}
              aria-label="تحديد كل الضيوف"
              className="h-4 w-4 shrink-0 cursor-pointer rounded border-border/60 accent-primary"
            />
            <span className="text-[11px] text-muted-foreground">
              {selectedVisibleCount > 0 ? `${selectedVisibleCount} / ${filteredGuests.length}` : "تحديد الكل"}
            </span>
          </div>
          <div className="divide-y divide-border/15">
            {filteredGuests.map((guest) => (
              <GuestListRow
                key={guest.id}
                guest={guest}
                selected={selectedIds.has(guest.id)}
                onToggleSelect={() => toggleSelected(guest.id)}
                onEdit={() => openEditDialog(guest)}
                onDelete={() => handleDelete(guest)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/[0.03] ring-1 ring-border/50"><User className="h-6 w-6 text-muted-foreground" /></div>
          <p className="text-base font-semibold text-muted-foreground">{search ? "لم يتم العثور على ضيوف" : "لا يوجد ضيوف بعد"}</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">{search ? `لم يتم العثور على ضيوف يطابقون "${search}"` : "اضغط على \"إضافة ضيف\" لإضافة أول ضيف"}</p>
        </div>
      )}

      {(isAddingNew || editingGuest) && (
        <GuestFormDialog
          isNew={isAddingNew}
          formData={formData}
          setFormData={setFormData}
          onSave={handleSave}
          onClose={closeDialog}
          saving={isSaving}
          error={saveError}
          guestId={editingGuest?.id || null}
          episodes={episodes}
          linkedEpisodeIds={linkedEpisodeIds}
          onLinkEpisode={handleLinkEpisode}
          onUnlinkEpisode={handleUnlinkEpisode}
          pendingImage={pendingImage}
          onPendingImageChange={setPendingImage}
        />
      )}

      {/* Bulk Link Dialog */}
      {bulkLinkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative flex max-h-[70vh] w-full max-w-lg flex-col rounded-2xl border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="font-semibold">ربط الضيوف تلقائياً</h3>
              <button onClick={() => { setBulkLinkOpen(false); setBulkLinkPreview(null); setBulkLinkResult(null); setBulkLinkError(null) }} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {bulkLinkError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{bulkLinkError}</span>
                </div>
              )}
              {bulkLinkLoading && !bulkLinkResult && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {bulkLinkResult && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/50">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">تم الربط بنجاح</p>
                  <p className="text-xs text-green-700/70 dark:text-green-400/60 mt-1">
                    تم ربط {bulkLinkResult.linked} حلقة · إنشاء {bulkLinkResult.guestsCreated} ضيف جديد
                    {bulkLinkResult.failed > 0 && ` · فشل ${bulkLinkResult.failed}`}
                  </p>
                </div>
              )}
              {bulkLinkPreview && !bulkLinkResult && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {bulkLinkPreview.toLink > 0
                      ? `وُجد ${bulkLinkPreview.toLink} حلقة يمكن ربطها بضيوف (${bulkLinkPreview.alreadyLinked} مربوطة مسبقاً)`
                      : "جميع الحلقات مربوطة بضيوف بالفعل"}
                  </p>
                  {bulkLinkPreview.items.filter((i) => !i.alreadyLinked).length > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {bulkLinkPreview.items.filter((i) => !i.alreadyLinked).map((item) => (
                        <div key={item.episodeId} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{item.episodeTitle}</p>
                            <p className="text-xs text-muted-foreground">الضيف: {item.guestName}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {bulkLinkPreview && !bulkLinkResult && bulkLinkPreview.toLink > 0 && (
              <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
                <Button variant="outline" onClick={() => { setBulkLinkOpen(false); setBulkLinkPreview(null) }}>إلغاء</Button>
                <Button onClick={handleBulkLinkExecute} disabled={bulkLinkLoading} className="gap-2">
                  {bulkLinkLoading ? <><Loader2 className="h-4 w-4 animate-spin" />جارٍ الربط...</> : <><LinkIcon className="h-4 w-4" />ربط {bulkLinkPreview.toLink} حلقة</>}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
