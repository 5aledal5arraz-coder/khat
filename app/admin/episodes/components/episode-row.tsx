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
import type { EpisodeOverride, EpisodeSection, EpisodeQuotesEntry } from "@/types/episodes"
import type { YouTubePackEntry } from "@/types/youtube-pack"

interface EpisodeRowProps {
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

export function EpisodeRow({
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
}: EpisodeRowProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(override?.customTitle || episode.title)
  const [saving, setSaving] = useState(false)
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
    await assignEpisodeSection(episode.id, sectionId || null)
  }

  const handleGuestChange = async (guestId: string) => {
    await assignEpisodeGuest(episode.id, guestId || null)
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

  const handleRowClick = () => {
    if (!editing && !isDeleted) {
      router.push(`/admin/episodes/${episode.id}`)
    }
  }

  return (
    <div
      onClick={handleRowClick}
      className={`group flex items-center gap-3 px-3 py-2 transition-all ${
        isDeleted
          ? "cursor-default opacity-40"
          : isHidden
          ? "cursor-pointer opacity-50 hover:opacity-70"
          : isSelected
          ? "cursor-pointer bg-primary/5"
          : "cursor-pointer hover:bg-white/[0.03]"
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
      <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded-md bg-muted/50">
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
              className={`truncate text-sm font-medium ${
                isDeleted
                  ? "line-through text-muted-foreground"
                  : "group-hover:text-foreground"
              }`}
              dir="auto"
            >
              {override?.customTitle || episode.title}
            </span>
            {/* Inline badges */}
            {hasOverride && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
                معدّل
              </span>
            )}
            {quotesEntry && (
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${
                  quotesEntry.status === "published"
                    ? "bg-green-500/10 text-green-400 ring-green-500/20"
                    : "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20"
                }`}
              >
                {formatArabicCount(quotesEntry.quotes.length, "اقتباس")}
              </span>
            )}
            {isHidden && !isDeleted && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border">
                مخفي
              </span>
            )}
            {isDeleted && (
              <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive ring-1 ring-destructive/20">
                محذوف
              </span>
            )}
          </div>
        )}
      </div>

      {/* Guest */}
      <span className="hidden w-28 shrink-0 truncate text-xs text-muted-foreground md:block">
        {currentGuest?.name || episode.guestName || "—"}
      </span>

      {/* Date */}
      <span className="hidden w-24 shrink-0 text-xs text-muted-foreground md:block">
        {formatDate(episode.release_date)}
      </span>

      {/* Duration */}
      <span className="hidden w-16 shrink-0 text-xs text-muted-foreground md:block">
        {formatDuration(episode.duration_minutes)}
      </span>

      {/* Section */}
      <span className="hidden w-24 shrink-0 md:flex items-center gap-1.5 text-xs text-muted-foreground">
        {currentSection?.color && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: currentSection.color }}
          />
        )}
        <span className="truncate">{currentSection?.label || "—"}</span>
      </span>

      {/* Actions */}
      <div
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {isDeleted ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRestore}
            className="h-7 gap-1 rounded-lg px-2 text-xs"
          >
            <Undo2 className="h-3 w-3" />
          </Button>
        ) : confirmDelete ? (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              className="h-6 rounded-md px-2 text-[10px]"
            >
              تأكيد
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              className="h-6 rounded-md px-2 text-[10px]"
            >
              إلغاء
            </Button>
          </div>
        ) : (
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
                {/* Section submenu */}
                <div className="my-1 border-t border-border/50" />
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  التصنيف
                </div>
                <MenuItem
                  icon={Square}
                  label="غير مصنّف"
                  onClick={() => {
                    handleSectionChange("")
                    close()
                  }}
                />
                {sections.map((s) => (
                  <MenuItem
                    key={s.id}
                    icon={s.id === currentSectionId ? CheckSquare : Square}
                    label={s.label}
                    onClick={() => {
                      handleSectionChange(s.id)
                      close()
                    }}
                  />
                ))}
                {/* Guest submenu */}
                <div className="my-1 border-t border-border/50" />
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                <div className="my-1 border-t border-border/50" />
                <MenuItem
                  icon={isHidden ? Eye : EyeOff}
                  label={isHidden ? "إظهار الحلقة" : "إخفاء الحلقة"}
                  onClick={() => {
                    handleToggleVisibility()
                    close()
                  }}
                />
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
        )}
      </div>
    </div>
  )
}
