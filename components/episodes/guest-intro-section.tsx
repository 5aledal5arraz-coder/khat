"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { GuestPortrait } from "@/components/media/guest-portrait"
import { Instagram, Linkedin, Globe, Youtube, Mail } from "lucide-react"
import { EpisodeThumb } from "@/components/media/episode-thumb"
import { PlayBadge } from "@/components/media/play-badge"
import { XIcon } from "@/components/icons/x-icon"
import { TikTokIcon } from "@/components/icons/tiktok-icon"
import { SnapchatIcon } from "@/components/icons/snapchat-icon"
import { FacebookIcon } from "@/components/icons/facebook-icon"
import { ThreadsIcon } from "@/components/icons/threads-icon"
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon"
import { TelegramIcon } from "@/components/icons/telegram-icon"
import { SpotifyIcon } from "@/components/icons/spotify-icon"
import { SoundCloudIcon } from "@/components/icons/soundcloud-icon"
import { TwitchIcon } from "@/components/icons/twitch-icon"
import { DiscordIcon } from "@/components/icons/discord-icon"
import { PinterestIcon } from "@/components/icons/pinterest-icon"
import { getYouTubeId } from "@/lib/utils"
import { trackEvent } from "@/lib/personalization/tracker"
import Link from "next/link"

interface GuestIntroSectionProps {
  guest: {
    name: string
    slug: string
    bio?: string | null
    photo_url?: string | null
    external_links?: Record<string, string> | null
  }
  testimonial?: string | null
  testimonialVideoUrl?: string | null
}

type IconComponent = React.ComponentType<{ className?: string }>

const socialIcons: Record<string, IconComponent> = {
  twitter: XIcon,
  x: XIcon,
  instagram: Instagram,
  youtube: Youtube,
  tiktok: TikTokIcon,
  snapchat: SnapchatIcon,
  facebook: FacebookIcon,
  threads: ThreadsIcon,
  whatsapp: WhatsAppIcon,
  telegram: TelegramIcon,
  linkedin: Linkedin,
  spotify: SpotifyIcon,
  soundcloud: SoundCloudIcon,
  twitch: TwitchIcon,
  discord: DiscordIcon,
  pinterest: PinterestIcon,
  email: Mail,
  website: Globe,
}

export function GuestIntroSection({ guest, testimonial, testimonialVideoUrl }: GuestIntroSectionProps) {
  const [showVideo, setShowVideo] = useState(false)
  const [guestTracked, setGuestTracked] = useState(false)
  const externalLinks = guest.external_links || {}
  const videoId = testimonialVideoUrl ? getYouTubeId(testimonialVideoUrl) : null

  const handleGuestClick = () => {
    if (!guestTracked) {
      setGuestTracked(true)
      trackEvent("guest_open", guest.slug, { name: guest.name })
    }
  }

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
      <CardContent className="p-6">
        <div className="flex flex-col gap-6 sm:flex-row">
          {/* Guest Photo & Basic Info */}
          <div className="flex flex-col items-center gap-4 sm:items-start">
            {/* Same rule as the guest's own page: no photo, no box. The
                144px initials circle that stood here said «اا» for
                «الدكتور الحارث المزيدي» — see `lib/shared/formatters.ts`. */}
            {guest.photo_url ? (
              <Link href={`/guests/${guest.slug}`} onClick={handleGuestClick}>
                <GuestPortrait
                  name={guest.name}
                  photoUrl={guest.photo_url}
                  variant="episode"
                  className="transition-transform hover:scale-105"
                />
              </Link>
            ) : null}

            {/* Social Links */}
            {Object.keys(externalLinks).length > 0 && (
              <div className="flex gap-2">
                {Object.entries(externalLinks).map(([platform, url]) => {
                  const Icon = socialIcons[platform.toLowerCase()] || Globe
                  return (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                      title={platform}
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  )
                })}
              </div>
            )}
          </div>

          {/* Guest Details */}
          <div className="flex-1 text-center sm:text-start">
            <p className="text-caption text-muted-foreground">ضيف الحلقة</p>
            <Link href={`/guests/${guest.slug}`}>
              <h2 className="mt-1 text-subhead font-bold hover:text-primary transition-colors">
                {guest.name}
              </h2>
            </Link>

            {guest.bio && (
              <p className="mt-3 text-muted-foreground line-clamp-3">
                {guest.bio}
              </p>
            )}

            {/* Testimonial Message */}
            {testimonial && (
              <div className="mt-4 rounded-lg bg-muted/50 p-4 relative">
                <div className="absolute -top-2 start-4 text-heading text-primary/30">&ldquo;</div>
                <p className="text-caption italic text-foreground/90 ps-4">
                  {testimonial}
                </p>
                <p className="mt-2 text-micro text-muted-foreground ps-4">
                  — {guest.name}، بعد تسجيل الحلقة
                </p>
              </div>
            )}

            {/* View Full Profile Link */}
            <Link
              href={`/guests/${guest.slug}`}
              className="mt-4 inline-block text-caption text-primary hover:underline"
            >
              شوف الملف الكامل →
            </Link>
          </div>
        </div>

        {/* Testimonial Video */}
        {videoId && (
          <div className="mt-6 border-t pt-6">
            <h3 className="mb-3 text-caption font-medium text-muted-foreground">
              كلمة من الضيف
            </h3>
            <div className="relative aspect-video max-w-md overflow-hidden rounded-2xl bg-muted" style={{ contain: "layout paint", transform: "translateZ(0)" }}>
              {showVideo ? (
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1`}
                  title={`كلمة ${guest.name}`}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowVideo(true)}
                  aria-label={`تشغيل: كلمة ${guest.name}`}
                  className="group absolute inset-0 flex items-center justify-center"
                >
                  {/* Through the shared renderer, so this frame gets the same
                      maxres→hq fallback as every other thumbnail. The dimming
                      layer and the white «شوف كلمة الضيف» caption that used to
                      sit on top are gone: the heading above the frame already
                      says what this is, and the caption landed on whatever the
                      video's own title card happens to be. */}
                  <EpisodeThumb
                    ep={{
                      title: `كلمة ${guest.name}`,
                      thumbnail_url: null,
                      youtube_url: testimonialVideoUrl as string,
                    }}
                    sizes="(max-width: 768px) 100vw, 448px"
                  />
                  <PlayBadge className="relative group-hover:scale-105" />
                </button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
