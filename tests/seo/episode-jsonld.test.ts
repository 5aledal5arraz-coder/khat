/**
 * P7 — Studio redesign: episode JSON-LD graph builder.
 *
 * The knowledge-hub page's structured data drives rich results, so the graph
 * shape (PodcastEpisode + VideoObject + Person + Breadcrumb + FAQ + topics)
 * must be stable and only include nodes when their data is present.
 */

import { describe, expect, it } from "vitest"
import { buildEpisodeJsonLd } from "@/lib/seo/episode-jsonld"

function types(graph: Record<string, unknown>): string[] {
  const g = (graph["@graph"] as Array<{ "@type": string }>) ?? []
  return g.map((n) => n["@type"])
}

const base = {
  title: "حلقة تجريبية",
  slug: "tajriba",
  releaseDate: "2026-06-01",
}

describe("buildEpisodeJsonLd", () => {
  it("emits PodcastEpisode + Breadcrumb for a minimal episode", () => {
    const g = buildEpisodeJsonLd(base)
    expect(g["@context"]).toBe("https://schema.org")
    const t = types(g)
    expect(t).toContain("PodcastEpisode")
    expect(t).toContain("BreadcrumbList")
    // no media / person / faq nodes without data
    expect(t).not.toContain("VideoObject")
    expect(t).not.toContain("Person")
    expect(t).not.toContain("FAQPage")
  })

  it("adds VideoObject + Person + topics + FAQ when present", () => {
    const g = buildEpisodeJsonLd({
      ...base,
      youtubeVideoId: "abc123",
      guestName: "ضيف",
      guestSameAs: ["https://x.com/guest"],
      topics: ["الذكاء الاصطناعي", "الفلسفة"],
      faq: ["ما معنى الوعي؟"],
    })
    const t = types(g)
    expect(t).toContain("VideoObject")
    expect(t).toContain("Person")
    expect(t).toContain("FAQPage")

    const episode = (g["@graph"] as Array<Record<string, unknown>>).find((n) => n["@type"] === "PodcastEpisode")!
    expect(episode.keywords).toBe("الذكاء الاصطناعي, الفلسفة")
    expect(Array.isArray(episode.about)).toBe(true)
    expect((episode.actor as { name: string }).name).toBe("ضيف")

    const faq = (g["@graph"] as Array<Record<string, unknown>>).find((n) => n["@type"] === "FAQPage")!
    expect((faq.mainEntity as unknown[]).length).toBe(1)
  })

  it("adds AudioObject only when audioUrl is present", () => {
    expect(types(buildEpisodeJsonLd({ ...base, audioUrl: "https://cdn/x.mp3" }))).toContain("AudioObject")
    expect(types(buildEpisodeJsonLd(base))).not.toContain("AudioObject")
  })

  it("filters empty FAQ entries (no FAQPage when all blank)", () => {
    const g = buildEpisodeJsonLd({ ...base, faq: ["", "  "] })
    expect(types(g)).not.toContain("FAQPage")
  })
})
