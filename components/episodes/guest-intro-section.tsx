"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { GuestCard } from "@/components/guests/guest-card"
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
import { VoiceNote } from "./voice-note"

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
  testimonialAudioUrl?: string | null
  testimonialAudioDuration?: number | null
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

export function GuestIntroSection({
  guest,
  testimonial,
  testimonialVideoUrl,
  testimonialAudioUrl,
  testimonialAudioDuration,
}: GuestIntroSectionProps) {
  const [showVideo, setShowVideo] = useState(false)
  const [guestTracked, setGuestTracked] = useState(false)
  const externalLinks = guest.external_links || {}
  const videoId = testimonialVideoUrl ? getYouTubeId(testimonialVideoUrl) : null

  const handleGuestClick = () => {
    if (!guestTracked) {
      setGuestTracked(true)
    }
  }

  const hasExtras =
    Object.keys(externalLinks).length > 0 ||
    Boolean(testimonial) ||
    Boolean(testimonialAudioUrl) ||
    Boolean(videoId)

  return (
    // ONE OBJECT, NOT TWO STACKED ONES.
    //
    // Khaled: «كرت تعريف الضيف يفصل اسم وصورة الضيف عن حساباته ورسالته». It did
    // — the cover card sat in its own rounded box and everything else in a
    // second bordered card under a 16px gap, so a guest read as two unrelated
    // widgets that happened to be about the same person.
    //
    // They are now one surface: the gap is gone, the card's bottom corners are
    // squared off and the panel below carries the rounded bottom, so the seam
    // between them is a fold in one card rather than the edge of another. When
    // there are no extras the card keeps its own four corners.
    <div className="overflow-hidden rounded-2xl">
      <div onClick={handleGuestClick}>
        <GuestCard guest={guest} className={hasExtras ? "rounded-b-none" : undefined} />
      </div>

      {hasExtras && (
        <Card className="rounded-none border-t-0 shadow-none">
          <CardContent className="p-6">
            {Object.keys(externalLinks).length > 0 && (
              // «حسابات الضيف» — labelled, because a bare row of marks under a
              // portrait reads as OUR platforms, which is what the footer's row
              // is. These are his.
              <div>
                <p className="text-micro font-semibold text-muted-foreground">
                  تلقاه على
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(externalLinks).map(([platform, url]) => {
                    const Icon = socialIcons[platform.toLowerCase()] || Globe
                    return (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        // A ROUNDED SQUARE, like every other tile on this page.
                        // These were circles — the one shape the identity does
                        // not own, sitting directly under a card built from
                        // straight edges.
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                        title={platform}
                      >
                        <Icon className="h-4 w-4" />
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Testimonial — written, spoken, or both.
                The three forms are independent: a guest who sends a voice note
                and never writes anything still gets a card, which is the whole
                point of adding audio. The opening quote mark and the italic
                belong to the WRITTEN form only — set over a player they would
                be decorating a control. */}
            {(testimonial || testimonialAudioUrl) && (
              // The orange rule from the card, repeated: the same device marks
              // the guest's name above and the guest's words here, which is
              // what ties the two halves of the object together.
              <div className="relative mt-6 border-s-[3px] border-accent bg-secondary/40 p-4 ps-5">
                {testimonial && (
                  <>
                    <div className="absolute -top-2 start-4 text-heading text-primary/30">&ldquo;</div>
                    <p className="text-caption italic text-foreground/90 ps-4">
                      {testimonial}
                    </p>
                  </>
                )}

                {testimonialAudioUrl && (
                  <VoiceNote
                    src={testimonialAudioUrl}
                    durationSeconds={testimonialAudioDuration}
                    label={`صوت ${guest.name}`}
                    className={testimonial ? "mt-3" : undefined}
                  />
                )}

                <p className="mt-2 text-micro text-muted-foreground ps-4">
                  — {guest.name}، بعد تسجيل الحلقة
                </p>
              </div>
            )}

            {/* No «شوف الملف الكامل» here any more — the card above IS the link
                to the profile, and printing it twice on one screen made the
                second one look like it went somewhere else. */}

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
      )}
    </div>
  )
}
