"use client"

import { useState, useRef, useEffect } from "react"
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
import { formatArabicCount } from "@/lib/utils"
import { AtharCard } from "@/components/guests/athar-card"

/* ─── Types ─── */

interface GuestWithCount extends Guest {
  episodeCount: number
}

interface GuestsListProps {
  guests: GuestWithCount[]
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

/* ─── Action Menu ─── */

function ActionMenu({ children }: { children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
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
        <div role="menu" className="absolute end-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, variant }: { icon: React.ElementType; label: string; onClick: () => void; variant?: "default" | "danger" }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-all ${variant === "danger" ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-white/5"}`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-60" />
      {label}
    </button>
  )
}

/* ─── Photo Upload ─── */

function PhotoUploader({ currentUrl, name, onUpload }: { currentUrl: string; name: string; onUpload: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError("")
    if (!file.type.startsWith("image/")) { setError("الملف ليس صورة"); return }
    if (file.size > 5 * 1024 * 1024) { setError("حجم الملف يتجاوز 5 ميجابايت"); return }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/admin/guests/upload", { method: "POST", body: formData })
      const data = await res.json()
      if (data.success) onUpload(data.url)
      else setError(data.error || "فشل رفع الصورة")
    } catch {
      setError("حدث خطأ أثناء الرفع")
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
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
        {currentUrl ? (
          <Image src={currentUrl} alt={name || "صورة الضيف"} fill className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-accent/10 to-primary/5">
            <span className="text-3xl font-bold text-muted-foreground/60">{initials}</span>
          </div>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-white" /> : (
            <>
              <Camera className="h-5 w-5 text-white" />
              <span className="text-[10px] font-medium text-white/80">رفع صورة</span>
            </>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = "" }} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[10px] text-muted-foreground/60">JPG, PNG, WebP — حتى 5 ميجابايت</p>
    </div>
  )
}

/* ─── Guest Form Dialog ─── */

function GuestFormDialog({ isNew, formData, setFormData, onSave, onClose, saving, error: saveError }: {
  isNew: boolean
  formData: { name: string; bio: string; photo_url: string; testimonial: string; external_links: Record<string, string> }
  setFormData: (data: typeof formData) => void
  onSave: () => void
  onClose: () => void
  saving: boolean
  error: string | null
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [showLinkPicker, setShowLinkPicker] = useState(false)

  useEffect(() => { nameRef.current?.focus() }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [saving, onClose])

  const addLink = (key: string) => {
    setFormData({ ...formData, external_links: { ...formData.external_links, [key]: "" } })
    setShowLinkPicker(false)
  }
  const updateLink = (key: string, value: string) => setFormData({ ...formData, external_links: { ...formData.external_links, [key]: value } })
  const removeLink = (key: string) => { const { [key]: _, ...rest } = formData.external_links; setFormData({ ...formData, external_links: rest }) }
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
            <PhotoUploader currentUrl={formData.photo_url} name={formData.name} onUpload={(url) => setFormData({ ...formData, photo_url: url })} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">الاسم <span className="text-destructive">*</span></label>
            <Input ref={nameRef} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="اسم الضيف" dir="auto" className="h-11 rounded-xl" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">نبذة</label>
            <textarea value={formData.bio} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} placeholder="نبذة مختصرة عن الضيف" dir="auto" rows={3} className="w-full resize-none rounded-xl border border-border bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Quote className="h-3.5 w-3.5 text-primary" />
              أثر الضيف
            </label>
            <textarea
              value={formData.testimonial}
              onChange={(e) => { if (e.target.value.length <= 450) setFormData({ ...formData, testimonial: e.target.value }) }}
              placeholder="رسالة شخصية من الضيف — شكر، تأمل، اقتباس، أو شعور بعد الحلقة..."
              dir="auto" rows={4}
              className="w-full resize-none rounded-xl border border-border bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground/50">أثر شخصي يتركه الضيف — ستظهر كبطاقة مميزة في ملفه الشخصي</p>
              <span className={`text-[10px] tabular-nums ${formData.testimonial.length > 400 ? "text-primary" : "text-muted-foreground/40"}`}>{formData.testimonial.length}/450</span>
            </div>
            {formData.testimonial.trim() && (
              <div className="pt-1">
                <p className="mb-2 text-[10px] text-muted-foreground/40">معاينة:</p>
                <AtharCard text={formData.testimonial} guestName={formData.name || "اسم الضيف"} compact />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">أو رابط صورة خارجي</label>
            <Input value={formData.photo_url} onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })} placeholder="https://..." dir="ltr" className="h-10 rounded-xl text-xs" />
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
              <p className="rounded-xl bg-white/[0.02] py-4 text-center text-xs text-muted-foreground/50 ring-1 ring-border/30">لا توجد روابط — اضغط &quot;إضافة رابط&quot;</p>
            )}
          </div>
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

function GuestListRow({ guest, onEdit, onDelete }: { guest: GuestWithCount; onEdit: () => void; onDelete: () => Promise<void> }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const initials = guest.name.split(" ").map((w) => w[0]).slice(0, 2).join("")
  const socialCount = guest.external_links ? Object.keys(guest.external_links).length : 0

  return (
    <div className="group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
      {/* Avatar */}
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl">
        {guest.photo_url ? (
          <Image src={guest.photo_url} alt={guest.name} fill sizes="36px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-accent/10 to-primary/5">
            <span className="text-xs font-bold text-muted-foreground/60">{initials}</span>
          </div>
        )}
      </div>

      {/* Name + bio */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{guest.name}</p>
        {guest.bio && <p className="hidden truncate text-xs text-muted-foreground md:block">{guest.bio}</p>}
      </div>

      {/* Episode count pill */}
      <span className="hidden w-20 shrink-0 text-center sm:block">
        <span className="rounded-full bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
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
            <div className="my-1 border-t border-border/50" />
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

export function GuestsList({ guests: initialGuests }: GuestsListProps) {
  const [guests, setGuests] = useState(initialGuests)
  const [search, setSearch] = useState("")
  const [editingGuest, setEditingGuest] = useState<GuestWithCount | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: "", bio: "", photo_url: "", testimonial: "", external_links: {} as Record<string, string> })
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false)
  const [bulkLinkLoading, setBulkLinkLoading] = useState(false)
  const [bulkLinkPreview, setBulkLinkPreview] = useState<{ total: number; alreadyLinked: number; toLink: number; items: { episodeId: string; episodeTitle: string; guestName: string; alreadyLinked: boolean }[] } | null>(null)
  const [bulkLinkResult, setBulkLinkResult] = useState<{ linked: number; guestsCreated: number; failed: number } | null>(null)

  const handleBulkLinkPreview = async () => {
    setBulkLinkOpen(true)
    setBulkLinkLoading(true)
    setBulkLinkResult(null)
    try {
      const res = await fetch("/api/admin/guests/bulk-link")
      const data = await res.json()
      setBulkLinkPreview(data)
    } catch {
      setBulkLinkPreview(null)
    } finally {
      setBulkLinkLoading(false)
    }
  }

  const handleBulkLinkExecute = async () => {
    setBulkLinkLoading(true)
    try {
      const res = await fetch("/api/admin/guests/bulk-link", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setBulkLinkResult(data.summary)
        // Refresh page to show new guests
        setTimeout(() => window.location.reload(), 2000)
      }
    } catch {
      // ignore
    } finally {
      setBulkLinkLoading(false)
    }
  }

  const normalizedSearch = normalizeArabic(search)
  const filteredGuests = !normalizedSearch ? guests : guests.filter((g) => normalizeArabic(g.name).includes(normalizedSearch) || (g.bio && normalizeArabic(g.bio).includes(normalizedSearch)))
  const totalEpisodes = guests.reduce((sum, g) => sum + g.episodeCount, 0)
  const withPhoto = guests.filter((g) => g.photo_url).length

  const openAddDialog = () => { setSaveError(null); setFormData({ name: "", bio: "", photo_url: "", testimonial: "", external_links: {} }); setIsAddingNew(true) }
  const openEditDialog = (guest: GuestWithCount) => { setSaveError(null); setFormData({ name: guest.name, bio: guest.bio || "", photo_url: guest.photo_url || "", testimonial: guest.testimonial || "", external_links: guest.external_links || {} }); setEditingGuest(guest) }
  const closeDialog = () => { setEditingGuest(null); setIsAddingNew(false); setSaveError(null) }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const payload = {
        name: formData.name,
        bio: formData.bio || null,
        photo_url: formData.photo_url || null,
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
      }
      closeDialog()
    } catch {
      setSaveError("حدث خطأ في الاتصال. حاول مرة أخرى.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (guest: GuestWithCount) => {
    try {
      const res = await fetch(`/api/admin/guests/${guest.id}`, { method: "DELETE" })
      if (res.ok) {
        setGuests(guests.filter((g) => g.id !== guest.id))
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || "حدث خطأ أثناء حذف الضيف")
      }
    } catch {
      alert("حدث خطأ في الاتصال. حاول مرة أخرى.")
    }
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">إدارة الضيوف</h1>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{guests.length} ضيف</span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{totalEpisodes} حلقة</span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{withPhoto} صورة</span>
        <div className="flex-1" />
        <Button variant="outline" onClick={handleBulkLinkPreview} className="h-10 gap-2 rounded-xl"><LinkIcon className="h-4 w-4" />ربط تلقائي</Button>
        <Button onClick={openAddDialog} className="h-10 gap-2 rounded-xl"><Plus className="h-4 w-4" />إضافة ضيف</Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="ابحث عن ضيف..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 w-full rounded-xl border-border/50 bg-card/80 ps-10 text-sm" />
        {search && <button onClick={() => setSearch("")} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"><X className="h-4 w-4" /></button>}
      </div>

      {/* List */}
      {filteredGuests.length > 0 ? (
        <div className="divide-y divide-border/20 rounded-xl border border-border/30 bg-card/50">
          {filteredGuests.map((guest) => <GuestListRow key={guest.id} guest={guest} onEdit={() => openEditDialog(guest)} onDelete={() => handleDelete(guest)} />)}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/[0.03] ring-1 ring-border/50"><User className="h-6 w-6 text-muted-foreground" /></div>
          <p className="text-base font-semibold text-muted-foreground">{search ? "لم يتم العثور على ضيوف" : "لا يوجد ضيوف بعد"}</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground/60">{search ? `لم يتم العثور على ضيوف يطابقون "${search}"` : "اضغط على \"إضافة ضيف\" لإضافة أول ضيف"}</p>
        </div>
      )}

      {(isAddingNew || editingGuest) && <GuestFormDialog isNew={isAddingNew} formData={formData} setFormData={setFormData} onSave={handleSave} onClose={closeDialog} saving={isSaving} error={saveError} />}

      {/* Bulk Link Dialog */}
      {bulkLinkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative flex max-h-[70vh] w-full max-w-lg flex-col rounded-2xl border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="font-semibold">ربط الضيوف تلقائياً</h3>
              <button onClick={() => { setBulkLinkOpen(false); setBulkLinkPreview(null); setBulkLinkResult(null) }} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {bulkLinkLoading && !bulkLinkResult && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {bulkLinkResult && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/50">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">تم الربط بنجاح</p>
                  <p className="text-xs text-green-600/70 dark:text-green-400/60 mt-1">
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
