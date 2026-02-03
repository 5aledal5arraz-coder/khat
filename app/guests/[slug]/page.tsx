import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getGuestBySlug } from "@/lib/supabase/queries"
import { EpisodeCard } from "@/components/episodes/episode-card"
import { QuoteCard } from "@/components/quotes/quote-card"
import { GuestAvatar } from "@/components/guests/guest-avatar"
import { Linkedin, Globe, Instagram } from "lucide-react"
import { XIcon } from "@/components/icons/x-icon"

interface GuestPageProps {
  params: Promise<{ slug: string }>
}

type IconComponent = React.ComponentType<{ className?: string }>

const socialIcons: Record<string, IconComponent> = {
  twitter: XIcon,
  x: XIcon,
  linkedin: Linkedin,
  instagram: Instagram,
  website: Globe,
}

export async function generateMetadata({ params }: GuestPageProps): Promise<Metadata> {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const guest = await getGuestBySlug(decodedSlug)

  if (!guest) {
    return { title: "الضيف غير موجود" }
  }

  return {
    title: guest.name,
    description: guest.bio || `تعرف على ${guest.name} وحلقاته في بودكاست خط`,
    openGraph: {
      title: guest.name,
      description: guest.bio || undefined,
      type: "profile",
      images: guest.photo_url ? [guest.photo_url] : undefined,
    },
  }
}

export default async function GuestPage({ params }: GuestPageProps) {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const guest = await getGuestBySlug(decodedSlug)

  if (!guest) {
    notFound()
  }

  const externalLinks = guest.external_links || {}

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl">
        {/* Guest Header */}
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-start">
          <GuestAvatar
            name={guest.name}
            slug={guest.slug}
            photoUrl={guest.photo_url}
            size="2xl"
            showBorder
            showGlow
          />
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{guest.name}</h1>
            {guest.bio && (
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {guest.bio}
              </p>
            )}

            {/* External Links */}
            {Object.keys(externalLinks).length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                {Object.entries(externalLinks).map(([platform, url]) => {
                  const Icon = socialIcons[platform.toLowerCase()] || Globe
                  return (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-1 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="capitalize">{platform}</span>
                    </a>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Episodes */}
        {guest.episodes.length > 0 && (
          <div className="mt-12 space-y-4">
            <h2 className="text-xl font-semibold">
              الحلقات ({guest.episodes.length})
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {guest.episodes.map((episode) => (
                <EpisodeCard key={episode.id} episode={episode} />
              ))}
            </div>
          </div>
        )}

        {/* Quotes */}
        {guest.quotes.length > 0 && (
          <div className="mt-12 space-y-4">
            <h2 className="text-xl font-semibold">اقتباسات</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {guest.quotes.map((quote) => (
                <QuoteCard key={quote.id} quote={{ ...quote, guest }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
