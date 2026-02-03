"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Bookmark } from "lucide-react"
import { formatTimeSeconds, getYouTubeWatchUrl } from "@/lib/utils"
import { isItemSaved, toggleSaveItem } from "@/lib/saved"
import type { Timestamp } from "@/types/database"

interface TimestampListProps {
  timestamps: Timestamp[]
  youtubeUrl: string
  episodeTitle?: string
}

function TimestampItem({
  timestamp,
  youtubeUrl,
  episodeTitle,
}: {
  timestamp: Timestamp
  youtubeUrl: string
  episodeTitle?: string
}) {
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => {
    setIsSaved(isItemSaved(timestamp.id, "timestamp"))
  }, [timestamp.id])

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newState = toggleSaveItem({
      id: timestamp.id,
      type: "timestamp",
      title: timestamp.title,
      subtitle: episodeTitle
        ? `${episodeTitle} - ${formatTimeSeconds(timestamp.time_seconds)}`
        : formatTimeSeconds(timestamp.time_seconds),
    })
    setIsSaved(newState)
  }

  return (
    <li className="flex items-start gap-2">
      <a
        href={getYouTubeWatchUrl(youtubeUrl, timestamp.time_seconds)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
      >
        <span className="shrink-0 font-mono text-sm text-primary">
          {formatTimeSeconds(timestamp.time_seconds)}
        </span>
        <div className="flex-1">
          <span className="font-medium">{timestamp.title}</span>
          {timestamp.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {timestamp.description}
            </p>
          )}
        </div>
      </a>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSave}
        className={`h-8 w-8 shrink-0 ${isSaved ? "text-primary" : ""}`}
        title={isSaved ? "إزالة من المحفوظات" : "حفظ اللحظة"}
      >
        <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
      </Button>
    </li>
  )
}

export function TimestampList({ timestamps, youtubeUrl, episodeTitle }: TimestampListProps) {
  if (timestamps.length === 0) return null

  const sortedTimestamps = [...timestamps].sort((a, b) => a.time_seconds - b.time_seconds)

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">فهرس الحلقة</h3>
      <ul className="space-y-1">
        {sortedTimestamps.map((timestamp) => (
          <TimestampItem
            key={timestamp.id}
            timestamp={timestamp}
            youtubeUrl={youtubeUrl}
            episodeTitle={episodeTitle}
          />
        ))}
      </ul>
    </div>
  )
}
