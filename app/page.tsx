import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Play, Sparkles } from "lucide-react"
import { getCachedPublicEpisodes } from "@/lib/cache"
import type { Episode } from "@/types/database"
import {
  EpisodePosterCard,
  EpisodeThumb,
  episodeDurationLabel,
} from "@/components/episodes/episode-poster-card"
import { NewsletterSignup } from "@/components/forms/newsletter-signup"

export const metadata: Metadata = {
  title: "خط | بودكاست",
  description:
    "بودكاست عربي يستكشف القصص والأفكار من خلال حوارات صادقة مع عقول ملهمة. حوارات تستحق أن تبقى.",
  alternates: { canonical: "https://khatpodcast.com" },
  openGraph: {
    title: "خط | بودكاست",
    description: "حوارات عميقة وأفكار تبقى — بودكاست خط.",
    url: "https://khatpodcast.com",
    type: "website",
    locale: "ar_SA",
    siteName: "خط",
    images: [{ url: "/logo-wide.jpg", width: 2560, height: 424, alt: "بودكاست خط" }],
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://khatpodcast.com/#organization",
      name: "خط",
      alternateName: "Khat Podcast",
      url: "https://khatpodcast.com",
      logo: "https://khatpodcast.com/logo.png",
      sameAs: [
        "https://www.youtube.com/@khatpodcast",
        "https://www.instagram.com/khatpodcast",
        "https://twitter.com/khatpodcast",
      ],
    },
    {
      "@type": "PodcastSeries",
      "@id": "https://khatpodcast.com/#podcast",
      name: "خط",
      url: "https://khatpodcast.com",
      inLanguage: "ar",
      description:
        "بودكاست عربي يستكشف القصص والأفكار من خلال حوارات صادقة مع عقول ملهمة.",
    },
  ],
}

export default async function HomePage() {
  const episodes = await getCachedPublicEpisodes().catch(() => [] as Episode[])
  const featured = episodes[0] ?? null
  const grid = episodes.slice(1, 7)

  return (
    <div className="overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="relative isolate flex min-h-[88vh] items-center justify-center px-6 text-center">
        {/* ambient brand light */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute start-1/2 top-[-10%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(252_48%_40%/0.14),transparent)]" />
          <div className="absolute end-[12%] top-[22%] h-72 w-72 rounded-full bg-[radial-gradient(closest-side,hsl(22_90%_53%/0.14),transparent)]" />
        </div>

        <div className="mx-auto max-w-4xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-semibold tracking-wide text-muted-foreground shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            بودكاست خط
          </span>

          <h1 className="mt-7 text-balance text-5xl font-extrabold leading-[1.08] tracking-tight text-foreground sm:text-6xl lg:text-[5.2rem]">
            حوارات تستحق
            <br />
            أن تبقى<span className="text-accent">.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            بودكاست عربي يستكشف القصص والأفكار من خلال حوارات صادقة مع عقولٍ
            ملهمة — عباراتٌ تستحق أن تضع تحتها خط.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/episodes"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30"
            >
              استكشف الحلقات
              <ArrowLeft className="h-4 w-4" />
            </Link>
            {featured ? (
              <Link
                href={`/episodes/${featured.slug}`}
                className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card px-7 text-[15px] font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                <Play className="h-4 w-4 fill-current text-accent" />
                شاهد الأحدث
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* ──────────────────── Featured episode ──────────────────── */}
      {featured ? (
        <section className="px-6 pb-8">
          <div className="mx-auto max-w-6xl">
            <SectionLabel>الحلقة الأحدث</SectionLabel>
            <Link
              href={`/episodes/${featured.slug}`}
              className="group mt-5 grid items-center gap-8 rounded-[28px] border border-border bg-card p-4 shadow-[0_2px_8px_rgba(40,30,90,0.04),0_24px_60px_-30px_rgba(40,30,90,0.28)] transition-all hover:shadow-[0_2px_8px_rgba(40,30,90,0.05),0_36px_80px_-30px_rgba(40,30,90,0.35)] sm:p-5 lg:grid-cols-[1.5fr_1fr]"
            >
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-secondary">
                <EpisodeThumb ep={featured} priority className="transition-transform duration-700 group-hover:scale-[1.03]" />
                <span className="absolute bottom-3 start-3 inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur">
                  <Play className="h-3.5 w-3.5 fill-current text-accent" />
                  شاهد الآن
                </span>
              </div>
              <div className="px-2 pb-2 lg:px-4">
                {featured.guest?.name ? (
                  <span className="text-[13px] font-semibold text-accent">{featured.guest.name}</span>
                ) : null}
                <h3 className="mt-2 text-pretty text-2xl font-bold leading-snug tracking-tight text-foreground lg:text-3xl">
                  {featured.title}
                </h3>
                {featured.summary ? (
                  <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-muted-foreground">
                    {featured.summary}
                  </p>
                ) : null}
                <div className="mt-5 flex items-center gap-3 text-[13px] text-muted-foreground">
                  {episodeDurationLabel(featured.duration_minutes) ? (
                    <span>{episodeDurationLabel(featured.duration_minutes)}</span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 font-semibold text-primary transition-all group-hover:gap-2">
                    استمع للحلقة <ArrowLeft className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </section>
      ) : null}

      {/* ──────────────────── Episodes grid ──────────────────── */}
      {grid.length > 0 ? (
        <section className="px-6 py-12">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between">
              <SectionLabel>أحدث الحلقات</SectionLabel>
              <Link
                href="/episodes"
                className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary transition-all hover:gap-2"
              >
                كل الحلقات <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {grid.map((ep) => (
                <EpisodePosterCard key={ep.id} ep={ep} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ──────────────────── Newsletter ──────────────────── */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <NewsletterSignup variant="hero" />
        </div>
      </section>

      {/* ──────────────────── Statement ──────────────────── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-balance text-3xl font-bold leading-[1.4] tracking-tight text-foreground sm:text-4xl lg:text-[2.85rem]">
            في عالمٍ يتدفّق فيه الكلام بلا توقّف،
            <br className="hidden sm:block" />{" "}
            <span className="text-muted-foreground">اخترنا أن نتوقّف… </span>
            <span className="text-accent">لننصت</span>.
          </p>
        </div>
      </section>

      {/* ──────────────────── Join CTA ──────────────────── */}
      <section className="px-6 pb-24">
        <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2">
          <CtaCard
            href="/guest"
            eyebrow="انضم إلينا"
            title="كن ضيفاً على خط"
            body="لديك قصة أو فكرة تستحق أن تُروى؟ نحن نبحث عن العقول التي تطرح الأسئلة التي تغيّر طريقة التفكير."
          />
          <CtaCard
            href="/sponsor"
            eyebrow="دعم الإرث"
            title="كن شريكاً"
            body="من يدعم الأفكار يرسم ملامح مستقبل الفكر. لنبنِ معاً مساحةً للحوارات التي تستحق أن تبقى."
            accent
          />
        </div>
      </section>
    </div>
  )
}

// ─── pieces ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h2>
  )
}

function CtaCard({
  href,
  eyebrow,
  title,
  body,
  accent,
}: {
  href: string
  eyebrow: string
  title: string
  body: string
  accent?: boolean
}) {
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-[26px] p-8 transition-all hover:-translate-y-1 sm:p-10 ${
        accent
          ? "bg-primary text-primary-foreground shadow-xl shadow-primary/25"
          : "border border-border bg-card text-foreground shadow-sm hover:shadow-lg"
      }`}
    >
      <span
        className={`text-[12px] font-bold uppercase tracking-[0.16em] ${
          accent ? "text-primary-foreground/70" : "text-accent"
        }`}
      >
        {eyebrow}
      </span>
      <h3 className="mt-3 text-2xl font-bold tracking-tight sm:text-[26px]">{title}</h3>
      <p
        className={`mt-3 text-[15px] leading-relaxed ${
          accent ? "text-primary-foreground/85" : "text-muted-foreground"
        }`}
      >
        {body}
      </p>
      <span className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-semibold transition-all group-hover:gap-3">
        ابدأ الآن <ArrowLeft className="h-4 w-4" />
      </span>
    </Link>
  )
}
