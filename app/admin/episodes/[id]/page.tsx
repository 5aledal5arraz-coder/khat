import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Brain } from "lucide-react"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodes as episodesTable } from "@/lib/db/schema/episodes"
import { getEpisodes } from "@/lib/queries/episodes"
import { getEpisodeOverrides } from "@/lib/episodes/overrides"
import { getAllGuests } from "@/lib/admin/queries"
import { getQuotesConfig } from "@/lib/episodes/quotes"
import { getYoutubePackConfig } from "@/lib/youtube-pack"
import { getEpisodeEnrichment } from "@/lib/episodes/enrichments"
import { getActivePartners } from "@/lib/queries/partnerships"
import { getEpisodeSponsor } from "@/lib/queries/episode-sponsors"
import { getHiddenEpisodeIds } from "../actions"
import { EpisodeDetail } from "./episode-detail"

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ legacy?: string }>
}

export default async function EpisodeDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const { legacy } = await searchParams

  // Phase B.2 — when this episode is linked to an EIR and the operator
  // hasn't explicitly opted into the legacy view (`?legacy=1`), redirect
  // to the unified Episode Workspace. Orphan rows (no eir_id) keep
  // loading the legacy page so admin-only flows like sponsor edits and
  // quotes-config still have a home until those move into the workspace.
  let eirId: string | null = null
  if (db) {
    const [row] = await db
      .select({ eir_id: episodesTable.eir_id })
      .from(episodesTable)
      .where(eq(episodesTable.id, id))
      .limit(1)
    eirId = row?.eir_id ?? null
  }
  if (eirId && legacy !== "1") {
    redirect(`/admin/khat-brain/episodes/${eirId}?tab=publish`)
  }

  const [
    episodes,
    overrides,
    hiddenEpisodeIds,
    guests,
    quotesConfig,
    youtubePackConfig,
    enrichment,
    partners,
    sponsor,
  ] = await Promise.all([
    getEpisodes({ limit: 200, includeHidden: true }),
    getEpisodeOverrides(),
    getHiddenEpisodeIds(),
    getAllGuests(),
    getQuotesConfig(),
    getYoutubePackConfig(),
    getEpisodeEnrichment(id),
    getActivePartners(),
    getEpisodeSponsor(id),
  ])

  const rawEpisode = episodes.find((ep) => ep.id === id)
  if (!rawEpisode) notFound()

  const episode = {
    id: rawEpisode.id,
    slug: rawEpisode.slug,
    title: rawEpisode.title,
    description: rawEpisode.description || "",
    youtube_url: rawEpisode.youtube_url,
    release_date: rawEpisode.release_date,
    duration_minutes: rawEpisode.duration_minutes,
    guest_id: rawEpisode.guest?.id || null,
    guest_name: rawEpisode.guest?.name || null,
    category_id: rawEpisode.category_id || null,
  }

  const override = overrides.find((o) => o.id === id) || null
  const isHidden = hiddenEpisodeIds.includes(id)
  const currentGuestId = episode.guest_id || null

  const guestsData = guests.map((g) => ({
    id: g.id,
    name: g.name,
    photo_url: g.photo_url,
  }))

  const partnersData = partners.map((p) => ({
    id: p.id,
    name: p.name,
  }))

  return (
    <>
      {/* Phase B.2 — operator landed here via ?legacy=1. Surface a path
          back into the workspace; the redirect above handles new arrivals. */}
      {eirId && (
        <div
          className="border-b border-violet-500/20 bg-violet-500/5 px-4 py-2 text-[12px]"
          data-legacy-banner
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-violet-200">
              <Brain className="h-3 w-3" />
              أنت داخل العرض القديم — مساحة عمل الحلقة الموحّدة في Khat Brain.
            </span>
            <Link
              href={`/admin/khat-brain/episodes/${eirId}?tab=publish`}
              className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/20"
            >
              العودة إلى مساحة العمل
            </Link>
          </div>
        </div>
      )}
      <EpisodeDetail
        episode={episode}
        override={override}
        isHidden={isHidden}
        guests={guestsData}
        currentGuestId={currentGuestId}
        quotesEntry={quotesConfig[id] || null}
        youtubePackEntry={youtubePackConfig[id] || null}
        enrichment={enrichment}
        partners={partnersData}
        currentSponsorId={sponsor?.partnerId || null}
        currentBrandLine={sponsor?.brandLine || null}
      />
    </>
  )
}
