import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getGuestBySlug } from "@/lib/queries/episodes"
import { resolveDefaultOgImage } from "@/lib/seo/og"
import { getGuestPublicKnowledge } from "@/lib/guests/knowledge"
import { getTeaserForGuest } from "@/lib/teaser"
import { TeaserInline } from "@/components/teaser/teaser-inline"
import { EpisodePosterCard } from "@/components/episodes/episode-poster-card"
import { QuoteCard } from "@/components/quotes/quote-card"
import { GuestPortrait } from "@/components/media/guest-portrait"
import { AtharCard } from "@/components/guests/athar-card"
import { Linkedin, Globe, Instagram, Youtube, Mail } from "lucide-react"
import { XIcon } from "@/components/icons/x-icon"
import { TikTokIcon } from "@/components/icons/tiktok-icon"
import { SnapchatIcon } from "@/components/icons/snapchat-icon"
import { FacebookIcon } from "@/components/icons/facebook-icon"
import { ThreadsIcon } from "@/components/icons/threads-icon"
import { TelegramIcon } from "@/components/icons/telegram-icon"
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon"
import { SpotifyIcon } from "@/components/icons/spotify-icon"
import { SoundCloudIcon } from "@/components/icons/soundcloud-icon"
import { TwitchIcon } from "@/components/icons/twitch-icon"
import { DiscordIcon } from "@/components/icons/discord-icon"
import { PinterestIcon } from "@/components/icons/pinterest-icon"

// Admin panel (DB) is the single source of truth — render on every request.
export const dynamic = "force-dynamic"

interface GuestPageProps {
  params: Promise<{ slug: string }>
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

export async function generateMetadata({ params }: GuestPageProps): Promise<Metadata> {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const guest = await getGuestBySlug(decodedSlug)

  if (!guest) {
    // Stops metadata generation for a slug that has no guest, so the page never
    // advertises a title/canonical for something that doesn't exist.
    //
    // It is NOT what produces the 404 status — that claim used to be written
    // here and it was wrong. Measured on a production build: a page whose ONLY
    // notFound() is in `generateMetadata` still answers 200. The status comes
    // from the body's notFound() escaping to the top-level render, which is why
    // the fix was moving the `loading.tsx` Suspense boundary out of the way
    // (see app/(home)/loading.tsx).
    notFound()
  }

  return {
    title: guest.name,
    description: guest.bio || `تعرف على ${guest.name} وحلقاته في بودكاست خط`,
    alternates: { canonical: `https://khatpodcast.com/guests/${guest.slug}` },
    openGraph: {
      title: guest.name,
      description: guest.bio || undefined,
      type: "profile",
      // Declaring `openGraph` replaces the root layout's block, so a guest with
      // no photo used to ship a card with no image at all. Fall back to the
      // site card instead of dropping it.
      images: guest.photo_url ? [guest.photo_url] : [await resolveDefaultOgImage()],
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

  // Synthesized cross-episode knowledge (Studio redesign, Goal 2). Best-effort:
  // the page degrades to the plain bio when no knowledge has been generated.
  const knowledge = await getGuestPublicKnowledge(guest.id).catch(() => null)
  const teaser = await getTeaserForGuest(guest.id).catch(() => null)
  const displayBio = knowledge?.bio || guest.bio
  const signatureTopics = knowledge?.signature_topics?.filter(Boolean) ?? []
  const themes = knowledge?.themes?.filter(Boolean) ?? []
  const knowledgeQuotes = knowledge?.notable_quotes?.filter((q) => q?.text) ?? []

  const externalLinks = guest.external_links || {}

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: guest.name,
    description: displayBio || undefined,
    image: guest.photo_url || undefined,
    url: `https://khatpodcast.com/guests/${guest.slug}`,
    ...(knowledge?.headline ? { jobTitle: knowledge.headline } : {}),
    ...(knowledge?.signature_topics?.length ? { knowsAbout: knowledge.signature_topics } : {}),
    sameAs: Object.values(externalLinks).filter(
      (url) => typeof url === "string" && url.startsWith("http")
    ),
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-4xl">
        {/* Guest Header */}
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-start">
          {/* NO PLACEHOLDER HERE — the name is the hero when there is no photo.
              What stood here was a 144px circle (about 265px on a phone, ~40%
              of the viewport) printing two initials that were wrong for most
              Arabic names — «الدكتور الحارث المزيدي» rendered «اا» live. An
              empty box that size does not "hold the layout", it dominates the
              page to say nothing. All three guests in the database have
              `photo_url = NULL` today, so this is the branch that renders. */}
          {guest.photo_url ? (
            <GuestPortrait
              name={guest.name}
              photoUrl={guest.photo_url}
              variant="page"
            />
          ) : null}
          <div className="flex-1">
            {/* `sm:text-title` matches the episode title (episode-hero.tsx).
                Without it this h1 was a flat 32px while an episode title
                reached 44px — so a guest's own page ranked their name BELOW
                the title of an episode, on the one page most likely to be
                sent to that guest. */}
            <h1 className="text-heading font-bold sm:text-title">{guest.name}</h1>
            {knowledge?.headline && (
              <p className="mt-1.5 text-body font-medium text-primary">{knowledge.headline}</p>
            )}
            {displayBio && (
              <p className="mt-3 max-w-measure text-muted-foreground">
                {displayBio}
              </p>
            )}
            {signatureTopics.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                {signatureTopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-micro font-medium text-primary"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Teaser — the guest's upcoming/aired episode teaser (compact block,
            Sara note 4/5). */}
        {teaser && (
          <div className="mt-10 space-y-3">
            <h2 className="text-lead font-semibold">التيزر</h2>
            <TeaserInline teaser={teaser} />
          </div>
        )}

        {/* Cross-episode knowledge (synthesized) */}
        {(themes.length > 0 || knowledgeQuotes.length > 0 || knowledge?.arc) && (
          <div className="mt-10 space-y-6 rounded-2xl border bg-card/50 p-6">
            <h2 className="text-lead font-semibold">معرفة عن الضيف عبر حلقاته</h2>

            {knowledge?.arc && (
              <p className="max-w-measure text-muted-foreground">{knowledge.arc}</p>
            )}

            {themes.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-caption font-medium text-foreground">محاور متكررة</h3>
                <div className="flex flex-wrap gap-2">
                  {themes.map((theme) => (
                    <span
                      key={theme}
                      className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-micro text-muted-foreground"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {knowledgeQuotes.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-caption font-medium text-foreground">أقوى ما قال</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {knowledgeQuotes.map((q, i) => (
                    <blockquote
                      key={i}
                      className="rounded-xl border-s-2 border-primary/40 bg-background/60 p-4"
                    >
                      <p className="text-caption">&ldquo;{q.text}&rdquo;</p>
                      {q.context && (
                        <footer className="mt-2 text-micro text-muted-foreground">{q.context}</footer>
                      )}
                    </blockquote>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* أثر الضيف — Athar */}
        {guest.testimonial && (
          <div className="mt-10">
            <AtharCard
              text={guest.testimonial}
              guestName={guest.name}
              episodeDate={guest.episodes[0]?.release_date}
            />
          </div>
        )}

        {/* External Links */}
        {Object.keys(externalLinks).length > 0 && (
          <div className="mt-8 flex flex-wrap justify-center gap-2 sm:justify-start">
            {Object.entries(externalLinks).map(([platform, url]) => {
              const Icon = socialIcons[platform.toLowerCase()] || Globe
              return (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-1 text-caption font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon className="h-4 w-4" />
                  <span className="capitalize">{platform}</span>
                </a>
              )
            })}
          </div>
        )}

        {/* Episodes */}
        {guest.episodes.length > 0 && (
          <div className="mt-12 space-y-4">
            <h2 className="text-lead font-semibold">
              الحلقات ({guest.episodes.length})
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {guest.episodes.map((episode) => (
                <EpisodePosterCard key={episode.id} ep={episode} showDate />
              ))}
            </div>
          </div>
        )}

        {/* Quotes */}
        {guest.quotes.length > 0 && (
          <div className="mt-12 space-y-4">
            <h2 className="text-lead font-semibold">اقتباسات</h2>
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
