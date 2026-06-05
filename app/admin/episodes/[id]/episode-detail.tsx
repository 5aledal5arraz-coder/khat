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

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "نظرة عامة", icon: Eye },
  { id: "conversation", label: "المحادثة", icon: BookOpen },
  { id: "quotes", label: "اقتباسات", icon: MessageSquareQuote },
  { id: "youtube-pack", label: "حزمة يوتيوب", icon: Youtube },
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
            <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70">
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
                      ? "bg-green-500/10 text-green-400"
                      : "bg-yellow-500/10 text-yellow-400"
                  }`}
                >
                  {quotesEntry.quotes.length}
                </span>
              )}
              {tab.id === "youtube-pack" && youtubePackEntry && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    isActive ? "bg-primary/20 text-primary" : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {youtubePackEntry.sections.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

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
