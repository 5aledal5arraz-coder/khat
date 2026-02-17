"use client"

import { useState, useTransition } from "react"
import type { HomeQuote, DailyReflection, EmotionalPath, Episode } from "@/types/database"
import type { TeaserConfig, TeaserQuestion, TeaserQuestionStats } from "@/types/teaser"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  createQuoteAction,
  updateQuoteAction,
  deleteQuoteAction,
  publishQuoteAction,
  unpublishQuoteAction,
  scheduleQuoteAction,
} from "./quotes-actions"
import {
  createReflectionAction,
  updateReflectionAction,
  deleteReflectionAction,
  publishReflectionAction,
  unpublishReflectionAction,
} from "./reflections-actions"
import {
  assignEpisodeToPathAction,
  removeEpisodeFromPathAction,
} from "./paths-actions"
import { TeaserTab } from "./teaser-tab"
import { Plus, Trash2, Eye, EyeOff, Calendar, Quote, Lightbulb, Compass, Video } from "lucide-react"

interface Props {
  quotes: HomeQuote[]
  reflections: DailyReflection[]
  paths: EmotionalPath[]
  episodes: Episode[]
  teasers: TeaserConfig[]
  teaserQuestions: TeaserQuestion[]
  teaserStats: TeaserQuestionStats | null
}

const pathOptions: { slug: string; title: string }[] = [
  { slug: "understanding-people", title: "فهم الناس" },
  { slug: "motivation-work", title: "الدافع والعمل" },
  { slug: "faith-meaning", title: "الإيمان والمعنى" },
  { slug: "self-awareness", title: "وعي الذات" },
]

// ─── Quotes Tab ────────────────────────────────────────────────

function QuotesTab({ quotes, episodes }: { quotes: HomeQuote[]; episodes: Episode[] }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      await createQuoteAction(formData)
      setShowForm(false)
    })
  }

  function handleUpdate(id: string, formData: FormData) {
    startTransition(async () => {
      await updateQuoteAction(id, formData)
      setEditingId(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">الاقتباسات ({quotes.length})</h2>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          إضافة اقتباس
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form action={handleCreate} className="space-y-3">
              <textarea
                name="text"
                placeholder="نص الاقتباس..."
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="attribution"
                  placeholder="المصدر (الاسم)"
                  required
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                />
                <input
                  name="theme"
                  placeholder="الموضوع (اختياري)"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  name="episode_id"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  onChange={(e) => {
                    const ep = episodes.find((ep) => ep.id === e.target.value)
                    if (ep) {
                      const slugInput = e.target.form?.querySelector('[name="episode_slug"]') as HTMLInputElement
                      const titleInput = e.target.form?.querySelector('[name="episode_title"]') as HTMLInputElement
                      if (slugInput) slugInput.value = ep.slug
                      if (titleInput) titleInput.value = ep.title
                    }
                  }}
                >
                  <option value="">ربط بحلقة (اختياري)</option>
                  {episodes.map((ep) => (
                    <option key={ep.id} value={ep.id}>{ep.title}</option>
                  ))}
                </select>
                <input
                  name="scheduled_date"
                  type="date"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <input type="hidden" name="episode_slug" />
              <input type="hidden" name="episode_title" />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending}>حفظ</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>إلغاء</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {quotes.map((quote) => (
          <Card key={quote.id}>
            <CardContent className="p-4">
              {editingId === quote.id ? (
                <form action={(fd) => handleUpdate(quote.id, fd)} className="space-y-3">
                  <textarea
                    name="text"
                    defaultValue={quote.text}
                    required
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input name="attribution" defaultValue={quote.attribution} required className="rounded-md border bg-background px-3 py-2 text-sm" />
                    <input name="theme" defaultValue={quote.theme || ""} className="rounded-md border bg-background px-3 py-2 text-sm" />
                  </div>
                  <input type="hidden" name="episode_id" value={quote.episode_id || ""} />
                  <input type="hidden" name="episode_slug" value={quote.episode_slug || ""} />
                  <input type="hidden" name="episode_title" value={quote.episode_title || ""} />
                  <input type="hidden" name="scheduled_date" value={quote.scheduled_date || ""} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={pending}>حفظ</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>إلغاء</Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm leading-relaxed">&ldquo;{quote.text}&rdquo;</p>
                    <p className="text-xs text-muted-foreground">— {quote.attribution}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <Badge variant={quote.status === "published" ? "default" : "secondary"}>
                        {quote.status === "published" ? "منشور" : "مسودة"}
                      </Badge>
                      {quote.theme && <Badge variant="outline">{quote.theme}</Badge>}
                      {quote.scheduled_date && (
                        <Badge variant="outline" className="gap-1">
                          <Calendar className="h-3 w-3" />
                          {quote.scheduled_date}
                        </Badge>
                      )}
                      {quote.episode_title && (
                        <span className="text-xs text-muted-foreground">🔗 {quote.episode_title}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        startTransition(async () => {
                          if (quote.status === "published") {
                            await unpublishQuoteAction(quote.id)
                          } else {
                            await publishQuoteAction(quote.id)
                          }
                        })
                      }}
                      disabled={pending}
                    >
                      {quote.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingId(quote.id)}
                    >
                      <Quote className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => {
                        startTransition(async () => {
                          await deleteQuoteAction(quote.id)
                        })
                      }}
                      disabled={pending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {quotes.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">لا توجد اقتباسات بعد. أضف أول اقتباس!</p>
        )}
      </div>
    </div>
  )
}

// ─── Reflections Tab ───────────────────────────────────────────

function ReflectionsTab({ reflections, episodes, quotes }: { reflections: DailyReflection[]; episodes: Episode[]; quotes: HomeQuote[] }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      await createReflectionAction(formData)
      setShowForm(false)
    })
  }

  function handleUpdate(id: string, formData: FormData) {
    startTransition(async () => {
      await updateReflectionAction(id, formData)
      setEditingId(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">التأملات اليومية ({reflections.length})</h2>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          إضافة تأمل
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form action={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="date"
                  type="date"
                  required
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                />
                <input
                  name="attribution"
                  placeholder="المصدر (اختياري)"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <input
                name="short_quote"
                placeholder="اقتباس قصير..."
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <textarea
                name="reflection"
                placeholder="التأمل..."
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]"
              />
              <input
                name="thinking_question"
                placeholder="سؤال للتفكير..."
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <select
                name="episode_id"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                onChange={(e) => {
                  const ep = episodes.find((ep) => ep.id === e.target.value)
                  if (ep) {
                    const slugInput = e.target.form?.querySelector('[name="episode_slug"]') as HTMLInputElement
                    const titleInput = e.target.form?.querySelector('[name="episode_title"]') as HTMLInputElement
                    if (slugInput) slugInput.value = ep.slug
                    if (titleInput) titleInput.value = ep.title
                  }
                }}
              >
                <option value="">ربط بحلقة (اختياري)</option>
                {episodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>{ep.title}</option>
                ))}
              </select>
              <input type="hidden" name="episode_slug" />
              <input type="hidden" name="episode_title" />
              <div className="grid grid-cols-2 gap-3">
                <select
                  name="quote_id"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  onChange={(e) => {
                    const q = quotes.find((q) => q.id === e.target.value)
                    const qtInput = e.target.form?.querySelector('[name="quote_text"]') as HTMLInputElement
                    if (qtInput) qtInput.value = q?.text || ""
                  }}
                >
                  <option value="">ربط باقتباس (اختياري)</option>
                  {quotes.filter((q) => q.status === "published").map((q) => (
                    <option key={q.id} value={q.id}>{q.text.slice(0, 50)}...</option>
                  ))}
                </select>
                <select
                  name="path_slug"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  onChange={(e) => {
                    const p = pathOptions.find((p) => p.slug === e.target.value)
                    const ptInput = e.target.form?.querySelector('[name="path_title"]') as HTMLInputElement
                    if (ptInput) ptInput.value = p?.title || ""
                  }}
                >
                  <option value="">ربط بمسار (اختياري)</option>
                  {pathOptions.map((p) => (
                    <option key={p.slug} value={p.slug}>{p.title}</option>
                  ))}
                </select>
              </div>
              <input type="hidden" name="quote_text" />
              <input type="hidden" name="path_title" />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending}>حفظ</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>إلغاء</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {reflections.map((ref) => (
          <Card key={ref.id}>
            <CardContent className="p-4">
              {editingId === ref.id ? (
                <form action={(fd) => handleUpdate(ref.id, fd)} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input name="date" type="date" defaultValue={ref.date} required className="rounded-md border bg-background px-3 py-2 text-sm" />
                    <input name="attribution" defaultValue={ref.attribution || ""} className="rounded-md border bg-background px-3 py-2 text-sm" />
                  </div>
                  <input name="short_quote" defaultValue={ref.short_quote} required className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                  <textarea name="reflection" defaultValue={ref.reflection} required className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]" />
                  <input name="thinking_question" defaultValue={ref.thinking_question} required className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                  <input type="hidden" name="episode_id" value={ref.episode_id || ""} />
                  <input type="hidden" name="episode_slug" value={ref.episode_slug || ""} />
                  <input type="hidden" name="episode_title" value={ref.episode_title || ""} />
                  <input type="hidden" name="quote_id" value={ref.quote_id || ""} />
                  <input type="hidden" name="quote_text" value={ref.quote_text || ""} />
                  <input type="hidden" name="path_slug" value={ref.path_slug || ""} />
                  <input type="hidden" name="path_title" value={ref.path_title || ""} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={pending}>حفظ</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>إلغاء</Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{ref.date}</Badge>
                      <Badge variant={ref.status === "published" ? "default" : "secondary"}>
                        {ref.status === "published" ? "منشور" : ref.status === "scheduled" ? "مجدول" : "مسودة"}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">&ldquo;{ref.short_quote}&rdquo;</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{ref.reflection}</p>
                    <p className="text-xs text-primary">❓ {ref.thinking_question}</p>
                    {(ref.episode_title || ref.quote_text || ref.path_title) && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {ref.episode_title && <Badge variant="outline" className="text-xs">🔗 {ref.episode_title}</Badge>}
                        {ref.quote_text && <Badge variant="outline" className="text-xs">💬 اقتباس</Badge>}
                        {ref.path_title && <Badge variant="outline" className="text-xs">🧭 {ref.path_title}</Badge>}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        startTransition(async () => {
                          if (ref.status === "published") {
                            await unpublishReflectionAction(ref.id)
                          } else {
                            await publishReflectionAction(ref.id)
                          }
                        })
                      }}
                      disabled={pending}
                    >
                      {ref.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingId(ref.id)}>
                      <Lightbulb className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => {
                        startTransition(async () => {
                          await deleteReflectionAction(ref.id)
                        })
                      }}
                      disabled={pending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {reflections.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">لا توجد تأملات بعد. أضف أول تأمل يومي!</p>
        )}
      </div>
    </div>
  )
}

// ─── Paths Tab ─────────────────────────────────────────────────

function PathsTab({ paths, episodes }: { paths: EmotionalPath[]; episodes: Episode[] }) {
  const [pending, startTransition] = useTransition()
  const [selectedPath, setSelectedPath] = useState<string>(paths[0]?.id || "")

  const currentPath = paths.find((p) => p.id === selectedPath)
  const assignedEpisodes = episodes.filter((ep) => currentPath?.episode_ids.includes(ep.id))
  const availableEpisodes = episodes.filter((ep) => !currentPath?.episode_ids.includes(ep.id))

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">المسارات العاطفية</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {paths.map((path) => (
          <button
            key={path.id}
            onClick={() => setSelectedPath(path.id)}
            className={`rounded-lg border p-3 text-start transition-all ${
              selectedPath === path.id
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:border-primary/50"
            }`}
          >
            <div
              className="mb-2 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: path.color }}
            >
              {path.order}
            </div>
            <p className="text-sm font-medium">{path.title}</p>
            <p className="text-xs text-muted-foreground">{path.episode_ids.length} حلقة</p>
          </button>
        ))}
      </div>

      {currentPath && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <h3 className="font-semibold">{currentPath.title}</h3>
              <p className="text-sm text-muted-foreground">{currentPath.subtitle}</p>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium">الحلقات المُسندة ({assignedEpisodes.length})</h4>
              <div className="space-y-1">
                {assignedEpisodes.map((ep) => (
                  <div key={ep.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-sm">{ep.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        startTransition(async () => {
                          await removeEpisodeFromPathAction(currentPath.id, ep.id)
                        })
                      }}
                      disabled={pending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {assignedEpisodes.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">لا توجد حلقات مُسندة لهذا المسار</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium">إضافة حلقة</h4>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                onChange={(e) => {
                  if (!e.target.value) return
                  startTransition(async () => {
                    await assignEpisodeToPathAction(currentPath.id, e.target.value)
                  })
                  e.target.value = ""
                }}
                disabled={pending}
              >
                <option value="">اختر حلقة لإضافتها...</option>
                {availableEpisodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>{ep.title}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────

export function HomeContentTabs({ quotes, reflections, paths, episodes, teasers, teaserQuestions, teaserStats }: Props) {
  return (
    <Tabs defaultValue="quotes">
      <TabsList>
        <TabsTrigger value="quotes" className="gap-2">
          <Quote className="h-4 w-4" />
          الاقتباسات
        </TabsTrigger>
        <TabsTrigger value="reflections" className="gap-2">
          <Lightbulb className="h-4 w-4" />
          التأملات اليومية
        </TabsTrigger>
        <TabsTrigger value="paths" className="gap-2">
          <Compass className="h-4 w-4" />
          المسارات
        </TabsTrigger>
        <TabsTrigger value="teaser" className="gap-2">
          <Video className="h-4 w-4" />
          اسأل الضيف
        </TabsTrigger>
      </TabsList>

      <TabsContent value="quotes">
        <QuotesTab quotes={quotes} episodes={episodes} />
      </TabsContent>

      <TabsContent value="reflections">
        <ReflectionsTab reflections={reflections} episodes={episodes} quotes={quotes} />
      </TabsContent>

      <TabsContent value="paths">
        <PathsTab paths={paths} episodes={episodes} />
      </TabsContent>

      <TabsContent value="teaser">
        <TeaserTab teasers={teasers} questions={teaserQuestions} stats={teaserStats} />
      </TabsContent>
    </Tabs>
  )
}
