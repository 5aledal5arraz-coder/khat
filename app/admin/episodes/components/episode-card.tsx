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
  Clock,
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

interface EpisodeCardProps {
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

export function EpisodeCard({
  episode,
  override,
  isHidden,
  isSelected,
  onToggleSelect,
  onDelete,
  onAssignGuest,
  onAssignCategory,
  isAssigning,
  guests,
  categories,
  currentGuestId,
  currentCategoryId,
  quotesEntry,
}: EpisodeCardProps) {
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

  const handleCategoryChange = (categoryId: string) => {
    onAssignCategory(categoryId || null)
  }

  const handleToggleVisibility = async () => {
    await toggleEpisodeVisibility(episode.id)
  }

  const handleCardClick = () => {
    if (!editing) {
      router.push(`/admin/episodes/${episode.id}`)
    }
  }

  return (
    <div
      onClick={handleCardClick}
      className={`group relative overflow-hidden rounded-xl border bg-card/60 backdrop-blur-sm transition-all duration-200 ${
        isHidden
          ? "cursor-pointer border-border/20 opacity-50 hover:border-border/40 hover:opacity-70"
          : isSelected
          ? "cursor-pointer border-primary/30 bg-primary/5 shadow-md shadow-primary/5"
          : "cursor-pointer border-border/30 hover:border-border/50 hover:shadow-md hover:shadow-black/5"
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-muted/30">
        {videoId && (
          <Image
            src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        )}
        {/* Duration badge */}
        {episode.duration_minutes > 0 && (
          <span className="absolute bottom-2 start-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
            <Clock className="h-3 w-3 opacity-60" />
            {formatDuration(episode.duration_minutes)}
          </span>
        )}
        {/* YouTube external link on hover */}
        <a
          href={`https://youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-2 end-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {/* Checkbox overlay */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          className={`absolute start-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
            isSelected
              ? "bg-primary text-primary-foreground"
              : "bg-black/50 text-white opacity-0 backdrop-blur-sm group-hover:opacity-100"
          }`}
        >
          {isSelected ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
        {/* Action menu overlay */}
        <div
          className="absolute end-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
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

      {/* Body */}
      <div className="p-3.5">
        {editing ? (
          <div
            className="flex items-center gap-2"
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
              className="h-9 flex-1 rounded-xl border-primary/30 bg-primary/5 text-sm focus:border-primary"
              dir="auto"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-green-500/10 text-green-400 transition-all hover:bg-green-500/20"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancel}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-white/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <h3
              className="line-clamp-2 text-[13px] font-semibold leading-snug group-hover:text-foreground"
              dir="auto"
            >
              {override?.customTitle || episode.title}
            </h3>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground/70">
              <span>{formatDate(episode.release_date)}</span>
              {(currentGuest || episode.guest_name) && (
                <>
                  <span className="h-1 w-1 rounded-full bg-border" />
                  <span className="truncate">
                    {currentGuest?.name || episode.guest_name}
                  </span>
                </>
              )}
            </div>
          </>
        )}

        {/* Badges row */}
        {!editing && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {hasOverride && (
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                معدّل
              </span>
            )}
            {quotesEntry && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                  quotesEntry.status === "published"
                    ? "bg-green-500/10 text-green-400"
                    : "bg-yellow-500/10 text-yellow-400"
                }`}
              >
                {formatArabicCount(quotesEntry.quotes.length, "اقتباس")}
              </span>
            )}
            {currentCategory && (
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary/70">
                {currentCategory.name}
              </span>
            )}
            {isHidden && (
              <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                مخفي
              </span>
            )}
          </div>
        )}

        {/* Footer: Guest & Category selectors */}
        {!editing && (
          <div
            className="mt-2.5 flex flex-col gap-1.5 border-t border-border/15 pt-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <select
              value={currentGuestId || ""}
              onChange={(e) => handleGuestChange(e.target.value)}
              disabled={isAssigning}
              className={`h-7 min-w-0 w-full cursor-pointer truncate rounded-lg border border-border/30 bg-transparent px-2 text-[11px] transition-all duration-200 hover:border-border/60 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${
                currentGuestId
                  ? "text-accent border-accent/20"
                  : "text-muted-foreground/60"
              }`}
            >
              <option value="">بدون ضيف</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {categories.length > 0 && (
              <select
                value={currentCategoryId || ""}
                onChange={(e) => handleCategoryChange(e.target.value)}
                disabled={isAssigning}
                className={`h-7 min-w-0 w-full cursor-pointer truncate rounded-lg border border-border/30 bg-transparent px-2 text-[11px] transition-all duration-200 hover:border-border/60 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${
                  currentCategoryId
                    ? "text-primary border-primary/20"
                    : "text-muted-foreground/60"
                }`}
              >
                <option value="">بدون تصنيف</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
