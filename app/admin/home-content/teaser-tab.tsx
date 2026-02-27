"use client"

import { useState, useTransition, useRef } from "react"
import type { TeaserConfig, TeaserQuestion, TeaserQuestionStats } from "@/types/teaser"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  createTeaserAction,
  updateTeaserAction,
  deleteTeaserAction,
  activateTeaserAction,
  deactivateTeaserAction,
  approveQuestionAction,
  rejectQuestionAction,
  deleteQuestionAction,
  approveAllPendingAction,
} from "./teaser-actions"
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  Check,
  X,
  Video,
  MessageSquare,
} from "lucide-react"

interface Props {
  teasers: TeaserConfig[]
  questions: TeaserQuestion[]
  stats: TeaserQuestionStats | null
}

export function TeaserTab({ teasers, questions: initialQuestions, stats }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [questionFilter, setQuestionFilter] = useState<"all" | "pending" | "approved" | "rejected">("all")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Find the active teaser for question moderation
  const activeTeaser = teasers.find((t) => t.isActive)
  const selectedTeaserForQuestions = activeTeaser || teasers[0]

  const filteredQuestions = questionFilter === "all"
    ? initialQuestions
    : initialQuestions.filter((q) => q.status === questionFilter)

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/admin/teaser/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        setUploadError(data.error || "فشل رفع الفيديو")
        return
      }

      setUploadedFilename(data.filename)
    } catch {
      setUploadError("حدث خطأ أثناء رفع الفيديو")
    } finally {
      setUploading(false)
    }
  }

  function handleCreate(formData: FormData) {
    if (!uploadedFilename) return
    formData.set("videoFilename", uploadedFilename)
    startTransition(async () => {
      await createTeaserAction(formData)
      setShowForm(false)
      setUploadedFilename(null)
    })
  }

  function handleUpdate(id: string, formData: FormData) {
    startTransition(async () => {
      await updateTeaserAction(id, formData)
      setEditingId(null)
    })
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  function relativeTime(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "الآن"
    if (mins < 60) return `منذ ${mins} دقيقة`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `منذ ${hours} ساعة`
    const days = Math.floor(hours / 24)
    return `منذ ${days} يوم`
  }

  return (
    <div className="space-y-8">
      {/* ── Teaser Management ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">التيزرات ({teasers.length})</h2>
          <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            تيزر جديد
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardContent className="p-4">
              <form action={handleCreate} className="space-y-3">
                <input
                  name="guestName"
                  placeholder="اسم الضيف"
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    name="title"
                    placeholder="العنوان (افتراضي: اسأل الضيف)"
                    defaultValue="اسأل الضيف"
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                  />
                  <input
                    name="prompt"
                    placeholder="النص التوجيهي"
                    defaultValue="اكتب سؤالك للضيف"
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </div>

                {/* Video upload */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      {uploading ? "جاري الرفع..." : "رفع فيديو"}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/mp4,video/webm"
                      className="hidden"
                      onChange={handleVideoUpload}
                    />
                    {uploadedFilename && (
                      <Badge variant="default" className="gap-1">
                        <Check className="h-3 w-3" />
                        {uploadedFilename}
                      </Badge>
                    )}
                  </div>
                  {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
                  {uploadedFilename && (
                    <video
                      src={`/teasers/${uploadedFilename}`}
                      controls
                      className="w-full max-w-sm rounded-md"
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">تاريخ النشر (اختياري)</label>
                    <input name="publishAt" type="datetime-local" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">تاريخ الانتهاء (اختياري)</label>
                    <input name="expireAt" type="datetime-local" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                  </div>
                </div>

                <input type="hidden" name="videoFilename" value={uploadedFilename || ""} />

                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={pending || !uploadedFilename}>
                    حفظ
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setShowForm(false); setUploadedFilename(null) }}>
                    إلغاء
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {teasers.map((teaser) => (
            <Card key={teaser.id}>
              <CardContent className="p-4">
                {editingId === teaser.id ? (
                  <form action={(fd) => handleUpdate(teaser.id, fd)} className="space-y-3">
                    <input name="guestName" defaultValue={teaser.guestName} required className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                    <div className="grid grid-cols-2 gap-3">
                      <input name="title" defaultValue={teaser.title} className="rounded-md border bg-background px-3 py-2 text-sm" />
                      <input name="prompt" defaultValue={teaser.prompt} className="rounded-md border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">تاريخ النشر</label>
                        <input name="publishAt" type="datetime-local" defaultValue={teaser.publishAt?.slice(0, 16) || ""} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">تاريخ الانتهاء</label>
                        <input name="expireAt" type="datetime-local" defaultValue={teaser.expireAt?.slice(0, 16) || ""} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={pending}>حفظ</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>إلغاء</Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{teaser.guestName}</span>
                        <Badge variant={teaser.isActive ? "default" : "secondary"}>
                          {teaser.isActive ? "مفعّل" : "معطّل"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{teaser.title} — {teaser.prompt}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>أُنشئ {formatDate(teaser.createdAt)}</span>
                        {teaser.publishAt && <span>ينشر {formatDate(teaser.publishAt)}</span>}
                        {teaser.expireAt && <span>ينتهي {formatDate(teaser.expireAt)}</span>}
                      </div>
                      {teaser.videoFilename && (
                        <video
                          src={`/teasers/${teaser.videoFilename}`}
                          controls
                          preload="metadata"
                          className="mt-2 w-full max-w-xs rounded-md"
                        />
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          startTransition(async () => {
                            if (teaser.isActive) {
                              await deactivateTeaserAction(teaser.id)
                            } else {
                              await activateTeaserAction(teaser.id)
                            }
                          })
                        }}
                        disabled={pending}
                        title={teaser.isActive ? "تعطيل" : "تفعيل"}
                      >
                        {teaser.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingId(teaser.id)}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          startTransition(async () => {
                            await deleteTeaserAction(teaser.id)
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
          {teasers.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لا توجد تيزرات بعد. أضف أول تيزر!
            </p>
          )}
        </div>
      </div>

      {/* ── Question Moderation ── */}
      {selectedTeaserForQuestions && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              أسئلة الجمهور — {selectedTeaserForQuestions.guestName}
            </h2>
            {stats && stats.pending > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    await approveAllPendingAction(selectedTeaserForQuestions.id)
                  })
                }}
              >
                <Check className="h-4 w-4" />
                قبول الكل ({stats.pending})
              </Button>
            )}
          </div>

          {/* Stats bar */}
          {stats && (
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-md border p-2 text-center">
                <p className="text-lg font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">الكل</p>
              </div>
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2 text-center">
                <p className="text-lg font-bold text-yellow-600">{stats.pending}</p>
                <p className="text-xs text-muted-foreground">قيد المراجعة</p>
              </div>
              <div className="rounded-md border border-green-500/30 bg-green-500/5 p-2 text-center">
                <p className="text-lg font-bold text-green-600">{stats.approved}</p>
                <p className="text-xs text-muted-foreground">مقبول</p>
              </div>
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-center">
                <p className="text-lg font-bold text-red-600">{stats.rejected}</p>
                <p className="text-xs text-muted-foreground">مرفوض</p>
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-1">
            {(["all", "pending", "approved", "rejected"] as const).map((filter) => (
              <Button
                key={filter}
                variant={questionFilter === filter ? "default" : "outline"}
                size="sm"
                onClick={() => setQuestionFilter(filter)}
              >
                {filter === "all" && "الكل"}
                {filter === "pending" && "قيد المراجعة"}
                {filter === "approved" && "مقبول"}
                {filter === "rejected" && "مرفوض"}
              </Button>
            ))}
          </div>

          {/* Questions list */}
          <div className="space-y-2">
            {filteredQuestions.map((q) => (
              <Card key={q.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {q.display_name || "مجهول"}
                        </span>
                        <Badge
                          variant={
                            q.status === "approved" ? "default" :
                            q.status === "rejected" ? "destructive" :
                            "secondary"
                          }
                        >
                          {q.status === "approved" && "مقبول"}
                          {q.status === "pending" && "قيد المراجعة"}
                          {q.status === "rejected" && "مرفوض"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(q.created_at)}
                        </span>
                      </div>
                      <p className="text-sm">{q.question_text}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {q.status !== "approved" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-600"
                          onClick={() => {
                            startTransition(async () => {
                              await approveQuestionAction(q.id)
                            })
                          }}
                          disabled={pending}
                          title="قبول"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {q.status !== "rejected" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600"
                          onClick={() => {
                            startTransition(async () => {
                              await rejectQuestionAction(q.id)
                            })
                          }}
                          disabled={pending}
                          title="رفض"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          startTransition(async () => {
                            await deleteQuestionAction(q.id)
                          })
                        }}
                        disabled={pending}
                        title="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredQuestions.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                لا توجد أسئلة {questionFilter !== "all" ? "في هذا التصنيف" : "بعد"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
