import type { Metadata } from "next"
import { MuseumHero } from "@/components/museum/hero"
import { MuseumGallery } from "@/components/museum/gallery"
import { MuseumPhilosophyFeed } from "@/components/museum/philosophy-feed"
import { MuseumThinkers } from "@/components/museum/thinkers"
import { MuseumHost } from "@/components/museum/host"
import { MuseumPrestigiousInvolvement } from "@/components/museum/prestigious-involvement"
import {
  getCachedHomepageFeatured,
  getCachedHomepageThinkers,
  getCachedHomepagePartners,
} from "@/lib/cache"

export const metadata: Metadata = {
  title: "خط | بودكاست",
  description: "بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين.",
  alternates: { canonical: "https://khatpodcast.com" },
  openGraph: {
    title: "خط | بودكاست",
    description: "بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين.",
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
      "@type": "WebSite",
      "@id": "https://khatpodcast.com/#website",
      url: "https://khatpodcast.com",
      name: "خط | بودكاست",
      description: "بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين.",
      inLanguage: "ar",
      publisher: { "@id": "https://khatpodcast.com/#organization" },
    },
    {
      "@type": "PodcastSeries",
      "@id": "https://khatpodcast.com/#podcast",
      name: "خط",
      url: "https://khatpodcast.com",
      inLanguage: "ar",
      description: "بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين.",
      publisher: { "@id": "https://khatpodcast.com/#organization" },
    },
  ],
}

export default async function HomePage() {
  const [featuredEpisodes, featuredThinkers, homepagePartners] = await Promise.all([
    getCachedHomepageFeatured(),
    getCachedHomepageThinkers(),
    getCachedHomepagePartners(),
  ])

  return (
    <div className="museum-cinematic-scroll">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MuseumHero />
      <MuseumGallery episodes={featuredEpisodes} />
      <MuseumPhilosophyFeed />
      <MuseumThinkers thinkers={featuredThinkers} />
      <MuseumHost />
      <MuseumPrestigiousInvolvement partners={homepagePartners} />
    </div>
  )
}
