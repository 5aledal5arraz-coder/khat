"use client"

import { useState, useRef, useEffect } from "react"
import {
  Pencil,
  Check,
  X,
  RotateCcw,
  Eye,
  EyeOff,
  Trash2,
  Undo2,
  ExternalLink,
  Calendar,
  Clock,
  Hash,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getYouTubeEmbedUrl, getYouTubeId } from "@/lib/utils"
import {
  updateEpisodeTitle,
  updateEpisodeDescription,
  removeEpisodeOverride,
  assignEpisodeSection,
  assignEpisodeGuest,
  toggleEpisodeVisibility,
  deleteEpisode,
  restoreEpisode,
} from "../actions"
import { GlowCard } from "@/app/admin/components/glow-card"
import { formatDuration, formatDate } from "./shared"
import type { Episode, AdminGuest } from "./shared"
import type { EpisodeOverride, EpisodeSection } from "@/types/episodes"

interface DetailOverviewProps {
  episode: Episode
  override: EpisodeOverride | null
  sections: EpisodeSection[]
  currentSectionId: string | null
  isHidden: boolean
  isDeleted: boolean
  guests: AdminGuest[]
  currentGuestId: string | null
}

export function DetailOverview({
  episode,
  override,
  sections,
  currentSectionId,
  isHidden,
  isDeleted,
  guests,
  currentGuestId,
}: DetailOverviewProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [title, setTitle] = useState(override?.customTitle || episode.title)
  const [description, setDescription] = useState(
    override?.customDescription || episode.description
  )
  const [saving, setSaving] = useState(false)
  const [savingDesc, setSavingDesc] = useState(false)
  const [assigningSection, setAssigningSection] = useState(false)
  const [assigningGuest, setAssigningGuest] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const descTextareaRef = useRef<HTMLTextAreaElement>(null)

  const originalTitle = override?.originalTitle || episode.title
  const hasOverride = !!override?.customTitle
  const hasDescOverride = !!override?.customDescription
  const displayTitle = override?.customTitle || episode.title
  const displayDescription = override?.customDescription || episode.description
  const currentSection = sections.find((s) => s.id === currentSectionId)
  const videoId = getYouTubeId(episode.youtube_url)

  useEffect(() => {
    if (editingTitle && titleInputRef.current) titleInputRef.current.focus()
  }, [editingTitle])

  useEffect(() => {
    if (editingDesc && descTextareaRef.current) {
      descTextareaRef.current.focus()
      descTextareaRef.current.style.height = "auto"
      descTextareaRef.current.style.height =
        descTextareaRef.current.scrollHeight + "px"
    }
  }, [editingDesc])

  const handleSaveTitle = async () => {
    setSaving(true)
    await updateEpisodeTitle(episode.id, originalTitle, title)
    setSaving(false)
    setEditingTitle(false)
  }

  const handleCancelTitle = () => {
    setTitle(override?.customTitle || episode.title)
    setEditingTitle(false)
  }

  const handleSaveDesc = async () => {
    setSavingDesc(true)
    await updateEpisodeDescription(episode.id, description)
    setSavingDesc(false)
    setEditingDesc(false)
  }

  const handleCancelDesc = () => {
    setDescription(override?.customDescription || episode.description)
    setEditingDesc(false)
  }

  const handleReset = async () => {
    setSaving(true)
    await removeEpisodeOverride(episode.id)
    setTitle(originalTitle)
    setDescription(episode.description)
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

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left Column - Video & Content */}
      <div className="space-y-6 lg:col-span-2">
        {/* Video Embed */}
        <div className="overflow-hidden rounded-2xl border border-border/30 bg-black">
          <div className="relative aspect-video w-full">
            <iframe
              src={getYouTubeEmbedUrl(episode.youtube_url)}
              title={displayTitle}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>

        {/* Title Section */}
        <div className="rounded-2xl border border-border/30 bg-card/50 p-5 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              العنوان
            </label>
            <div className="flex items-center gap-1.5">
              {(hasOverride || hasDescOverride) && (
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  استعادة الأصلي
                </button>
              )}
              {!editingTitle && (
                <button
                  onClick={() => setEditingTitle(true)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          {editingTitle ? (
            <div className="space-y-3">
              <Input
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle()
                  if (e.key === "Escape") handleCancelTitle()
                }}
                className="h-11 rounded-xl border-primary/30 bg-primary/5 text-base focus:border-primary"
                dir="auto"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveTitle}
                  disabled={saving}
                  className="h-8 gap-1.5 rounded-xl text-xs"
                >
                  <Check className="h-3.5 w-3.5" />
                  {saving ? "جارٍ الحفظ..." : "حفظ"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelTitle}
                  className="h-8 rounded-xl text-xs"
                >
                  إلغاء
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold leading-relaxed" dir="auto">
                {displayTitle}
              </h2>
              {hasOverride && (
                <p className="mt-1 text-xs text-muted-foreground/50">
                  الأصلي: {originalTitle}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Description Section */}
        <div className="rounded-2xl border border-border/30 bg-card/50 p-5 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              الوصف
            </label>
            {!editingDesc && (
              <button
                onClick={() => setEditingDesc(true)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {editingDesc ? (
            <div className="space-y-3">
              <textarea
                ref={descTextareaRef}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  e.target.style.height = "auto"
                  e.target.style.height = e.target.scrollHeight + "px"
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") handleCancelDesc()
                }}
                placeholder="أضف وصفاً للحلقة..."
                dir="auto"
                className="w-full resize-none rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                rows={4}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveDesc}
                  disabled={savingDesc}
                  className="h-8 gap-1.5 rounded-xl text-xs"
                >
                  <Check className="h-3.5 w-3.5" />
                  {savingDesc ? "جارٍ الحفظ..." : "حفظ الوصف"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelDesc}
                  className="h-8 rounded-xl text-xs"
                >
                  إلغاء
                </Button>
              </div>
            </div>
          ) : displayDescription ? (
            <p
              className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground"
              dir="auto"
            >
              {displayDescription}
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground/50">
              لا يوجد وصف لهذه الحلقة
            </p>
          )}
        </div>
      </div>

      {/* Right Column - Metadata Cards */}
      <div className="space-y-4">
        {/* Metadata Card */}
        <GlowCard>
          <div className="space-y-4 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              معلومات
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  تاريخ النشر
                </div>
                <span className="text-sm font-medium">
                  {formatDate(episode.release_date)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  المدة
                </div>
                <span className="text-sm font-medium">
                  {formatDuration(episode.duration_minutes)}
                </span>
              </div>
              {episode.id && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Hash className="h-4 w-4" />
                    المعرّف
                  </div>
                  <span
                    className="max-w-[140px] truncate text-xs font-mono text-muted-foreground/70"
                    title={episode.id}
                  >
                    {episode.id}
                  </span>
                </div>
              )}
            </div>
          </div>
        </GlowCard>

        {/* Section Card */}
        <GlowCard color="purple">
          <div className="p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              التصنيف
            </h3>
            <select
              value={currentSectionId || ""}
              onChange={(e) => handleSectionChange(e.target.value)}
              disabled={assigningSection || isDeleted}
              className="h-10 w-full cursor-pointer rounded-xl border border-border/50 bg-white/[0.02] px-3 text-sm transition-all hover:border-border hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
          </div>
        </GlowCard>

        {/* Guest Card */}
        <GlowCard>
          <div className="p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              الضيف
            </h3>
            <select
              value={currentGuestId || ""}
              onChange={(e) => handleGuestChange(e.target.value)}
              disabled={assigningGuest || isDeleted}
              className={`h-10 w-full cursor-pointer rounded-xl border border-border/50 bg-white/[0.02] px-3 text-sm transition-all hover:border-border hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${
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
        </GlowCard>

        {/* Visibility Card */}
        <GlowCard color={isDeleted ? "destructive" : isHidden ? "muted" : "primary"}>
          <div className="p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              الحالة
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {isDeleted ? (
                  <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive ring-1 ring-destructive/20">
                    محذوف
                  </span>
                ) : isHidden ? (
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-border">
                    مخفي
                  </span>
                ) : (
                  <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400 ring-1 ring-green-500/20">
                    مرئي
                  </span>
                )}
                {hasOverride && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
                    معدّل
                  </span>
                )}
              </div>

              {isDeleted ? (
                <Button
                  onClick={handleRestore}
                  variant="outline"
                  className="w-full gap-2 rounded-xl"
                  size="sm"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  استعادة الحلقة
                </Button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={handleToggleVisibility}
                    variant="outline"
                    className="w-full gap-2 rounded-xl"
                    size="sm"
                  >
                    {isHidden ? (
                      <>
                        <Eye className="h-3.5 w-3.5" />
                        إظهار الحلقة
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3.5 w-3.5" />
                        إخفاء الحلقة
                      </>
                    )}
                  </Button>
                  {confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleDelete}
                        className="flex-1 rounded-xl text-xs"
                      >
                        تأكيد الحذف
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 rounded-xl text-xs"
                      >
                        إلغاء
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setConfirmDelete(true)}
                      variant="ghost"
                      className="w-full gap-2 rounded-xl text-destructive hover:text-destructive"
                      size="sm"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف الحلقة
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </GlowCard>

        {/* Links Card */}
        <GlowCard>
          <div className="space-y-2 p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              روابط
            </h3>
            <a
              href={`/episodes/${episode.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              مشاهدة الحلقة
            </a>
            <a
              href={`https://youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              YouTube
            </a>
          </div>
        </GlowCard>
      </div>
    </div>
  )
}
