"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  Save,
  Eye,
  EyeOff,
  Send,
  X,
  Check,
  Podcast,
  Tag,
  Clock,
  FileText,
  ChevronDown,
  Trash2,
  Settings,
} from "lucide-react"
import { getDrafts, saveDraft, deleteDraft } from "@/lib/space-storage"
import { toast } from "@/lib/use-toast"
import { allTags } from "@/lib/space-feed"
import { createArticle, saveDraftApi, deleteDraftApi } from "@/lib/space-api"
import { useAuth } from "@/components/providers/auth-provider"
import type { Draft } from "@/types/space"

export interface EpisodeOption {
  id: string
  title: string
  slug: string
}

interface WriteEditorProps {
  episodes: EpisodeOption[]
}

export function WriteEditor({ episodes }: WriteEditorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  // Form state
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null)

  // UI state
  const [isPreview, setIsPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [showEpisodeSelector, setShowEpisodeSelector] = useState(false)
  const [showTagSelector, setShowTagSelector] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDraftsDropdown, setShowDraftsDropdown] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [showMobileSettings, setShowMobileSettings] = useState(false)

  // Get selected episode details
  const selectedEpisode = selectedEpisodeId
    ? episodes.find((e) => e.id === selectedEpisodeId)
    : null

  // Calculate read time
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length
  const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))

  // Load draft from URL param or prompt
  // Hydration: Set mounted state and load data from localStorage
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    setDrafts(getDrafts())

    const draftId = searchParams.get("draft")
    const prompt = searchParams.get("prompt")
    const episodeSlug = searchParams.get("episode")

    if (draftId) {
      const allDrafts = getDrafts()
      const draft = allDrafts.find((d) => d.id === draftId)
      if (draft) {
        setCurrentDraftId(draft.id)
        setTitle(draft.title)
        setContent(draft.content)
        setSelectedTags(draft.tags || [])
        if (draft.episodeId) {
          setSelectedEpisodeId(draft.episodeId)
        }
        setLastSaved(new Date(draft.lastSaved))
      }
    } else if (prompt) {
      setContent(prompt + "\n\n")
      if (episodeSlug) {
        const episode = episodes.find((e) => e.slug === episodeSlug)
        if (episode) {
          setSelectedEpisodeId(episode.id)
        }
      }
    }
  }, [searchParams, episodes])

  // Auto-save draft
  const handleSaveDraft = useCallback(() => {
    if (!title.trim() && !content.trim()) return

    setIsSaving(true)

    const draft: Draft = {
      id: currentDraftId || `draft-${crypto.randomUUID()}`,
      title: title.trim(),
      content: content.trim(),
      tags: selectedTags,
      episodeId: selectedEpisodeId || undefined,
      episodeSlug: selectedEpisode?.slug,
      episodeTitle: selectedEpisode?.title,
      lastSaved: new Date().toISOString(),
    }

    saveDraft(draft)
    setCurrentDraftId(draft.id)
    setLastSaved(new Date())
    setDrafts(getDrafts()) // Refresh drafts list

    setTimeout(() => setIsSaving(false), 500)
  }, [title, content, selectedTags, selectedEpisodeId, selectedEpisode, currentDraftId])

  // Auto-save every 30 seconds if there are changes
  useEffect(() => {
    if (!mounted) return

    const interval = setInterval(() => {
      if (title.trim() || content.trim()) {
        handleSaveDraft()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [mounted, title, content, handleSaveDraft])

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag].slice(0, 5)
    )
  }

  // Handle publish
  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: "خطأ في النشر",
        description: "يرجى إدخال عنوان ومحتوى للمقال",
        variant: "destructive",
        duration: 2000,
      })
      return
    }

    if (title.trim().length < 3) {
      toast({
        title: "خطأ في النشر",
        description: "عنوان المقال يجب أن يكون ٣ أحرف على الأقل",
        variant: "destructive",
        duration: 2000,
      })
      return
    }

    if (content.trim().length < 50) {
      toast({
        title: "خطأ في النشر",
        description: "محتوى المقال يجب أن يكون ٥٠ حرفاً على الأقل",
        variant: "destructive",
        duration: 2000,
      })
      return
    }

    setIsSaving(true)

    // If user is logged in, publish via API
    if (user) {
      const { error } = await createArticle({
        title: title.trim(),
        content: content.trim(),
        tags: selectedTags,
        episode_id: selectedEpisodeId || undefined,
        episode_title: selectedEpisode?.title,
        episode_slug: selectedEpisode?.slug,
      })

      if (error) {
        toast({
          title: "خطأ في النشر",
          description: error,
          variant: "destructive",
          duration: 3000,
        })
        setIsSaving(false)
        return
      }

      // Clean up local draft
      if (currentDraftId) {
        deleteDraft(currentDraftId)
        deleteDraftApi(currentDraftId).catch(() => {})
      }
    } else {
      // Fallback for mock mode: just delete the draft
      if (currentDraftId) {
        deleteDraft(currentDraftId)
      }
    }

    setIsSaving(false)

    toast({
      title: "تم نشر المقال بنجاح!",
      description: "يمكنك الآن مشاهدة مقالك في حبر",
      variant: "success",
      duration: 2000,
    })
    router.push("/space")
  }

  // Handle delete draft
  const handleDeleteDraft = () => {
    setShowDeleteConfirm(true)
  }

  const confirmDeleteDraft = () => {
    if (currentDraftId) {
      deleteDraft(currentDraftId)
      setDrafts(getDrafts()) // Refresh drafts list
      toast({
        title: "تم حذف المسودة",
        variant: "success",
        duration: 2000,
      })
      router.push("/space")
    }
    setShowDeleteConfirm(false)
  }

  // Delete a draft from the dropdown
  const handleDeleteDraftFromList = (draftId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    deleteDraft(draftId)
    setDrafts(getDrafts())
    toast({
      title: "تم حذف المسودة",
      variant: "success",
      duration: 2000,
    })
  }

  if (!mounted) {
    return (
      <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/space">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">كتابة مقال</h1>
            {lastSaved && (
              <p className="text-xs text-muted-foreground">
                آخر حفظ: {lastSaved.toLocaleTimeString("en-GB")}
              </p>
            )}
          </div>

          {/* My Drafts Dropdown */}
          {drafts.length > 0 && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDraftsDropdown(!showDraftsDropdown)}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                مسوداتي ({drafts.length})
                <ChevronDown className={`h-4 w-4 transition-transform ${showDraftsDropdown ? "rotate-180" : ""}`} />
              </Button>

              {showDraftsDropdown && (
                <div className="absolute top-full z-50 mt-1 w-72 rounded-lg border bg-popover p-2 shadow-lg start-0">
                  <p className="px-2 py-1 text-xs text-muted-foreground">المسودات المحفوظة</p>
                  <div className="max-h-64 overflow-y-auto">
                    {drafts.map((draft) => (
                      <div
                        key={draft.id}
                        className={`group flex items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-muted ${
                          currentDraftId === draft.id ? "bg-primary/10" : ""
                        }`}
                      >
                        <Link
                          href={`/space/write?draft=${draft.id}`}
                          className="flex-1 min-w-0"
                          onClick={() => setShowDraftsDropdown(false)}
                        >
                          <p className="text-sm font-medium line-clamp-1">
                            {draft.title || "بدون عنوان"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(() => { const d = new Date(draft.lastSaved); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` })()}
                          </p>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                          onClick={(e) => handleDeleteDraftFromList(draft.id, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 border-t pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-center text-xs"
                      onClick={() => {
                        setShowDraftsDropdown(false)
                        setCurrentDraftId(null)
                        setTitle("")
                        setContent("")
                        setSelectedTags([])
                        setSelectedEpisodeId(null)
                        setLastSaved(null)
                        router.push("/space/write")
                      }}
                    >
                      + مقال جديد
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPreview(!isPreview)}
            className="gap-2"
          >
            {isPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {isPreview ? "تحرير" : "معاينة"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ
          </Button>
          <Button size="sm" onClick={handlePublish} disabled={isSaving} className="gap-2">
            <Send className="h-4 w-4" />
            نشر
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Main Editor */}
        <div className="flex-1 space-y-4">
          {isPreview ? (
            // Preview Mode
            <Card>
              <CardContent className="p-6">
                <h1 className="mb-4 text-3xl font-bold">
                  {title || "عنوان المقال"}
                </h1>

                {selectedEpisode && (
                  <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Podcast className="h-4 w-4" />
                    <span>مرتبط بحلقة: {selectedEpisode.title}</span>
                  </div>
                )}

                {selectedTags.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {selectedTags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mb-4 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {readTimeMinutes} دقيقة قراءة
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    {wordCount} كلمة
                  </span>
                </div>

                <div className="prose dark:prose-invert max-w-none">
                  {content.split("\n").map((paragraph, i) => (
                    <p key={i} className="mb-4">
                      {paragraph || <br />}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            // Edit Mode
            <>
              <Input
                placeholder="عنوان المقال..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border-0 bg-transparent text-2xl font-bold placeholder:text-muted-foreground/50 focus-visible:ring-0"
              />

              <Textarea
                placeholder="اكتب مقالك هنا... شارك أفكارك وتجاربك مع مجتمع خط"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[400px] resize-none border-0 bg-transparent text-lg leading-relaxed placeholder:text-muted-foreground/50 focus-visible:ring-0"
              />

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {readTimeMinutes} دقيقة قراءة
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {wordCount} كلمة
                </span>
              </div>
            </>
          )}
        </div>

        {/* Sidebar - Hidden on mobile */}
        <aside className="hidden lg:block w-full shrink-0 space-y-4 lg:w-72">
          {/* Actions - Primary */}
          <Card>
            <CardContent className="space-y-2 p-4">
              <Button onClick={handlePublish} disabled={isSaving} className="w-full gap-2">
                <Send className="h-4 w-4" />
                نشر المقال
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="w-full gap-2"
              >
                {isSaving ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                حفظ كمسودة
              </Button>
              {currentDraftId && (
                <Button
                  variant="ghost"
                  onClick={handleDeleteDraft}
                  className="w-full text-destructive hover:text-destructive"
                >
                  حذف المسودة
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Article Settings - Combined Episode + Tags */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">إعدادات المقال</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Episode */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Podcast className="h-4 w-4 text-primary" />
                  الحلقة المرتبطة
                </div>
                {selectedEpisode ? (
                  <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-2">
                    <span className="text-sm line-clamp-1">{selectedEpisode.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setSelectedEpisodeId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => setShowEpisodeSelector(!showEpisodeSelector)}
                  >
                    <Podcast className="h-4 w-4" />
                    اختر حلقة (اختياري)
                  </Button>
                )}

                {showEpisodeSelector && !selectedEpisode && (
                  <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {episodes.map((episode) => (
                      <button
                        key={episode.id}
                        onClick={() => {
                          setSelectedEpisodeId(episode.id)
                          setShowEpisodeSelector(false)
                        }}
                        className="w-full rounded-lg p-2 text-start text-sm transition-colors hover:bg-muted"
                      >
                        {episode.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t" />

              {/* Tags */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="h-4 w-4 text-primary" />
                  الوسوم
                  <span className="text-xs text-muted-foreground">({selectedTags.length}/5)</span>
                </div>

                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="cursor-pointer gap-1 text-xs"
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                        <X className="h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => setShowTagSelector(!showTagSelector)}
                >
                  <Tag className="h-4 w-4" />
                  {selectedTags.length > 0 ? "تعديل الوسوم" : "اختر الوسوم"}
                </Button>

                {showTagSelector && (
                  <div className="flex flex-wrap gap-1.5 rounded-lg border p-2">
                    {allTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant={selectedTags.includes(tag) ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() => toggleTag(tag)}
                      >
                        {selectedTags.includes(tag) && <Check className="me-1 h-3 w-3" />}
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tips - Collapsible */}
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm font-semibold">
              نصائح للكتابة
              <svg
                className="h-4 w-4 transition-transform group-open:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li>• اختر عنواناً جذاباً يعكس محتوى مقالك</li>
                <li>• شارك تجربتك الشخصية مع الحلقة</li>
                <li>• اجعل مقالك سهل القراءة بتقسيمه لفقرات</li>
                <li>• يتم حفظ مقالك تلقائياً كل 30 ثانية</li>
              </ul>
            </div>
          </details>
        </aside>
      </div>

      {/* Mobile Floating Settings Button */}
      <div className="fixed bottom-6 end-6 lg:hidden z-40">
        <Button
          size="lg"
          className="h-14 w-14 rounded-full shadow-lg"
          onClick={() => setShowMobileSettings(true)}
        >
          <Settings className="h-6 w-6" />
        </Button>
      </div>

      {/* Mobile Settings Bottom Sheet */}
      {showMobileSettings && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMobileSettings(false)}
          />

          {/* Bottom Sheet */}
          <div className="absolute bottom-0 start-0 end-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background animate-in slide-in-from-bottom duration-300">
            {/* Handle */}
            <div className="sticky top-0 bg-background pt-3 pb-2">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-muted" />
            </div>

            <div className="px-4 pb-8 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">إعدادات المقال</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowMobileSettings(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <Button onClick={handlePublish} disabled={isSaving} className="w-full gap-2">
                  <Send className="h-4 w-4" />
                  نشر المقال
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="w-full gap-2"
                >
                  {isSaving ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  حفظ كمسودة
                </Button>
                {currentDraftId && (
                  <Button
                    variant="ghost"
                    onClick={handleDeleteDraft}
                    className="w-full text-destructive hover:text-destructive"
                  >
                    حذف المسودة
                  </Button>
                )}
              </div>

              {/* Episode Selection */}
              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Podcast className="h-4 w-4 text-primary" />
                  الحلقة المرتبطة
                </div>
                {selectedEpisode ? (
                  <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <span className="text-sm line-clamp-1">{selectedEpisode.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setSelectedEpisodeId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {episodes.map((episode) => (
                      <button
                        key={episode.id}
                        onClick={() => setSelectedEpisodeId(episode.id)}
                        className="w-full rounded-lg p-3 text-start text-sm transition-colors hover:bg-muted"
                      >
                        {episode.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tags Selection */}
              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="h-4 w-4 text-primary" />
                  الوسوم
                  <span className="text-xs text-muted-foreground">({selectedTags.length}/5)</span>
                </div>

                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="cursor-pointer gap-1 text-xs py-1.5"
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                        <X className="h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 rounded-lg border p-2">
                  {allTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={selectedTags.includes(tag) ? "default" : "outline"}
                      className="cursor-pointer text-xs py-1.5"
                      onClick={() => toggleTag(tag)}
                    >
                      {selectedTags.includes(tag) && <Check className="me-1 h-3 w-3" />}
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="mx-4 max-w-sm animate-in fade-in zoom-in duration-200">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold">حذف المسودة</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                هل أنت متأكد من حذف هذه المسودة؟ لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  إلغاء
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={confirmDeleteDraft}
                >
                  حذف
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
