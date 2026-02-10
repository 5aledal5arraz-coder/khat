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
  Trash2,
  Undo2,
  ExternalLink,
  CheckSquare,
  Square,
  Clock,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getYouTubeId, formatArabicCount } from "@/lib/utils"
import {
  updateEpisodeTitle,
  removeEpisodeOverride,
  assignEpisodeSection,
  assignEpisodeGuest,
  toggleEpisodeVisibility,
  deleteEpisode,
  restoreEpisode,
} from "../actions"
import { ActionMenu, MenuItem, formatDuration, formatDate } from "./shared"
import type { Episode, AdminGuest } from "./shared"
import type {
  EpisodeOverride,
  EpisodeSection,
  EpisodeQuotesEntry,
  YouTubePackEntry,
} from "@/types/ads"

interface EpisodeCardProps {
  episode: Episode
  override: EpisodeOverride | null
  sections: EpisodeSection[]
  currentSectionId: string | null
  isHidden: boolean
  isDeleted: boolean
  isSelected: boolean
  onToggleSelect: () => void
  guests: AdminGuest[]
  currentGuestId: string | null
  quotesEntry: EpisodeQuotesEntry | null
  youtubePackEntry: YouTubePackEntry | null
}

export function EpisodeCard({
  episode,
  override,
  sections,
  currentSectionId,
  isHidden,
  isDeleted,
  isSelected,
  onToggleSelect,
  guests,
  currentGuestId,
  quotesEntry,
}: EpisodeCardProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(override?.customTitle || episode.title)
  const [saving, setSaving] = useState(false)
  const [assigningSection, setAssigningSection] = useState(false)
  const [assigningGuest, setAssigningGuest] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const originalTitle = override?.originalTitle || episode.title
  const hasOverride = !!override?.customTitle
  const hasDescOverride = !!override?.customDescription
  const currentSection = sections.find((s) => s.id === currentSectionId)
  const videoId = getYouTubeId(episode.youtube_url)
  const currentGuest = guests.find((g) => g.id === currentGuestId)

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

  const handleSectionChange = async (sectionId: string) => {
    setAssigningSection(true)
    await assignEpisodeSection(episode.id, sectionId || null)
    setAssigningSection(false)
  }

  const handleGuestChange = async (guestId: string) => {
    setAssigningGuest(true)
    await assignEpisodeGuest(episode.id, guestId || null)
    setAssigningGuest(false)
  }

  const handleToggleVisibility = async () => {
    await toggleEpisodeVisibility(episode.id)
  }

  const handleDelete = async () => {
    await deleteEpisode(episode.id)
    setConfirmDelete(false)
  }

  const handleRestore = async () => {
    await restoreEpisode(episode.id)
  }

  const handleCardClick = () => {
    if (!editing && !isDeleted) {
      router.push(`/admin/episodes/${episode.id}`)
    }
  }

  return (
    <div
      onClick={handleCardClick}
      className={`group relative overflow-hidden rounded-2xl border bg-card/80 backdrop-blur-sm transition-all ${
        isDeleted
          ? "cursor-default border-destructive/20 opacity-40"
          : isHidden
          ? "cursor-pointer border-border/30 opacity-50 hover:border-border/50 hover:opacity-70"
          : isSelected
          ? "cursor-pointer border-primary/40 bg-primary/5 shadow-lg shadow-primary/5"
          : "cursor-pointer border-border/30 hover:border-border/60 hover:shadow-lg hover:shadow-black/5"
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-muted/50">
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
          <span className="absolute bottom-2 start-2 flex items-center gap-1 rounded-lg bg-black/80 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
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
        {!isDeleted && (
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
                  <div className="my-1 border-t border-border/50" />
                  <MenuItem
                    icon={Trash2}
                    label="حذف الحلقة"
                    variant="danger"
                    onClick={() => {
                      setConfirmDelete(true)
                      close()
                    }}
                  />
                </>
              )}
            </ActionMenu>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
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
              className={`line-clamp-2 text-sm font-semibold leading-snug ${
                isDeleted
                  ? "line-through text-muted-foreground"
                  : "group-hover:text-foreground"
              }`}
              dir="auto"
            >
              {override?.customTitle || episode.title}
            </h3>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatDate(episode.release_date)}</span>
              {(currentGuest || episode.guestName) && (
                <>
                  <span className="h-1 w-1 rounded-full bg-border" />
                  <span className="truncate">
                    {currentGuest?.name || episode.guestName}
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
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
                معدّل
              </span>
            )}
            {quotesEntry && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                  quotesEntry.status === "published"
                    ? "bg-green-500/10 text-green-400 ring-green-500/20"
                    : "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20"
                }`}
              >
                {formatArabicCount(quotesEntry.quotes.length, "اقتباس")}
              </span>
            )}
            {isHidden && !isDeleted && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border">
                مخفي
              </span>
            )}
            {isDeleted && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive ring-1 ring-destructive/20">
                محذوف
              </span>
            )}
          </div>
        )}

        {/* Footer: Section & Guest selectors */}
        {!isDeleted && !editing && (
          <div
            className="mt-3 flex items-center gap-2 border-t border-border/20 pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <select
              value={currentSectionId || ""}
              onChange={(e) => handleSectionChange(e.target.value)}
              disabled={assigningSection}
              className="h-7 min-w-0 flex-1 cursor-pointer truncate rounded-lg border border-border/50 bg-white/[0.02] px-2 text-[11px] text-muted-foreground transition-all hover:border-border hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              style={
                currentSection?.color
                  ? {
                      borderColor: currentSection.color + "40",
                      color: currentSection.color,
                    }
                  : undefined
              }
            >
              <option value="">غير مصنّف</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={currentGuestId || ""}
              onChange={(e) => handleGuestChange(e.target.value)}
              disabled={assigningGuest}
              className={`h-7 min-w-0 flex-1 cursor-pointer truncate rounded-lg border border-border/50 bg-white/[0.02] px-2 text-[11px] transition-all hover:border-border hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${
                currentGuestId
                  ? "text-accent border-accent/30"
                  : "text-muted-foreground"
              }`}
            >
              <option value="">بدون ضيف</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Deleted: restore button */}
        {isDeleted && (
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRestore}
              className="h-7 w-full gap-1.5 rounded-xl text-xs"
            >
              <Undo2 className="h-3.5 w-3.5" />
              استعادة
            </Button>
          </div>
        )}

        {/* Confirm delete */}
        {confirmDelete && (
          <div
            className="mt-3 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              className="h-7 flex-1 rounded-xl text-xs"
            >
              تأكيد الحذف
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              className="h-7 flex-1 rounded-xl text-xs"
            >
              إلغاء
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
