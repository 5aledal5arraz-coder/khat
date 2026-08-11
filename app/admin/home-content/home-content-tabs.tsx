"use client"

import { useState, useTransition, useRef } from "react"
import Image from "next/image"
import type { Episode, Guest } from "@/types/database"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { runAction } from "@/app/admin/components/run-action"
import { saveFeaturedEpisodesAction, setFeaturedModeAction, setFeaturedFilterAction } from "./featured-actions"
import { createTopicAction, deleteTopicAction, setEpisodeTopicsAction } from "./topics-actions"
import { MANUAL_SLOTS, GUEST_STRIP_LIMIT_MIN, GUEST_STRIP_LIMIT_MAX } from "@/lib/homepage/hall"
import type { Topic } from "@/lib/queries/topics"
import { saveThinkersAction, setThinkersModeAction, setThinkersHiddenAction, setThinkersLimitAction } from "./thinkers-actions"
import { TeaserTab } from "./teaser-tab"
import type { HomepageFeaturedRow } from "@/lib/queries/homepage-featured"
import type { HomepageThinkerRow } from "@/lib/queries/homepage-thinkers"
import type { TeaserConfig } from "@/types/teaser"
import type { UpcomingEpisodeOption } from "@/lib/teaser"
import { Star, Brain, Clapperboard, Loader2, Check, Pencil, ToggleLeft, ToggleRight, Upload, X, ImageIcon, Tags, Plus, Trash2, Eye, EyeOff } from "lucide-react"

// ─── Types ──────────────────────────────────────────────────

interface LatestEpisode {
  id: string
  title: string
  slug: string
  description: string | null
  youtube_url: string
  thumbnail_url: string | null
  episode_number: number | null
  guest_id: string | null
  release_date: string
}

interface LatestGuest {
  id: string
  name: string
  bio: string | null
  photo_url: string | null
}

interface Props {
  allEpisodes: Episode[]
  featuredRows: HomepageFeaturedRow[]
  latestEpisodes: LatestEpisode[]
  allGuests: Guest[]
  thinkerRows: HomepageThinkerRow[]
  latestGuests: LatestGuest[]
  featuredMode: "auto" | "manual"
  thinkersMode: "auto" | "manual"
  /** Whether the guest strip is hidden from the homepage entirely. */
  thinkersHidden: boolean
  /** How many faces the guest strip shows. */
  thinkersLimit: number
  /** Serialized «قاعة الحلقات» auto filter, e.g. "topic:الغزو". */
  featuredFilter: string
  /** Programme lanes an auto filter can point at. */
  programs: { slug: string; name: string; count: number }[]
  topics: Topic[]
  /** Every published episode — clips and «سالفة» carry topics too. */
  taggableEpisodes: Episode[]
  /** Topic ids already on each episode, keyed by episode id. */
  episodeTopics: Record<string, string[]>
  teasers: TeaserConfig[]
  upcomingEpisodes: UpcomingEpisodeOption[]
  /** Pending teaser questions; null when the count could not be read. */
  pendingQuestions: number | null
}

// ─── Image Uploader ─────────────────────────────────────────

function ImageUploader({
  currentImage,
  fallbackImage,
  onUpload,
  onRemove,
  disabled,
}: {
  currentImage: string | null
  fallbackImage: string
  onUpload: (url: string) => void
  onRemove: () => void
  disabled?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const isCustom = !!currentImage
  const displayImage = currentImage || fallbackImage

  async function handleFile(file: File) {
    setError("")
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/admin/home/upload-image", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        onUpload(data.url)
      } else {
        setError(data.error || "فشل الرفع")
      }
    } catch {
      setError("حدث خطأ أثناء الرفع")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-border/30 bg-black/20">
        <div className="relative aspect-video">
          {displayImage ? (
            <Image
              src={displayImage}
              alt=""
              fill
              className="object-cover"
              unoptimized={displayImage.startsWith("/home/")}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}
          {/* Badge */}
          <div className="absolute start-2 top-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              isCustom
                ? "bg-primary/90 text-primary-foreground"
                : "bg-black/60 text-white/70"
            }`}>
              {isCustom ? "صورة مخصصة" : "صورة افتراضية"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ""
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="h-7 gap-1.5 text-[11px]"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {isCustom ? "استبدال" : "رفع صورة"}
        </Button>
        {isCustom && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={disabled || uploading}
            className="h-7 gap-1 text-[11px] text-destructive hover:text-destructive"
          >
            <X className="h-3 w-3" />
            إزالة
          </Button>
        )}
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}

// ─── Mode Toggle ────────────────────────────────────────────

function ModeToggle({
  mode,
  onToggle,
  disabled,
}: {
  mode: "auto" | "manual"
  onToggle: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium transition-all hover:bg-muted disabled:opacity-50"
    >
      {mode === "auto" ? (
        <>
          <ToggleRight className="h-4 w-4 text-green-700" />
          <span className="text-green-700">تلقائي</span>
        </>
      ) : (
        <>
          <ToggleLeft className="h-4 w-4 text-primary" />
          <span className="text-primary">يدوي</span>
        </>
      )}
    </button>
  )
}

// ─── Featured Episodes Tab ──────────────────────────────────

interface FeaturedSlot {
  episode_id: string
  custom_quote: string
  custom_description: string
  custom_image: string
}

function getYouTubeThumbnail(youtubeUrl: string): string {
  const videoId = youtubeUrl?.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1] || ""
  return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : ""
}

function FeaturedTab({
  allEpisodes,
  featuredRows,
  latestEpisodes,
  guests,
  initialMode,
  initialFilter,
  programs,
  topics,
}: {
  allEpisodes: Episode[]
  featuredRows: HomepageFeaturedRow[]
  latestEpisodes: LatestEpisode[]
  guests: Guest[]
  initialMode: "auto" | "manual"
  initialFilter: string
  programs: { slug: string; name: string; count: number }[]
  topics: Topic[]
}) {
  const [filter, setFilter] = useState(initialFilter)
  const [mode, setMode] = useState(initialMode)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  function buildInitialSlots(): FeaturedSlot[] {
    if (mode === "manual" && featuredRows.length > 0) {
      return featuredRows.map((r) => ({
        episode_id: r.episode_id,
        custom_quote: r.custom_quote || "",
        custom_description: r.custom_description || "",
        custom_image: r.custom_image || "",
      }))
    }
    return latestEpisodes.slice(0, 3).map((ep) => {
      const existing = featuredRows.find((r) => r.episode_id === ep.id)
      return {
        episode_id: ep.id,
        custom_quote: existing?.custom_quote || "",
        custom_description: existing?.custom_description || "",
        custom_image: existing?.custom_image || "",
      }
    })
  }

  const [slots, setSlots] = useState<FeaturedSlot[]>(buildInitialSlots)

  function getEpisodeInfo(episodeId: string) {
    return allEpisodes.find((e) => e.id === episodeId)
  }

  function getGuestName(guestId: string | null | undefined) {
    if (!guestId) return ""
    return guests.find((g) => g.id === guestId)?.name || ""
  }

  function handleFilterChange(next: string) {
    if (!next) return
    setError(null)
    setFilter(next)
    startTransition(async () => {
      const outcome = await runAction(() => setFeaturedFilterAction(next))
      if (!outcome.ok) setError(outcome.message)
    })
  }

  function handleToggleMode() {
    const newMode = mode === "auto" ? "manual" : "auto"
    setError(null)
    startTransition(async () => {
      const outcome = await runAction(() => setFeaturedModeAction(newMode))
      // The local `setMode` is what the whole panel renders from, so flipping
      // it after a failed write left the screen showing manual mode while the
      // homepage kept serving auto.
      if (!outcome.ok) return setError(outcome.message)
      setMode(newMode)
      if (newMode === "auto") {
        setSlots(
          latestEpisodes.slice(0, 3).map((ep) => {
            const existing = featuredRows.find((r) => r.episode_id === ep.id)
            return {
              episode_id: ep.id,
              custom_quote: existing?.custom_quote || "",
              custom_description: existing?.custom_description || "",
              custom_image: existing?.custom_image || "",
            }
          })
        )
      }
    })
  }

  function handleEpisodeChange(idx: number, episodeId: string) {
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = { episode_id: episodeId, custom_quote: "", custom_description: "", custom_image: "" }
      return next
    })
  }

  function handleFieldChange(idx: number, field: keyof FeaturedSlot, value: string) {
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const outcome = await runAction(() =>
        saveFeaturedEpisodesAction(
          slots.map((s, i) => ({
            position: i + 1,
            episode_id: s.episode_id,
            custom_quote: s.custom_quote,
            custom_description: s.custom_description,
            custom_image: s.custom_image,
          }))
        )
      )
      // «تم الحفظ» used to appear whatever happened — the button reported
      // success for a write that never reached the database.
      if (!outcome.ok) return setError(outcome.message)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  while (slots.length < 3) {
    slots.push({ episode_id: "", custom_quote: "", custom_description: "", custom_image: "" })
  }

  function addSlot() {
    setSlots((prev) => [...prev, { episode_id: "", custom_quote: "", custom_description: "", custom_image: "" }])
  }

  function removeSlot(idx: number) {
    setSlots((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">قاعة الحلقات</h2>
          <ModeToggle mode={mode} onToggle={handleToggleMode} disabled={pending} />
        </div>
        <Button onClick={handleSave} disabled={pending} size="sm" className="gap-2">
          {saved ? <Check className="h-4 w-4" /> : pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saved ? "تم الحفظ" : "حفظ"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive" data-save-error>
          {error}
        </div>
      )}

      {mode === "auto" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <label htmlFor="hall-filter" className="text-sm font-semibold">الفلتر</label>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          </div>
          <select
            id="hall-filter"
            value={filter}
            onChange={(e) => handleFilterChange(e.target.value)}
            disabled={pending}
            className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm"
          >
            <option value="newest">الأحدث</option>
            <option value="most_viewed">الأكثر مشاهدة</option>
            {programs.length > 0 && (
              <optgroup label="حسب البرنامج">
                {programs.map((p) => (
                  <option key={p.slug} value={`program:${p.slug}`}>{p.name} ({p.count})</option>
                ))}
              </optgroup>
            )}
            <optgroup label="حسب الموضوع">
              {topics.length === 0 ? (
                <option value="" disabled>لا توجد مواضيع — أضفها من تبويب «المواضيع»</option>
              ) : (
                topics.map((t) => (
                  <option key={t.id} value={`topic:${t.slug}`}>{t.name} ({t.episodeCount})</option>
                ))
              )}
            </optgroup>
          </select>
          <p className="text-xs text-muted-foreground">
            الفلتر يحدد الحلقات المعروضة في الصفحة الرئيسية <strong>وعنوان القسم</strong> — فلو
            اخترت موضوعاً، يصير العنوان اسم الموضوع بدل «أحدث الحلقات». تُعرض كل الحلقات المطابقة،
            ما عدا الحلقة المميزة في الأعلى.
          </p>
          {filter.startsWith("topic:") &&
            topics.find((t) => `topic:${t.slug}` === filter)?.episodeCount === 0 && (
              <p className="text-xs font-semibold text-amber-700">
                ⚠︎ هذا الموضوع ما فيه ولا حلقة موسومة — القسم بيختفي من الصفحة الرئيسية. وسم الحلقات من تبويب «المواضيع».
              </p>
            )}
        </div>
      )}

      <div className="space-y-4">
        {slots.map((slot, idx) => {
          const ep = getEpisodeInfo(slot.episode_id)
          const guestName = ep ? getGuestName(ep.guest_id) : ""
          const displayQuote = slot.custom_quote || ""
          const displayDesc = slot.custom_description || ep?.description || ""
          const fallbackImage = ep ? getYouTubeThumbnail(ep.youtube_url) : ""
          const isEditing = editingIdx === idx

          return (
            <Card key={idx}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wider text-primary">الموضع {idx + 1}</span>
                  {mode === "manual" && slots.length > 1 ? (
                    <Button variant="ghost" size="sm" onClick={() => removeSlot(idx)} className="h-7 gap-1 text-xs text-destructive">
                      <Trash2 className="h-3 w-3" /> إزالة
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => setEditingIdx(isEditing ? null : idx)} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />
                    {isEditing ? "إغلاق" : "تعديل"}
                  </Button>
                </div>

                {mode === "manual" ? (
                  <select
                    value={slot.episode_id}
                    onChange={(e) => handleEpisodeChange(idx, e.target.value)}
                    className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm"
                  >
                    <option value="">اختر حلقة...</option>
                    {allEpisodes.map((e) => (
                      <option key={e.id} value={e.id}>{e.title}</option>
                    ))}
                  </select>
                ) : ep ? (
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-sm font-medium">{ep.title}</p>
                    {guestName && <p className="text-xs text-muted-foreground">{guestName}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">لا توجد حلقة</p>
                )}

                {/* Image upload */}
                {slot.episode_id && (
                  <ImageUploader
                    currentImage={slot.custom_image || null}
                    fallbackImage={fallbackImage}
                    onUpload={(url) => handleFieldChange(idx, "custom_image", url)}
                    onRemove={() => handleFieldChange(idx, "custom_image", "")}
                    disabled={pending}
                  />
                )}

                {/* Content preview */}
                {slot.episode_id && !isEditing && (
                  <div className="space-y-2 rounded-lg border border-border/20 bg-muted/10 p-3">
                    {displayQuote && <p className="text-sm italic text-muted-foreground">&ldquo;{displayQuote}&rdquo;</p>}
                    {displayDesc && <p className="text-xs text-muted-foreground">{displayDesc}</p>}
                    {!displayQuote && !displayDesc && (
                      <p className="text-xs text-muted-foreground">لا يوجد محتوى بعد — اضغط &ldquo;تعديل&rdquo; لإضافة محتوى مخصص</p>
                    )}
                  </div>
                )}

                {isEditing && slot.episode_id && (
                  <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">اقتباس مخصص</label>
                      <textarea
                        value={slot.custom_quote}
                        onChange={(e) => handleFieldChange(idx, "custom_quote", e.target.value)}
                        placeholder="اكتب اقتباساً مخصصاً..."
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm min-h-[60px] resize-none"
                        dir="auto"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">وصف مخصص</label>
                      <textarea
                        value={slot.custom_description}
                        onChange={(e) => handleFieldChange(idx, "custom_description", e.target.value)}
                        placeholder="اكتب وصفاً مخصصاً أو اترك فارغاً لاستخدام الوصف الأصلي..."
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm min-h-[60px] resize-none"
                        dir="auto"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {mode === "manual" && slots.length < MANUAL_SLOTS ? (
        <Button variant="outline" size="sm" onClick={addSlot} className="gap-1">
          <Plus className="h-4 w-4" /> أضف حلقة
        </Button>
      ) : null}
      {mode === "manual" && slots.length >= MANUAL_SLOTS ? (
        <p className="text-xs text-muted-foreground">بلغت الحد الأقصى ({MANUAL_SLOTS} حلقة).</p>
      ) : null}
    </div>
  )
}


// ─── Topics Tab ─────────────────────────────────────────────
//
// The subject axis. `episode_categories` only ever held the three PROGRAMMES
// («الموسم الاول», «سالفة», «مقاطع خط»), so nothing in the archive could answer
// "which episodes are about the invasion?". `topics` + `episode_topics` existed
// in the schema and were empty on production; this is the screen that fills
// them. It also revives /topics/[slug], which has been live and blank.

function TopicsTab({
  allEpisodes,
  topics,
  episodeTopics,
}: {
  allEpisodes: Episode[]
  topics: Topic[]
  episodeTopics: Record<string, string[]>
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [newTopic, setNewTopic] = useState("")
  const [tags, setTags] = useState<Record<string, string[]>>(episodeTopics)
  const [savedEp, setSavedEp] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  function addTopic() {
    const name = newTopic.trim()
    if (!name) return
    setError(null)
    startTransition(async () => {
      const outcome = await runAction(() => createTopicAction(name))
      if (!outcome.ok) return setError(outcome.message)
      setNewTopic("")
    })
  }

  function removeTopic(id: string) {
    setError(null)
    startTransition(async () => {
      const outcome = await runAction(() => deleteTopicAction(id))
      if (!outcome.ok) setError(outcome.message)
    })
  }

  function toggle(episodeId: string, topicId: string) {
    const current = tags[episodeId] ?? []
    const next = current.includes(topicId)
      ? current.filter((t) => t !== topicId)
      : [...current, topicId]
    // Optimistic: the checkbox must respond to the click, not to the round-trip.
    setTags((prev) => ({ ...prev, [episodeId]: next }))
    setError(null)
    startTransition(async () => {
      const outcome = await runAction(() => setEpisodeTopicsAction(episodeId, next))
      if (!outcome.ok) {
        setTags((prev) => ({ ...prev, [episodeId]: current }))   // put it back
        return setError(outcome.message)
      }
      setSavedEp(episodeId)
      setTimeout(() => setSavedEp(null), 1200)
    })
  }

  const visible = query.trim()
    ? allEpisodes.filter((e) => e.title.includes(query.trim()))
    : allEpisodes

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">المواضيع</h2>
        {pending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive" data-save-error>
          {error}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex gap-2">
            <input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTopic() }}
              placeholder="اسم موضوع جديد — مثلاً: الغزو"
              className="h-10 flex-1 rounded-lg border border-border/50 bg-background px-3 text-sm"
            />
            <Button onClick={addTopic} disabled={pending || !newTopic.trim()} size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> أضف
            </Button>
          </div>
          {topics.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد مواضيع بعد. أضف موضوعاً ثم وسم الحلقات تحته.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topics.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs">
                  {t.name}
                  <span className="text-muted-foreground">{t.episodeCount}</span>
                  <button
                    onClick={() => removeTopic(t.id)}
                    disabled={pending}
                    aria-label={`حذف ${t.name}`}
                    className="text-destructive hover:opacity-70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {topics.length > 0 && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في الحلقات..."
            className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm"
          />
          <div className="space-y-3">
            {visible.map((ep) => (
              <Card key={ep.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{ep.title}</p>
                    {savedEp === ep.id ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {topics.map((t) => {
                      const on = (tags[ep.id] ?? []).includes(t.id)
                      return (
                        <button
                          key={t.id}
                          onClick={() => toggle(ep.id, t.id)}
                          disabled={pending}
                          className={
                            "rounded-full border px-3 py-1 text-xs transition-colors " +
                            (on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:border-primary/50")
                          }
                        >
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
            {visible.length === 0 ? (
              <p className="text-xs text-muted-foreground">ما فيه حلقة بهذا الاسم.</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Thinkers Tab ───────────────────────────────────────────

interface ThinkerSlot {
  guest_id: string
  custom_title: string
  custom_description: string
  custom_image: string
  /** «قريباً» — show this guest before their episode airs. */
  is_upcoming: boolean
}

function ThinkersTab({
  allGuests,
  thinkerRows,
  latestGuests,
  initialMode,
  initialHidden,
  initialLimit,
}: {
  allGuests: Guest[]
  thinkerRows: HomepageThinkerRow[]
  latestGuests: LatestGuest[]
  initialMode: "auto" | "manual"
  /** Whether the whole strip is currently hidden from the homepage. */
  initialHidden: boolean
  /** How many faces the strip shows. */
  initialLimit: number
}) {
  const [mode, setMode] = useState(initialMode)
  const [hidden, setHidden] = useState(initialHidden)
  const [limit, setLimit] = useState(initialLimit)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  function buildInitialSlots(): ThinkerSlot[] {
    if (mode === "manual" && thinkerRows.length > 0) {
      return thinkerRows.map((r) => ({
        guest_id: r.guest_id,
        custom_title: r.custom_title || "",
        custom_description: r.custom_description || "",
        custom_image: r.custom_image || "",
        is_upcoming: r.is_upcoming === true,
      }))
    }
    return latestGuests.slice(0, 3).map((g) => {
      const existing = thinkerRows.find((r) => r.guest_id === g.id)
      return {
        guest_id: g.id,
        custom_title: existing?.custom_title || "",
        custom_description: existing?.custom_description || "",
        custom_image: existing?.custom_image || "",
        is_upcoming: existing?.is_upcoming === true,
      }
    })
  }

  const [slots, setSlots] = useState<ThinkerSlot[]>(buildInitialSlots)

  function getGuestInfo(guestId: string) {
    return allGuests.find((g) => g.id === guestId)
  }

  function handleToggleHidden() {
    const next = !hidden
    setError(null)
    startTransition(async () => {
      const outcome = await runAction(() => setThinkersHiddenAction(next))
      if (!outcome.ok) return setError(outcome.message)
      setHidden(next)
    })
  }

  function handleLimitChange(next: number) {
    // Clamped here as well as on the server. The stepper cannot produce an out
    // of range value, but a saved 0 would empty the strip with no explanation
    // and this is the control that would be blamed for it.
    const clamped = Math.min(GUEST_STRIP_LIMIT_MAX, Math.max(GUEST_STRIP_LIMIT_MIN, next))
    if (clamped === limit) return
    setError(null)
    setLimit(clamped)
    startTransition(async () => {
      const outcome = await runAction(() => setThinkersLimitAction(clamped))
      if (!outcome.ok) {
        setLimit(limit)
        setError(outcome.message)
      }
    })
  }

  function handleToggleMode() {
    const newMode = mode === "auto" ? "manual" : "auto"
    setError(null)
    startTransition(async () => {
      const outcome = await runAction(() => setThinkersModeAction(newMode))
      if (!outcome.ok) return setError(outcome.message)
      setMode(newMode)
      if (newMode === "auto") {
        setSlots(
          latestGuests.slice(0, 3).map((g) => {
            const existing = thinkerRows.find((r) => r.guest_id === g.id)
            return {
              guest_id: g.id,
              custom_title: existing?.custom_title || "",
              custom_description: existing?.custom_description || "",
              custom_image: existing?.custom_image || "",
              is_upcoming: existing?.is_upcoming === true,
            }
          })
        )
      }
    })
  }

  function handleGuestChange(idx: number, guestId: string) {
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = { guest_id: guestId, custom_title: "", custom_description: "", custom_image: "", is_upcoming: false }
      return next
    })
  }

  function handleUpcomingChange(idx: number, checked: boolean) {
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], is_upcoming: checked }
      return next
    })
  }

  function handleFieldChange(idx: number, field: keyof ThinkerSlot, value: string) {
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const outcome = await runAction(() =>
        saveThinkersAction(
          slots
            .filter((s) => s.guest_id)
            .map((s, i) => ({
              position: i + 1,
              guest_id: s.guest_id,
              custom_title: s.custom_title,
              custom_description: s.custom_description,
              custom_image: s.custom_image,
              is_upcoming: s.is_upcoming,
            }))
        )
      )
      if (!outcome.ok) return setError(outcome.message)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  // The editor offers as many slots as the strip is configured to show. It was
  // a hardcoded 3 — so manual mode could never hold more than three guests, no
  // matter what the strip was meant to display.
  while (slots.length < limit) {
    slots.push({ guest_id: "", custom_title: "", custom_description: "", custom_image: "", is_upcoming: false })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">معرض العقول</h2>
          <ModeToggle mode={mode} onToggle={handleToggleMode} disabled={pending} />
          {/* Separate from the mode toggle beside it, and deliberately so: mode
              answers "which guests", this answers "any guests". Hiding the rail
              between seasons must not cost him the manual list he built. */}
          <button
            onClick={handleToggleHidden}
            disabled={pending}
            className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium transition-all hover:bg-muted disabled:opacity-50"
          >
            {hidden ? (
              <>
                <EyeOff className="h-4 w-4 text-destructive" />
                <span className="text-destructive">الشريط مخفي</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 text-green-700" />
                <span className="text-green-700">الشريط ظاهر</span>
              </>
            )}
          </button>

          {/* The count. A stepper rather than a free text field: the value has a
              real range (1–40) and typing is how a 0 or a 500 gets in. */}
          <div className="flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1">
            <span className="px-1 text-xs text-muted-foreground">عدد الضيوف</span>
            <button
              onClick={() => handleLimitChange(limit - 1)}
              disabled={pending || limit <= GUEST_STRIP_LIMIT_MIN}
              className="flex h-6 w-6 items-center justify-center rounded-md text-caption font-bold transition-colors hover:bg-muted disabled:opacity-30"
              aria-label="أقل"
            >
              −
            </button>
            <span className="w-6 text-center text-xs font-bold tabular-nums">{limit}</span>
            <button
              onClick={() => handleLimitChange(limit + 1)}
              disabled={pending || limit >= GUEST_STRIP_LIMIT_MAX}
              className="flex h-6 w-6 items-center justify-center rounded-md text-caption font-bold transition-colors hover:bg-muted disabled:opacity-30"
              aria-label="أكثر"
            >
              +
            </button>
          </div>
        </div>
        <Button onClick={handleSave} disabled={pending} size="sm" className="gap-2">
          {saved ? <Check className="h-4 w-4" /> : pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saved ? "تم الحفظ" : "حفظ"}
        </Button>
      </div>

      {hidden && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          شريط الضيوف لا يظهر على الصفحة الرئيسية الآن. الاختيارات أدناه محفوظة وتعود كما هي عند الإظهار.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive" data-save-error>
          {error}
        </div>
      )}

      {mode === "auto" && (
        <p className="text-xs text-muted-foreground">
          يتم عرض آخر 3 ضيوف ظهروا في الحلقات تلقائياً. التبديل إلى الوضع اليدوي يتيح اختيار ضيوف محددين.
        </p>
      )}

      <div className="space-y-4">
        {slots.map((slot, idx) => {
          const guest = getGuestInfo(slot.guest_id)
          const displayTitle = slot.custom_title || ""
          const displayDesc = slot.custom_description || guest?.bio || ""
          const fallbackImage = guest?.photo_url || ""
          const isEditing = editingIdx === idx

          return (
            <Card key={idx}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wider text-primary">الموضع {idx + 1}</span>
                  <Button variant="ghost" size="sm" onClick={() => setEditingIdx(isEditing ? null : idx)} className="h-7 gap-1 text-xs">
                    <Pencil className="h-3 w-3" />
                    {isEditing ? "إغلاق" : "تعديل"}
                  </Button>
                </div>

                {mode === "manual" ? (
                  <select
                    value={slot.guest_id}
                    onChange={(e) => handleGuestChange(idx, e.target.value)}
                    className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm"
                  >
                    <option value="">اختر ضيف...</option>
                    {allGuests.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                ) : guest ? (
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-sm font-medium">{guest.name}</p>
                    {guest.bio && <p className="text-xs text-muted-foreground line-clamp-1">{guest.bio}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">لا يوجد ضيف</p>
                )}

                {/* Image upload */}
                {slot.guest_id && (
                  <ImageUploader
                    currentImage={slot.custom_image || null}
                    fallbackImage={fallbackImage}
                    onUpload={(url) => handleFieldChange(idx, "custom_image", url)}
                    onRemove={() => handleFieldChange(idx, "custom_image", "")}
                    disabled={pending}
                  />
                )}

                {/* Content preview */}
                {slot.guest_id && !isEditing && (
                  <div className="space-y-2 rounded-lg border border-border/20 bg-muted/10 p-3">
                    {displayTitle && <p className="text-xs font-bold tracking-wider text-primary">{displayTitle}</p>}
                    {displayDesc && <p className="text-xs text-muted-foreground">{displayDesc}</p>}
                    {!displayTitle && !displayDesc && (
                      <p className="text-xs text-muted-foreground">لا يوجد محتوى بعد — اضغط &ldquo;تعديل&rdquo; لإضافة محتوى مخصص</p>
                    )}
                  </div>
                )}

                {isEditing && slot.guest_id && (
                  <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">لقب مخصص</label>
                      <input
                        type="text"
                        value={slot.custom_title}
                        onChange={(e) => handleFieldChange(idx, "custom_title", e.target.value)}
                        placeholder="مثال: باحث في التاريخ الإسلامي"
                        className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                        dir="auto"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">وصف مخصص</label>
                      <textarea
                        value={slot.custom_description}
                        onChange={(e) => handleFieldChange(idx, "custom_description", e.target.value)}
                        placeholder="اكتب وصفاً مخصصاً أو اترك فارغاً..."
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm min-h-[60px] resize-none"
                        dir="auto"
                      />
                    </div>

                    {/* «قريباً» — the only field that lets a guest appear before
                        their episode exists, which is the whole point of adding
                        a Season-2 name here ahead of the season. The note under
                        it states the consequence out loud: the card stops being
                        a link, because a guest with no episode has a blank
                        guest page and a teaser that leads nowhere is worse than
                        one that stays put. */}
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/40 bg-background/60 p-3">
                      <input
                        type="checkbox"
                        checked={slot.is_upcoming}
                        onChange={(e) => handleUpcomingChange(idx, e.target.checked)}
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                      />
                      <span>
                        <span className="block text-xs font-semibold">ضيف قادم — «قريباً»</span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          يظهر في مقدمة شريط الضيوف بإطار متقطّع وشارة «قريباً»، وبدون رابط
                          حتى تنزل حلقته.
                        </span>
                      </span>
                    </label>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

export function HomeContentTabs({
  allEpisodes,
  featuredRows,
  latestEpisodes,
  allGuests,
  thinkerRows,
  latestGuests,
  featuredMode,
  thinkersMode,
  thinkersHidden,
  thinkersLimit,
  featuredFilter,
  programs,
  topics,
  taggableEpisodes,
  episodeTopics,
  teasers,
  upcomingEpisodes,
  pendingQuestions,
}: Props) {
  return (
    <Tabs defaultValue="gallery">
      <TabsList className="mb-6 w-full justify-start">
        <TabsTrigger value="gallery" className="gap-2">
          <Star className="h-4 w-4" />
          قاعة الحلقات
        </TabsTrigger>
        <TabsTrigger value="thinkers" className="gap-2">
          <Brain className="h-4 w-4" />
          معرض العقول
        </TabsTrigger>
        <TabsTrigger value="topics" className="gap-2">
          <Tags className="h-4 w-4" />
          المواضيع
        </TabsTrigger>
        <TabsTrigger value="teaser" className="gap-2">
          <Clapperboard className="h-4 w-4" />
          التيزر
        </TabsTrigger>
      </TabsList>

      <TabsContent value="gallery">
        <FeaturedTab
          allEpisodes={allEpisodes}
          featuredRows={featuredRows}
          latestEpisodes={latestEpisodes}
          guests={allGuests}
          initialMode={featuredMode}
          initialFilter={featuredFilter}
          programs={programs}
          topics={topics}
        />
      </TabsContent>

      <TabsContent value="thinkers">
        <ThinkersTab
          allGuests={allGuests}
          thinkerRows={thinkerRows}
          latestGuests={latestGuests}
          initialMode={thinkersMode}
          initialHidden={thinkersHidden}
          initialLimit={thinkersLimit}
        />
      </TabsContent>

      <TabsContent value="topics">
        <TopicsTab allEpisodes={taggableEpisodes} topics={topics} episodeTopics={episodeTopics} />
      </TabsContent>

      <TabsContent value="teaser">
        <TeaserTab
          teasers={teasers}
          upcomingEpisodes={upcomingEpisodes}
          pendingQuestions={pendingQuestions}
        />
      </TabsContent>
    </Tabs>
  )
}
