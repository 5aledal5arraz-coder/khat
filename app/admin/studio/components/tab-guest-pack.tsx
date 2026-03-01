"use client"

import { useState, useCallback } from "react"
import {
  UserCircle, Loader2, AlertCircle, Plus, Trash2, Link2,
  Instagram, Youtube, Globe, Mail, Linkedin, ChevronDown,
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
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStudioSession } from "./studio-context"
import { AI_STATUS_LABELS } from "./shared"

// ---------------------------------------------------------------------------
// Social platforms
// ---------------------------------------------------------------------------

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

function getSocialPlaceholder(key: string) {
  return SOCIAL_PLATFORMS.find((p) => p.key === key)?.placeholder || "https://..."
}

// ---------------------------------------------------------------------------
// TabGuestPack
// ---------------------------------------------------------------------------

export function TabGuestPack() {
  const {
    websitePkgStatus,
    guestName, guestBio, guestPhotoUrl, guestExternalLinks,
    guestPackageStatus,
    setGuestName, setGuestBio, setGuestPhotoUrl, setGuestExternalLinks,
    debouncedSaveWebPkg,
  } = useStudioSession()

  const [showPlatformPicker, setShowPlatformPicker] = useState(false)

  const statusInfo = AI_STATUS_LABELS[guestPackageStatus] || AI_STATUS_LABELS.idle

  // Helper: save entire guest_package object
  const saveGuestPkg = useCallback((overrides: {
    guest_name?: string
    guest_bio?: string
    guest_photo_url?: string | null
    guest_external_links?: Record<string, string>
  }) => {
    const pkg = {
      guest_name: overrides.guest_name ?? guestName,
      guest_bio: overrides.guest_bio ?? guestBio,
      guest_photo_url: (overrides.guest_photo_url !== undefined ? overrides.guest_photo_url : guestPhotoUrl) || null,
      guest_external_links: overrides.guest_external_links ?? guestExternalLinks,
    }
    debouncedSaveWebPkg({ guest_package: pkg })
  }, [guestName, guestBio, guestPhotoUrl, guestExternalLinks, debouncedSaveWebPkg])

  const handleNameChange = (v: string) => {
    setGuestName(v)
    saveGuestPkg({ guest_name: v })
  }

  const handleBioChange = (v: string) => {
    setGuestBio(v)
    saveGuestPkg({ guest_bio: v })
  }

  const handlePhotoChange = (v: string) => {
    setGuestPhotoUrl(v)
    saveGuestPkg({ guest_photo_url: v || null })
  }

  const addPlatform = (key: string) => {
    const updated = { ...guestExternalLinks, [key]: "" }
    setGuestExternalLinks(updated)
    saveGuestPkg({ guest_external_links: updated })
    setShowPlatformPicker(false)
  }

  const updatePlatformUrl = (key: string, url: string) => {
    const updated = { ...guestExternalLinks, [key]: url }
    setGuestExternalLinks(updated)
    saveGuestPkg({ guest_external_links: updated })
  }

  const removePlatform = (key: string) => {
    const updated = { ...guestExternalLinks }
    delete updated[key]
    setGuestExternalLinks(updated)
    saveGuestPkg({ guest_external_links: updated })
  }

  // Platforms not yet added
  const availablePlatforms = SOCIAL_PLATFORMS.filter(
    (p) => !(p.key in guestExternalLinks)
  )

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-purple-500" />
            <h3 className="font-semibold text-sm">بيانات الضيف</h3>
          </div>
          <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-medium", statusInfo.className)}>
            {statusInfo.label}
          </span>
        </div>

        {/* Idle state */}
        {guestPackageStatus === "idle" && websitePkgStatus !== "generating" && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            سيتم تحديد الضيف تلقائياً عند توليد حزمة الموقع
          </p>
        )}

        {/* Generating state */}
        {(guestPackageStatus === "generating" || websitePkgStatus === "generating") && guestPackageStatus !== "ready" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
            <span className="text-sm text-muted-foreground">جارٍ استخراج بيانات الضيف...</span>
          </div>
        )}

        {/* Ready state */}
        {guestPackageStatus === "ready" && (
          <div className="space-y-5">
            {/* Guest Name */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">اسم الضيف</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500/20"
                dir="rtl"
                placeholder="اسم الضيف الكامل"
              />
            </div>

            {/* Guest Bio */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">نبذة عن الضيف</label>
              <textarea
                value={guestBio}
                onChange={(e) => handleBioChange(e.target.value)}
                rows={3}
                className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500/20 resize-none"
                dir="rtl"
                placeholder="نبذة مختصرة عن الضيف..."
              />
            </div>

            {/* Guest Photo URL */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">رابط صورة الضيف</label>
              <input
                type="url"
                value={guestPhotoUrl}
                onChange={(e) => handlePhotoChange(e.target.value)}
                className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500/20 font-mono text-xs"
                dir="ltr"
                placeholder="https://example.com/photo.jpg"
              />
              {guestPhotoUrl && (
                <div className="mt-2 flex justify-center">
                  <img
                    src={guestPhotoUrl}
                    alt={guestName}
                    className="h-20 w-20 rounded-full object-cover border-2 border-border"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                  />
                </div>
              )}
            </div>

            {/* Social Links */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">حسابات التواصل الاجتماعي</label>
                {availablePlatforms.length > 0 && (
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPlatformPicker(!showPlatformPicker)}
                      className="gap-1.5 text-xs h-7"
                    >
                      <Plus className="h-3 w-3" />
                      إضافة
                      <ChevronDown className="h-3 w-3" />
                    </Button>

                    {showPlatformPicker && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowPlatformPicker(false)} />
                        <div className="absolute end-0 top-full mt-1 z-50 w-56 rounded-xl border bg-card shadow-xl max-h-64 overflow-y-auto">
                          {availablePlatforms.map((p) => {
                            const Icon = p.icon
                            return (
                              <button
                                key={p.key}
                                onClick={() => addPlatform(p.key)}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                              >
                                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span>{p.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {Object.keys(guestExternalLinks).length === 0 && (
                <p className="text-xs text-muted-foreground/60 text-center py-3">
                  لم تُضف حسابات بعد
                </p>
              )}

              <div className="space-y-2">
                {Object.entries(guestExternalLinks).map(([key, url]) => {
                  const Icon = getSocialIcon(key)
                  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key)
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => updatePlatformUrl(key, e.target.value)}
                        placeholder={getSocialPlaceholder(key)}
                        className="flex-1 min-w-0 rounded-lg border bg-background px-3 py-1.5 text-xs font-mono outline-none focus:ring-2 focus:ring-purple-500/20"
                        dir="ltr"
                      />
                      <button
                        onClick={() => removePlatform(key)}
                        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                        title={`إزالة ${platform?.label || key}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
