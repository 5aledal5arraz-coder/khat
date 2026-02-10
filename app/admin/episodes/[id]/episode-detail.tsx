"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Eye, MessageSquareQuote, Youtube } from "lucide-react"
import { DetailOverview } from "../components/detail-overview"
import { DetailQuotes } from "../components/detail-quotes"
import { DetailYoutubePack } from "../components/detail-youtube-pack"
import type { Episode, AdminGuest } from "../components/shared"
import type {
  EpisodeOverride,
  EpisodeSection,
  EpisodeQuotesEntry,
  YouTubePackEntry,
} from "@/types/ads"

type Tab = "overview" | "quotes" | "youtube-pack"

interface EpisodeDetailProps {
  episode: Episode
  override: EpisodeOverride | null
  sections: EpisodeSection[]
  currentSectionId: string | null
  isHidden: boolean
  isDeleted: boolean
  guests: AdminGuest[]
  currentGuestId: string | null
  quotesEntry: EpisodeQuotesEntry | null
  youtubePackEntry: YouTubePackEntry | null
}

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "نظرة عامة", icon: Eye },
  { id: "quotes", label: "اقتباسات", icon: MessageSquareQuote },
  { id: "youtube-pack", label: "حزمة يوتيوب", icon: Youtube },
]

export function EpisodeDetail({
  episode,
  override,
  sections,
  currentSectionId,
  isHidden,
  isDeleted,
  guests,
  currentGuestId,
  quotesEntry,
  youtubePackEntry,
}: EpisodeDetailProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>("overview")

  const displayTitle = override?.customTitle || episode.title

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/admin/episodes")}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
            إدارة الحلقات
          </button>
          <span className="text-muted-foreground/30">/</span>
          <h1
            className="line-clamp-1 text-lg font-bold"
            dir="auto"
            title={displayTitle}
          >
            {displayTitle}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isDeleted && (
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive ring-1 ring-destructive/20">
              محذوف
            </span>
          )}
          {isHidden && !isDeleted && (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-border">
              مخفي
            </span>
          )}
          {override?.customTitle && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20">
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
              className={`flex shrink-0 items-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.id === "quotes" && quotesEntry && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    isActive
                      ? "bg-white/20"
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
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    isActive ? "bg-white/20" : "bg-red-500/10 text-red-400"
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
          sections={sections}
          currentSectionId={currentSectionId}
          isHidden={isHidden}
          isDeleted={isDeleted}
          guests={guests}
          currentGuestId={currentGuestId}
        />
      )}
      {activeTab === "quotes" && (
        <DetailQuotes
          episodeId={episode.id}
          episodeTitle={displayTitle}
          youtubeUrl={episode.youtube_url}
          guestName={episode.guestName || "الضيف"}
          entry={quotesEntry}
        />
      )}
      {activeTab === "youtube-pack" && (
        <DetailYoutubePack
          episodeId={episode.id}
          episodeTitle={displayTitle}
          youtubeUrl={episode.youtube_url}
          guestName={episode.guestName || "الضيف"}
          entry={youtubePackEntry}
        />
      )}
    </div>
  )
}
