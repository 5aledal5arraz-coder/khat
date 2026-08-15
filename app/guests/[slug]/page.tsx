import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getGuestBySlug } from "@/lib/queries/episodes"
import { resolveDefaultOgImage } from "@/lib/seo/og"
import { getGuestPublicKnowledge } from "@/lib/guests/knowledge"
import { getTeaserForGuest } from "@/lib/teaser"
import { TeaserInline } from "@/components/teaser/teaser-inline"
import { EpisodePosterCard } from "@/components/episodes/episode-poster-card"
import { QuoteCard } from "@/components/quotes/quote-card"
import { GuestCard } from "@/components/guests/guest-card"
import { AtharCard } from "@/components/guests/athar-card"
import { UpcomingEpisodeGuestCard } from "@/components/guests/upcoming-episode-card"
import { listPublishedUpcomingForGuest } from "@/lib/queries/upcoming-episodes"
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
  // The one thing on this page that is NEWS. `upcoming_episodes` is an
  // ALLOW-list table (see its schema comment) — nothing surfaces a row until a
  // reader is written on purpose, and this is that reader for the guest page.
  // The `published` filter lives in the SQL inside the query, not here.
  const upcomingEpisodes = await listPublishedUpcomingForGuest(guest.id).catch(() => [])
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
        {/* GUEST HEADER — the same card the episode page and the guests list
            use, so a guest looks like the same person wherever they appear.
            What stood here was a 200px rounded square beside a heading; before
            that, a 144px circle printing two Arabic initials that were wrong
            for most of our names («الدكتور الحارث المزيدي» rendered «اا» live).

            Three things are different from every other placement, and each is a
            prop rather than a second component:
             · `as="h1"` — this is the page's own heading, not an item in a list
             · `action={null}` — «شوف الملف الكامل» would link to this page from
               this page
             · no `href`, because `slug` is not passed through: a card that
               links to where you already are is a dead control */}
        <GuestCard
          guest={{ name: guest.name, bio: displayBio, photo_url: guest.photo_url }}
          eyebrow="ضيف خط"
          as="h1"
          action={null}
        />

        {(knowledge?.headline || signatureTopics.length > 0) && (
          <div className="mt-6">
            {knowledge?.headline && (
              <p className="text-body font-medium text-primary">{knowledge.headline}</p>
            )}
            {signatureTopics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
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
        )}

        {/* حلقة قادمة — ABOVE the archive, on purpose.
            The upcoming episode is the news; the published ones are the
            record. Nothing renders when there is no published page: no
            heading, no empty frame — the same rule every other block on this
            page follows. */}
        {upcomingEpisodes.length > 0 && (
          <div className="mt-10 grid gap-4">
            {upcomingEpisodes.map((upcoming) => (
              <UpcomingEpisodeGuestCard key={upcoming.id} upcoming={upcoming} />
            ))}
          </div>
        )}

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
