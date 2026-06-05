"use client"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  Check,
  X,
  Pencil,
  Eye,
  EyeOff,
  ExternalLink,
  CheckSquare,
  Square,
  RotateCcw,
  Trash2,
  Wand2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { getYouTubeId, formatArabicCount } from "@/lib/utils"
import {
  updateEpisodeTitle,
  removeEpisodeOverride,
  toggleEpisodeVisibility,
} from "../actions"
import { ActionMenu, MenuItem, formatDuration, formatDate } from "./shared"
import type { AdminEpisodeView, AdminGuestView, CategoryWithCount } from "./shared"
import type { EpisodeOverride, EpisodeQuotesEntry } from "@/types/episodes"
import type { YouTubePackEntry } from "@/types/youtube-pack"

interface EpisodeRowProps {
  episode: AdminEpisodeView
  override: EpisodeOverride | null
  isHidden: boolean
  isSelected: boolean
  onToggleSelect: () => void
  onDelete: () => void
  onAssignGuest: (guestId: string | null) => void
  onAssignCategory: (categoryId: string | null) => void
  isAssigning?: boolean
  guests: AdminGuestView[]
  categories: CategoryWithCount[]
  currentGuestId: string | null
  currentCategoryId: string | null
  quotesEntry: EpisodeQuotesEntry | null
  youtubePackEntry: YouTubePackEntry | null
}

export function EpisodeRow({
  episode,
  override,
  isHidden,
  isSelected,
  onToggleSelect,
  onDelete,
  onAssignGuest,
  guests,
  categories,
  currentGuestId,
  currentCategoryId,
  quotesEntry,
}: EpisodeRowProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(override?.customTitle || episode.title)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const originalTitle = override?.originalTitle || episode.title
  const hasOverride = !!override?.customTitle
  const hasDescOverride = !!override?.customDescription
  const videoId = getYouTubeId(episode.youtube_url)
  const currentGuest = guests.find((g) => g.id === currentGuestId)
  const currentCategory = categories.find((c) => c.id === currentCategoryId)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  const handleSave = async () => {
    setSaving(true)
    await updateEpisodeTitle(episode.id, originalTitle, title)
    setSaving(false)
    setEditing(false)
  }

  const handleCancel = () => {
    setTitle(override?.customTitle || episode.title)
    setEditing(false)
  }

  const handleReset = async () => {
    setSaving(true)
    await removeEpisodeOverride(episode.id)
    setTitle(originalTitle)
    setSaving(false)
  }

  const handleGuestChange = (guestId: string) => {
    onAssignGuest(guestId || null)
  }

  const handleToggleVisibility = async () => {
    await toggleEpisodeVisibility(episode.id)
  }

  const handleRowClick = () => {
    if (!editing) {
      router.push(`/admin/episodes/${episode.id}`)
    }
  }

  return (
    <div
      onClick={handleRowClick}
      className={`group flex items-center gap-3 px-3 py-2.5 transition-all duration-200 ${
        isHidden
          ? "cursor-pointer opacity-50 hover:opacity-70"
          : isSelected
          ? "cursor-pointer bg-primary/5"
          : "cursor-pointer hover:bg-muted/30"
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect()
        }}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        {isSelected ? (
          <CheckSquare className="h-4 w-4 text-primary" />
        ) : (
          <Square className="h-4 w-4" />
        )}
      </button>

      {/* Thumbnail */}
      <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded-md bg-muted/30">
        {videoId && (
          <Image
            src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
            alt=""
            fill
            sizes="64px"
            className="object-cover"
          />
        )}
      </div>

      {/* Title */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <div
            className="flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave()
                if (e.key === "Escape") handleCancel()
              }}
              className="h-7 flex-1 rounded-lg border-primary/30 bg-primary/5 text-xs focus:border-primary"
              dir="auto"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              onClick={handleCancel}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="truncate text-[13px] font-medium group-hover:text-foreground"
              dir="auto"
            >
              {override?.customTitle || episode.title}
            </span>
            {/* Inline badges */}
            {hasOverride && (
              <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                معدّل
              </span>
            )}
            {quotesEntry && (
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                  quotesEntry.status === "published"
                    ? "bg-green-500/10 text-green-400"
                    : "bg-yellow-500/10 text-yellow-400"
                }`}
              >
                {formatArabicCount(quotesEntry.quotes.length, "اقتباس")}
              </span>
            )}
            {currentCategory && (
              <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
                {currentCategory.name}
              </span>
            )}
            {isHidden && (
              <span className="shrink-0 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                مخفي
              </span>
            )}
          </div>
        )}
      </div>

      {/* Guest */}
      <span className="hidden w-28 shrink-0 truncate text-[11px] text-muted-foreground/70 md:block">
        {currentGuest?.name || episode.guest_name || "\u2014"}
      </span>

      {/* Date */}
      <span className="hidden w-24 shrink-0 text-[11px] text-muted-foreground/70 md:block">
        {formatDate(episode.release_date)}
      </span>

      {/* Duration */}
      <span className="hidden w-16 shrink-0 text-[11px] text-muted-foreground/70 md:block">
        {formatDuration(episode.duration_minutes)}
      </span>

      {/* Actions */}
      <div
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <ActionMenu>
          {(close) => (
            <>
              <MenuItem
                icon={ExternalLink}
                label="فتح الحلقة"
                onClick={() => {
                  router.push(`/admin/episodes/${episode.id}`)
                  close()
                }}
              />
              {videoId && (
                <MenuItem
                  icon={Wand2}
                  label="فتح في الاستوديو"
                  onClick={() => {
                    router.push(`/admin/studio?video=${videoId}`)
                    close()
                  }}
                />
              )}
              <MenuItem
                icon={Pencil}
                label="تعديل العنوان"
                onClick={() => {
                  setEditing(true)
                  close()
                }}
              />
              {(hasOverride || hasDescOverride) && (
                <MenuItem
                  icon={RotateCcw}
                  label="استعادة الأصلي"
                  onClick={() => {
                    handleReset()
                    close()
                  }}
                  disabled={saving}
                />
              )}
              {/* Guest submenu */}
              <div className="my-1 border-t border-border/30" />
              <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                الضيف
              </div>
              <MenuItem
                icon={Square}
                label="بدون ضيف"
                onClick={() => {
                  handleGuestChange("")
                  close()
                }}
              />
              {guests.map((g) => (
                <MenuItem
                  key={g.id}
                  icon={g.id === currentGuestId ? CheckSquare : Square}
                  label={g.name}
                  onClick={() => {
                    handleGuestChange(g.id)
                    close()
                  }}
                />
              ))}
              <div className="my-1 border-t border-border/30" />
              <MenuItem
                icon={isHidden ? Eye : EyeOff}
                label={isHidden ? "إظهار الحلقة" : "إخفاء الحلقة"}
                onClick={() => {
                  handleToggleVisibility()
                  close()
                }}
              />
              <div className="my-1 border-t border-border/30" />
              <MenuItem
                icon={Trash2}
                label="حذف الحلقة"
                variant="danger"
                onClick={() => {
                  onDelete()
                  close()
                }}
              />
            </>
          )}
        </ActionMenu>
      </div>
    </div>
  )
}
