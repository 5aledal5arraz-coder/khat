"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { GuestAvatar } from "@/components/guests/guest-avatar"
import { Play, Instagram, Linkedin, Globe, Youtube } from "lucide-react"
import { XIcon } from "@/components/icons/x-icon"
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
  linkedin: Linkedin,
  youtube: Youtube,
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
            <Link href={`/guests/${guest.slug}`} onClick={handleGuestClick}>
              <GuestAvatar
                name={guest.name}
                slug={guest.slug}
                photoUrl={guest.photo_url}
                size="2xl"
                showBorder
                showGlow
                className="transition-transform hover:scale-105"
              />
            </Link>

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
            <p className="text-sm text-muted-foreground">ضيف الحلقة</p>
            <Link href={`/guests/${guest.slug}`}>
              <h2 className="mt-1 text-2xl font-bold hover:text-primary transition-colors">
                {guest.name}
              </h2>
            </Link>

            {guest.bio && (
              <p className="mt-3 text-muted-foreground leading-relaxed line-clamp-3">
                {guest.bio}
              </p>
            )}

            {/* Testimonial Message */}
            {testimonial && (
              <div className="mt-4 rounded-lg bg-muted/50 p-4 relative">
                <div className="absolute -top-2 start-4 text-4xl text-primary/30">&ldquo;</div>
                <p className="text-sm italic text-foreground/90 ps-4">
                  {testimonial}
                </p>
                <p className="mt-2 text-xs text-muted-foreground ps-4">
                  — {guest.name}، بعد تسجيل الحلقة
                </p>
              </div>
            )}

            {/* View Full Profile Link */}
            <Link
              href={`/guests/${guest.slug}`}
              className="mt-4 inline-block text-sm text-primary hover:underline"
            >
              عرض الملف الكامل →
            </Link>
          </div>
        </div>

        {/* Testimonial Video */}
        {videoId && (
          <div className="mt-6 border-t pt-6">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              كلمة من الضيف
            </h3>
            <div className="relative aspect-video max-w-md overflow-hidden rounded-xl bg-muted" style={{ contain: "layout paint", transform: "translateZ(0)" }}>
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
                  onClick={() => setShowVideo(true)}
                  className="group absolute inset-0 flex flex-col items-center justify-center gap-2"
                >
                  {/* Thumbnail */}
                  <img
                    src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                    alt={`كلمة ${guest.name}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors" />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="h-6 w-6 ms-1" fill="currentColor" />
                  </div>
                  <span className="relative text-sm font-medium text-white">
                    شاهد كلمة الضيف
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
