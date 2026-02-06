"use client"

import { useState } from "react"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Pencil, Check, X, RotateCcw, Plus, Eye, EyeOff } from "lucide-react"
import {
  updateEpisodeTitle,
  removeEpisodeOverride,
  createSection,
  deleteSection,
  assignEpisodeSection,
  toggleEpisodeVisibility,
  toggleSectionVisibility,
} from "./actions"
import type { EpisodeOverride, EpisodeSectionsConfig, EpisodeSection } from "@/types/ads"

interface Episode {
  id: string
  title: string
  youtube_url: string
  release_date: string
}

interface EpisodesListProps {
  episodes: Episode[]
  overrides: EpisodeOverride[]
  sectionsConfig: EpisodeSectionsConfig
}

function getYouTubeId(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/)
  return match ? match[1] : ""
}

function EpisodeRow({
  episode,
  override,
  sections,
  currentSectionId,
  isHidden,
}: {
  episode: Episode
  override: EpisodeOverride | null
  sections: EpisodeSection[]
  currentSectionId: string | null
  isHidden: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(override?.customTitle || episode.title)
  const [saving, setSaving] = useState(false)
  const [assigningSection, setAssigningSection] = useState(false)
  const [togglingVisibility, setTogglingVisibility] = useState(false)

  const originalTitle = override?.originalTitle || episode.title
  const hasOverride = !!override

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

  const handleToggleVisibility = async () => {
    setTogglingVisibility(true)
    await toggleEpisodeVisibility(episode.id)
    setTogglingVisibility(false)
  }

  return (
    <Card className={`${hasOverride ? "border-primary/50" : ""} ${isHidden ? "opacity-50" : ""}`}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Thumbnail */}
          <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
            <Image
              src={`https://img.youtube.com/vi/${getYouTubeId(episode.youtube_url)}/mqdefault.jpg`}
              alt={episode.title}
              fill
              className="object-cover"
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="flex-1"
                  dir="auto"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSave}
                  disabled={saving}
                  className="text-green-500 hover:text-green-600"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium line-clamp-2">{override?.customTitle || episode.title}</h3>
                  {hasOverride && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      الأصلي: {originalTitle}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(episode.release_date).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Visibility toggle */}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleToggleVisibility}
                    disabled={togglingVisibility}
                    className={`h-8 w-8 ${isHidden ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-foreground"}`}
                    title={isHidden ? "إظهار الحلقة" : "إخفاء الحلقة"}
                  >
                    {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  {/* Section dropdown */}
                  <select
                    value={currentSectionId || ""}
                    onChange={(e) => handleSectionChange(e.target.value)}
                    disabled={assigningSection}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="">غير مصنّف</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditing(true)}
                    className="h-8 w-8"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {hasOverride && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleReset}
                      disabled={saving}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      title="استعادة العنوان الأصلي"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CreateSectionDialog({
  onClose,
}: {
  onClose: () => void
}) {
  const [label, setLabel] = useState("")
  const [color, setColor] = useState("#3b82f6")
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!label.trim()) return
    setSaving(true)
    await createSection(label.trim(), color)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-bold">إضافة تصنيف جديد</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">اسم التصنيف</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="مثال: الموسم الثالث"
              dir="auto"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">اللون</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <span className="text-sm text-muted-foreground">{color}</span>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={handleCreate} disabled={saving || !label.trim()}>
            {saving ? "جارٍ الحفظ..." : "إضافة"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function EpisodesList({ episodes, overrides, sectionsConfig }: EpisodesListProps) {
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<string | null>(null) // null = الكل
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletingSection, setDeletingSection] = useState<string | null>(null)
  const [togglingSection, setTogglingSection] = useState<string | null>(null)

  const overrideMap = new Map(overrides.map((o) => [o.id, o]))
  const { sections, assignments, hiddenEpisodes } = sectionsConfig
  const hiddenSet = new Set(hiddenEpisodes)

  const isEpisodeHidden = (epId: string) => {
    if (hiddenSet.has(epId)) return true
    const secId = assignments[epId]
    if (secId) {
      const section = sections.find((s) => s.id === secId)
      if (section?.hidden) return true
    }
    return false
  }

  const handleToggleSectionVisibility = async (sectionId: string) => {
    setTogglingSection(sectionId)
    await toggleSectionVisibility(sectionId)
    setTogglingSection(null)
  }

  const filteredEpisodes = episodes.filter((ep) =>
    ep.title.toLowerCase().includes(search.toLowerCase()) ||
    overrideMap.get(ep.id)?.customTitle.toLowerCase().includes(search.toLowerCase())
  )

  // Further filter by section
  const sectionFilteredEpisodes = activeFilter
    ? filteredEpisodes.filter((ep) => {
        if (activeFilter === "__uncategorized") return !assignments[ep.id]
        return assignments[ep.id] === activeFilter
      })
    : filteredEpisodes

  // Group episodes by section for "الكل" view
  const groupedEpisodes = activeFilter === null
    ? (() => {
        const groups: { section: EpisodeSection | null; episodes: Episode[] }[] = []
        const sortedSections = [...sections].sort((a, b) => a.order - b.order)
        for (const section of sortedSections) {
          const sectionEps = filteredEpisodes.filter(
            (ep) => assignments[ep.id] === section.id
          )
          if (sectionEps.length > 0) {
            groups.push({ section, episodes: sectionEps })
          }
        }
        const uncategorized = filteredEpisodes.filter((ep) => !assignments[ep.id])
        if (uncategorized.length > 0) {
          groups.push({ section: null, episodes: uncategorized })
        }
        return groups
      })()
    : null

  const handleDeleteSection = async (sectionId: string) => {
    setDeletingSection(sectionId)
    await deleteSection(sectionId)
    if (activeFilter === sectionId) setActiveFilter(null)
    setDeletingSection(null)
  }

  return (
    <div className="space-y-6">
      {/* Section filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={activeFilter === null ? "default" : "outline"}
          onClick={() => setActiveFilter(null)}
        >
          الكل
        </Button>
        {sections
          .sort((a, b) => a.order - b.order)
          .map((section) => (
            <div key={section.id} className={`group relative flex items-center ${section.hidden ? "opacity-50" : ""}`}>
              <Button
                size="sm"
                variant={activeFilter === section.id ? "default" : "outline"}
                onClick={() => setActiveFilter(section.id)}
                className="pe-7"
                style={
                  activeFilter === section.id && section.color
                    ? { backgroundColor: section.color, borderColor: section.color }
                    : section.color
                    ? { borderColor: section.color, color: section.color }
                    : undefined
                }
              >
                {section.hidden && <EyeOff className="me-1 h-3 w-3" />}
                {section.label}
              </Button>
              <button
                onClick={() => handleDeleteSection(section.id)}
                disabled={deletingSection === section.id}
                className="absolute end-1 top-1/2 -translate-y-1/2 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/20 group-hover:opacity-100"
                title="حذف التصنيف"
              >
                <X className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setActiveFilter("__uncategorized")}
          className={activeFilter === "__uncategorized" ? "bg-muted" : ""}
        >
          غير مصنّف
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowCreateDialog(true)}
          className="text-primary"
        >
          <Plus className="me-1 h-4 w-4" />
          تصنيف جديد
        </Button>
      </div>

      {/* Search */}
      <Input
        placeholder="البحث في الحلقات..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {/* Stats */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{episodes.length} حلقة</span>
        <span>•</span>
        <span>{overrides.length} عنوان معدّل</span>
        <span>•</span>
        <span>{sections.length} تصنيف</span>
        {episodes.filter((ep) => isEpisodeHidden(ep.id)).length > 0 && (
          <>
            <span>•</span>
            <span className="text-destructive">
              {episodes.filter((ep) => isEpisodeHidden(ep.id)).length} مخفي
            </span>
          </>
        )}
      </div>

      {/* Episodes — grouped view when "الكل" is active */}
      {groupedEpisodes ? (
        <div className="space-y-6">
          {groupedEpisodes.map((group) => (
            <div key={group.section?.id || "uncategorized"} className={group.section?.hidden ? "opacity-60" : ""}>
              <div className="mb-3 flex items-center gap-2">
                {group.section?.color && (
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: group.section.color }}
                  />
                )}
                <h2 className="text-lg font-semibold">
                  {group.section?.label || "غير مصنّف"}
                </h2>
                <span className="text-sm text-muted-foreground">
                  ({group.episodes.length})
                </span>
                {group.section && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleToggleSectionVisibility(group.section!.id)}
                    disabled={togglingSection === group.section.id}
                    className={`h-7 w-7 ${group.section.hidden ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
                    title={group.section.hidden ? "إظهار التصنيف بالكامل" : "إخفاء التصنيف بالكامل"}
                  >
                    {group.section.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                )}
                {group.section?.hidden && (
                  <span className="text-xs text-destructive">مخفي</span>
                )}
              </div>
              <div className="space-y-3">
                {group.episodes.map((episode) => (
                  <EpisodeRow
                    key={episode.id}
                    episode={episode}
                    override={overrideMap.get(episode.id) || null}
                    sections={sections}
                    currentSectionId={assignments[episode.id] || null}
                    isHidden={isEpisodeHidden(episode.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sectionFilteredEpisodes.map((episode) => (
            <EpisodeRow
              key={episode.id}
              episode={episode}
              override={overrideMap.get(episode.id) || null}
              sections={sections}
              currentSectionId={assignments[episode.id] || null}
              isHidden={isEpisodeHidden(episode.id)}
            />
          ))}
        </div>
      )}

      {(groupedEpisodes ? filteredEpisodes.length === 0 : sectionFilteredEpisodes.length === 0) && (
        <p className="py-8 text-center text-muted-foreground">
          لا توجد حلقات مطابقة للبحث
        </p>
      )}

      {/* Create section dialog */}
      {showCreateDialog && (
        <CreateSectionDialog onClose={() => setShowCreateDialog(false)} />
      )}
    </div>
  )
}
