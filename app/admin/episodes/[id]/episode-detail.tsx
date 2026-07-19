"use client"

import { useState } from "react"
import { Eye, MessageSquareQuote, Youtube, BookOpen, History } from "lucide-react"
import { DetailOverview } from "../components/detail-overview"
import { DetailQuotes } from "../components/detail-quotes"
import { DetailYoutubePack } from "../components/detail-youtube-pack"
import { DetailConversation } from "../components/detail-conversation"
import { DetailVersions } from "../components/detail-versions"
import type { AdminEpisodeView, AdminGuestView } from "../components/shared"
import type { EpisodeOverride, EpisodeQuotesEntry, EpisodeEnrichment } from "@/types/episodes"
import type { YouTubePackEntry } from "@/types/youtube-pack"

type Tab = "overview" | "quotes" | "youtube-pack" | "conversation" | "versions"

interface SponsorPartner {
  id: string
  name: string
}

interface EpisodeDetailProps {
  episode: AdminEpisodeView
  override: EpisodeOverride | null
  isHidden: boolean
  guests: AdminGuestView[]
  currentGuestId: string | null
  quotesEntry: EpisodeQuotesEntry | null
  youtubePackEntry: YouTubePackEntry | null
  enrichment: EpisodeEnrichment | null
  partners: SponsorPartner[]
  currentSponsorId: string | null
  currentBrandLine: string | null
}

// `source` marks where each editorial tab's content comes from — manual
// admin editing vs. studio AI generation — so operators stop confusing the
// hand-written "إثراء الحلقة" with the studio-generated quotes/YouTube pack.
const tabs: {
  id: Tab
  label: string
  icon: React.ElementType
  source?: "manual" | "studio"
  hint?: string
}[] = [
  { id: "overview", label: "نظرة عامة", icon: Eye },
  {
    id: "conversation",
    label: "إثراء الحلقة",
    icon: BookOpen,
    source: "manual",
    hint: "محتوى تحريري يظهر للزوار في صفحة الحلقة",
  },
  { id: "quotes", label: "اقتباسات", icon: MessageSquareQuote, source: "studio" },
  { id: "youtube-pack", label: "حزمة يوتيوب", icon: Youtube, source: "studio" },
  { id: "versions", label: "السجل", icon: History },
]

export function EpisodeDetail({
  episode,
  override,
  isHidden,
  guests,
  currentGuestId,
  quotesEntry,
  youtubePackEntry,
  enrichment,
  partners,
  currentSponsorId,
  currentBrandLine,
}: EpisodeDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview")

  const displayTitle = override?.customTitle || episode.title

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="line-clamp-1 text-xl font-bold tracking-tight"
            dir="auto"
            title={displayTitle}
          >
            {displayTitle}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isHidden && (
            <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              مخفي
            </span>
          )}
          {override?.customTitle && (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              معدّل
            </span>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="scrollbar-hide -mx-1 flex gap-1 overflow-x-auto px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.id === "quotes" && quotesEntry && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    isActive
                      ? "bg-primary/20 text-primary"
                      : quotesEntry.status === "published"
                      ? "bg-green-500/10 text-green-700"
                      : "bg-yellow-500/10 text-yellow-700"
                  }`}
                >
                  {quotesEntry.quotes.length}
                </span>
              )}
              {tab.id === "youtube-pack" && youtubePackEntry && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    isActive ? "bg-primary/20 text-primary" : "bg-red-500/10 text-red-700"
                  }`}
                >
                  {youtubePackEntry.sections.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Source badge + helper line for the active editorial tab (Khaled). */}
      {(() => {
        const t = tabs.find((x) => x.id === activeTab)
        if (!t?.source) return null
        return (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-[11.5px]">
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${
                t.source === "manual"
                  ? "bg-sky-500/10 text-sky-700"
                  : "bg-violet-500/10 text-violet-700"
              }`}
            >
              {t.source === "manual" ? "يدوي" : "مولّد من الاستوديو"}
            </span>
            {t.hint && <span className="text-muted-foreground">{t.hint}</span>}
          </div>
        )
      })()}

      {/* Tab Content */}
      {activeTab === "overview" && (
        <DetailOverview
          episode={episode}
          override={override}
          isHidden={isHidden}
          guests={guests}
          currentGuestId={currentGuestId}
          partners={partners}
          currentSponsorId={currentSponsorId}
          currentBrandLine={currentBrandLine}
        />
      )}
      {activeTab === "conversation" && (
        <DetailConversation
          episodeId={episode.id}
          enrichment={enrichment}
        />
      )}
      {activeTab === "quotes" && (
        <DetailQuotes
          episodeId={episode.id}
          episodeTitle={displayTitle}
          youtubeUrl={episode.youtube_url}
          guestName={episode.guest_name || "الضيف"}
          entry={quotesEntry}
        />
      )}
      {activeTab === "youtube-pack" && (
        <DetailYoutubePack
          episodeId={episode.id}
          episodeTitle={displayTitle}
          youtubeUrl={episode.youtube_url}
          guestName={episode.guest_name || "الضيف"}
          entry={youtubePackEntry}
        />
      )}
      {activeTab === "versions" && (
        <DetailVersions episodeId={episode.id} />
      )}
    </div>
  )
}
