import Link from "next/link"
import Image from "next/image"
import { getLatestEpisode, getEpisodes, getGuests } from "@/lib/supabase/queries"
import { NewsletterForm } from "@/components/forms/newsletter-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EpisodeActions } from "@/components/episodes/episode-actions"
import { QuoteActions } from "@/components/quotes/quote-actions"
import {
  Play,
  ArrowLeft,
  Clock,
  Quote,
  Compass,
  User,
  ShoppingBag,
} from "lucide-react"
import { formatDuration, formatDate } from "@/lib/utils"
import { mockQuotes } from "@/lib/mock-data"

function getYouTubeId(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/)
  return match ? match[1] : ''
}

// Feed Card Components
function HeroEpisodeCard({ episode }: { episode: { title: string; slug: string; youtube_url: string; release_date: string; duration_minutes: number; summary?: string | null; guest?: { name: string } | null } }) {
  return (
    <Link href={`/episodes/${episode.slug}`}>
      <Card className="group overflow-hidden border-primary/20 transition-all hover:border-primary/50 hover:shadow-xl">
        <div className="relative aspect-video overflow-hidden">
          <Image
            src={`https://img.youtube.com/vi/${getYouTubeId(episode.youtube_url)}/maxresdefault.jpg`}
            alt={episode.title}
            fill
            className="object-cover transition-transform group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <Badge className="absolute start-4 top-4 bg-primary text-primary-foreground">
            أحدث حلقة
          </Badge>
          <div className="absolute bottom-4 start-4 end-4">
            <h2 className="text-xl font-bold text-white md:text-2xl">
              {episode.title}
            </h2>
            {episode.guest && (
              <p className="mt-1 text-sm text-white/80">مع {episode.guest.name}</p>
            )}
            <div className="mt-3 flex items-center gap-4 text-sm text-white/70">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDuration(episode.duration_minutes)}
              </span>
              <span>{formatDate(episode.release_date)}</span>
            </div>
          </div>
          <div className="absolute bottom-4 end-4 flex gap-2">
            <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full">
              <Play className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </Card>
    </Link>
  )
}

function EpisodeFeedCard({ episode }: { episode: { id?: string; title: string; slug: string; youtube_url: string; release_date: string; duration_minutes: number; guest?: { name: string; slug: string } | null } }) {
  return (
    <Link href={`/episodes/${episode.slug}`}>
      <Card className="group overflow-hidden transition-all hover:border-primary/50">
        <div className="flex gap-4 p-4">
          <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-lg bg-muted">
            <Image
              src={`https://img.youtube.com/vi/${getYouTubeId(episode.youtube_url)}/mqdefault.jpg`}
              alt={episode.title}
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
              <Play className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-between">
            <div>
              <h3 className="font-semibold line-clamp-2 group-hover:text-primary">
                {episode.title}
              </h3>
              {episode.guest && (
                <p className="mt-1 text-sm text-muted-foreground">
                  مع {episode.guest.name}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(episode.duration_minutes)}
              </span>
              <span>{formatDate(episode.release_date)}</span>
            </div>
          </div>
          <EpisodeActions
            episode={episode}
            className="flex flex-col justify-center gap-2"
          />
        </div>
      </Card>
    </Link>
  )
}

function QuoteFeedCard({ quote }: { quote: { id?: string; text: string; guest?: { name: string } | null; theme?: string | null } }) {
  return (
    <Card className="border-accent/30 bg-gradient-to-br from-accent/10 to-transparent">
      <CardContent className="p-6">
        <Quote className="h-8 w-8 text-accent/50" />
        <blockquote className="mt-4 text-lg leading-relaxed">
          "{quote.text}"
        </blockquote>
        {quote.guest && (
          <p className="mt-4 text-sm text-muted-foreground">— {quote.guest.name}</p>
        )}
        {quote.theme && (
          <Badge variant="outline" className="mt-3">
            {quote.theme}
          </Badge>
        )}
        <QuoteActions
          quote={quote}
          className="mt-4 flex gap-2"
        />
      </CardContent>
    </Card>
  )
}

function StartHereFeedCard() {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
            <Compass className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">جديد على خط؟</h3>
            <p className="text-sm text-muted-foreground">اكتشف أفضل الحلقات للبدء</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Link href="/start-here?path=relationships">
            <div className="rounded-lg bg-secondary p-3 text-center transition-colors hover:bg-secondary/80">
              <span className="text-2xl">❤️</span>
              <p className="mt-1 text-xs">العلاقات</p>
            </div>
          </Link>
          <Link href="/start-here?path=self-growth">
            <div className="rounded-lg bg-secondary p-3 text-center transition-colors hover:bg-secondary/80">
              <span className="text-2xl">🌱</span>
              <p className="mt-1 text-xs">تطوير الذات</p>
            </div>
          </Link>
          <Link href="/start-here?path=meaning">
            <div className="rounded-lg bg-secondary p-3 text-center transition-colors hover:bg-secondary/80">
              <span className="text-2xl">✨</span>
              <p className="mt-1 text-xs">المعنى</p>
            </div>
          </Link>
        </div>
        <Link href="/start-here" className="mt-4 block">
          <Button variant="outline" className="w-full gap-2">
            اكتشف المزيد
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

function GuestSpotlightCard({ guest }: { guest: { name: string; slug: string; bio?: string | null } }) {
  return (
    <Link href={`/guests/${guest.slug}`}>
      <Card className="group transition-all hover:border-primary/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-2xl font-bold text-muted-foreground">
              {guest.name.charAt(0)}
            </div>
            <div className="flex-1">
              <Badge variant="secondary" className="mb-2">ضيف مميز</Badge>
              <h3 className="font-semibold group-hover:text-primary">{guest.name}</h3>
              {guest.bio && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {guest.bio}
                </p>
              )}
            </div>
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function StoreTeaserCard() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <ShoppingBag className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">متجر خط قريباً</h3>
          <p className="text-sm text-muted-foreground">منتجات مميزة تحمل هوية البودكاست</p>
        </div>
        <Link href="/store">
          <Button variant="outline" size="sm">
            أعلمني
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

function NewsletterFeedCard() {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold">انضم للنشرة البريدية</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          احصل على إشعارات بالحلقات الجديدة ومحتوى حصري
        </p>
        <div className="mt-4">
          <NewsletterForm />
        </div>
      </CardContent>
    </Card>
  )
}

export default async function HomePage() {
  const [latestEpisode, recentEpisodes, guests] = await Promise.all([
    getLatestEpisode(),
    getEpisodes({ limit: 6 }),
    getGuests({ limit: 4 }),
  ])

  // Build feed items
  const feedItems: { type: string; data?: unknown; key: string }[] = []

  // Hero episode
  if (latestEpisode) {
    feedItems.push({ type: "hero", data: latestEpisode, key: "hero" })
  }

  // Mix episodes with other cards
  const otherEpisodes = recentEpisodes.slice(1)

  // Episode 1
  if (otherEpisodes[0]) {
    feedItems.push({ type: "episode", data: otherEpisodes[0], key: `ep-${otherEpisodes[0].id}` })
  }

  // Quote
  if (mockQuotes[0]) {
    feedItems.push({ type: "quote", data: mockQuotes[0], key: "quote-1" })
  }

  // Episode 2
  if (otherEpisodes[1]) {
    feedItems.push({ type: "episode", data: otherEpisodes[1], key: `ep-${otherEpisodes[1].id}` })
  }

  // Start Here
  feedItems.push({ type: "start-here", key: "start-here" })

  // Episode 3
  if (otherEpisodes[2]) {
    feedItems.push({ type: "episode", data: otherEpisodes[2], key: `ep-${otherEpisodes[2].id}` })
  }

  // Guest Spotlight
  if (guests[0]) {
    feedItems.push({ type: "guest", data: guests[0], key: `guest-${guests[0].id}` })
  }

  // Quote 2
  if (mockQuotes[1]) {
    feedItems.push({ type: "quote", data: mockQuotes[1], key: "quote-2" })
  }

  // Newsletter
  feedItems.push({ type: "newsletter", key: "newsletter" })

  // Episode 4
  if (otherEpisodes[3]) {
    feedItems.push({ type: "episode", data: otherEpisodes[3], key: `ep-${otherEpisodes[3].id}` })
  }

  // Store teaser
  feedItems.push({ type: "store", key: "store" })

  // Episode 5
  if (otherEpisodes[4]) {
    feedItems.push({ type: "episode", data: otherEpisodes[4], key: `ep-${otherEpisodes[4].id}` })
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Feed */}
      <div className="mx-auto max-w-2xl space-y-4">
        {feedItems.map((item) => {
          switch (item.type) {
            case "hero":
              return <HeroEpisodeCard key={item.key} episode={item.data as { title: string; slug: string; youtube_url: string; release_date: string; duration_minutes: number; summary?: string | null; guest?: { name: string } | null }} />
            case "episode":
              return <EpisodeFeedCard key={item.key} episode={item.data as { title: string; slug: string; youtube_url: string; release_date: string; duration_minutes: number; guest?: { name: string; slug: string } | null }} />
            case "quote":
              return <QuoteFeedCard key={item.key} quote={item.data as { text: string; guest?: { name: string } | null; theme?: string | null }} />
            case "start-here":
              return <StartHereFeedCard key={item.key} />
            case "guest":
              return <GuestSpotlightCard key={item.key} guest={item.data as { name: string; slug: string; bio?: string | null }} />
            case "store":
              return <StoreTeaserCard key={item.key} />
            case "newsletter":
              return <NewsletterFeedCard key={item.key} />
            default:
              return null
          }
        })}

        {/* Load More */}
        <div className="py-8 text-center">
          <Link href="/episodes">
            <Button variant="outline" size="lg" className="gap-2">
              استعرض جميع الحلقات
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
