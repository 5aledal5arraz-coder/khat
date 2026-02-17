"use client"

import { useState, useTransition, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Save, Loader2, Plus, Trash2, GripVertical, User, Video,
  Heart, MessageSquareQuote, Megaphone, Users, Upload, RefreshCw, X, ImageIcon, FileVideo,
} from "lucide-react"
import type { AboutPageContent, ValueItem, TeamMember } from "@/types/static-content"
import { saveAboutContentAction, uploadHostImageAction } from "./actions"

interface ContentEditorProps {
  initialContent: AboutPageContent
}

export function ContentEditor({ initialContent }: ContentEditorProps) {
  const [content, setContent] = useState<AboutPageContent>(initialContent)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function handleSave() {
    setMessage(null)
    startTransition(async () => {
      try {
        await saveAboutContentAction(content)
        setMessage("تم الحفظ بنجاح")
        setTimeout(() => setMessage(null), 3000)
      } catch {
        setMessage("حدث خطأ أثناء الحفظ")
      }
    })
  }

  // Upload state
  const [imageUploading, setImageUploading] = useState(false)
  const [videoUploading, setVideoUploading] = useState(false)
  const [teamMemberUploading, setTeamMemberUploading] = useState<Record<string, boolean>>({})
  const [uploadError, setUploadError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const teamMemberImageRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setImageUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const result = await uploadHostImageAction(formData)
      if (result.error) {
        setUploadError(result.error)
        return
      }
      setContent((prev) => ({ ...prev, hostImageUrl: result.url ?? "" }))
    } catch (err) {
      console.error("[image-upload] error:", err)
      setUploadError("حدث خطأ أثناء رفع الصورة")
    } finally {
      setImageUploading(false)
      if (imageInputRef.current) imageInputRef.current.value = ""
    }
  }

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setVideoUploading(true)
    try {
      const res = await fetch("/api/admin/content/upload-video", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      })
      const text = await res.text()
      let data: { url?: string; error?: string }
      try {
        data = JSON.parse(text)
      } catch {
        console.error("[video-upload] non-JSON response:", res.status, text.slice(0, 200))
        setUploadError(`خطأ في الخادم (${res.status})`)
        return
      }
      if (!res.ok) {
        setUploadError(data.error || `خطأ أثناء الرفع (${res.status})`)
        return
      }
      setContent((prev) => ({ ...prev, welcomeVideoUrl: data.url ?? "" }))
    } catch (err) {
      console.error("[video-upload] error:", err)
      setUploadError("فشل الاتصال بالخادم أثناء رفع الفيديو")
    } finally {
      setVideoUploading(false)
      if (videoInputRef.current) videoInputRef.current.value = ""
    }
  }

  async function handleTeamMemberImageUpload(memberId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setTeamMemberUploading((prev) => ({ ...prev, [memberId]: true }))
    try {
      const formData = new FormData()
      formData.append("file", file)
      const result = await uploadHostImageAction(formData)
      if (result.error) {
        setUploadError(result.error)
        return
      }
      updateTeamMember(memberId, { image: result.url ?? "" })
    } catch (err) {
      console.error("[team-member-image-upload] error:", err)
      setUploadError("حدث خطأ أثناء رفع الصورة")
    } finally {
      setTeamMemberUploading((prev) => ({ ...prev, [memberId]: false }))
      const input = teamMemberImageRefs.current[memberId]
      if (input) input.value = ""
    }
  }

  const currentHostImage = content.hostImageUrl || content.hostPhoto
  const currentVideo = content.welcomeVideoUrl

  // Value helpers
  function addValue() {
    const newValue: ValueItem = {
      id: `val-${crypto.randomUUID()}`,
      icon: "Heart",
      title: "",
      description: "",
      color: "from-blue-500/20 to-blue-500/5",
      order: content.values.length + 1,
    }
    setContent((prev) => ({ ...prev, values: [...prev.values, newValue] }))
  }

  function updateValue(id: string, updates: Partial<ValueItem>) {
    setContent((prev) => ({
      ...prev,
      values: prev.values.map((v) => (v.id === id ? { ...v, ...updates } : v)),
    }))
  }

  function removeValue(id: string) {
    setContent((prev) => ({
      ...prev,
      values: prev.values.filter((v) => v.id !== id),
    }))
  }

  // Team member helpers
  function addTeamMember() {
    const newMember: TeamMember = {
      id: `member-${crypto.randomUUID()}`,
      name: "",
      role: "",
      image: "",
      description: "",
      order: content.teamMembers.length + 1,
    }
    setContent((prev) => ({
      ...prev,
      teamMembers: [...prev.teamMembers, newMember],
    }))
  }

  function updateTeamMember(id: string, updates: Partial<TeamMember>) {
    setContent((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }))
  }

  function removeTeamMember(id: string) {
    setContent((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.filter((m) => m.id !== id),
    }))
  }

  // Social link helpers
  function addSocialLink() {
    setContent((prev) => ({
      ...prev,
      socialLinks: [...prev.socialLinks, { name: "", url: "", icon: "Globe" }],
    }))
  }

  function updateSocialLink(index: number, updates: Partial<{ name: string; url: string; icon: string }>) {
    setContent((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.map((l, i) => (i === index ? { ...l, ...updates } : l)),
    }))
  }

  function removeSocialLink(index: number) {
    setContent((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.filter((_, i) => i !== index),
    }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">المحتوى</h1>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {content.values.length} قيم
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {content.teamMembers.length} أعضاء
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {content.socialLinks.length} روابط
        </span>
        <div className="flex-1" />
        {message && (
          <span className={`text-sm ${message.includes("خطأ") ? "text-destructive" : "text-green-500"}`}>
            {message}
          </span>
        )}
        <Button onClick={handleSave} disabled={isPending} className="h-10 gap-2 rounded-xl">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          حفظ التغييرات
        </Button>
      </div>

      {/* Host Info */}
      <div className="rounded-xl border border-border/30 bg-card/50">
        <div className="flex items-center gap-3 border-b border-border/20 px-4 py-3">
          <User className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">معلومات المقدم</h2>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input
                value={content.hostName}
                onChange={(e) => setContent((prev) => ({ ...prev, hostName: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>اللقب</Label>
              <Input
                value={content.hostTitle}
                onChange={(e) => setContent((prev) => ({ ...prev, hostTitle: e.target.value }))}
                className="rounded-xl"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Textarea
              value={content.hostDescription}
              onChange={(e) => setContent((prev) => ({ ...prev, hostDescription: e.target.value }))}
              rows={3}
              className="rounded-xl"
            />
          </div>

          {/* Host Image Upload */}
          <div className="space-y-3">
            <Label>صورة المقدم</Label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center shrink-0">
                {currentHostImage ? (
                  <img src={currentHostImage} alt="صورة المقدم" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                {currentHostImage ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={imageUploading}
                    >
                      {imageUploading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <RefreshCw className="me-1 h-4 w-4" />}
                      استبدال
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setContent((prev) => ({ ...prev, hostImageUrl: "" }))}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="me-1 h-4 w-4" />
                      حذف
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={imageUploading}
                  >
                    {imageUploading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Upload className="me-1 h-4 w-4" />}
                    رفع صورة
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">JPG, PNG, أو WebP — حد أقصى 5 ميجابايت</p>
              </div>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">أو أدخل رابط الصورة</summary>
              <Input
                value={content.hostPhoto}
                onChange={(e) => setContent((prev) => ({ ...prev, hostPhoto: e.target.value }))}
                placeholder="/host-photo.jpg"
                dir="ltr"
                className="mt-2 rounded-xl"
              />
            </details>
          </div>
        </div>
      </div>

      {/* Welcome Video */}
      <div className="rounded-xl border border-border/30 bg-card/50">
        <div className="flex items-center gap-3 border-b border-border/20 px-4 py-3">
          <Video className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">فيديو ترحيبي</h2>
        </div>
        <div className="space-y-4 p-4">
          <div className="space-y-3">
            <Label>رفع فيديو</Label>
            {currentVideo ? (
              <div className="space-y-3">
                <div className="relative aspect-video max-w-sm rounded-lg overflow-hidden border bg-muted">
                  <video
                    src={currentVideo}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const el = e.currentTarget
                      if (el.parentElement) {
                        el.parentElement.innerHTML = '<div class="flex items-center justify-center h-full text-sm text-muted-foreground p-4 text-center">تم رفع الفيديو بنجاح لكن المتصفح لا يدعم تشغيله. جرّب رفع ملف MP4 (H.264)</div>'
                      }
                    }}
                  />
                </div>
                {currentVideo.endsWith(".mov") && (
                  <p className="text-xs text-amber-600">ملفات MOV قد لا تعمل في جميع المتصفحات. يُنصح برفع MP4 (H.264) لأفضل توافق.</p>
                )}
                <div className="flex gap-2">
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept=".mp4,.webm,.mov"
                    className="hidden"
                    onChange={handleVideoUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={videoUploading}
                  >
                    {videoUploading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <RefreshCw className="me-1 h-4 w-4" />}
                    استبدال
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setContent((prev) => ({ ...prev, welcomeVideoUrl: "" }))}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="me-1 h-4 w-4" />
                    حذف
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept=".mp4,.webm,.mov"
                  className="hidden"
                  onChange={handleVideoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={videoUploading}
                >
                  {videoUploading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Upload className="me-1 h-4 w-4" />}
                  {videoUploading ? "جارٍ الرفع..." : "رفع فيديو"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">MP4, WebM, أو MOV — حد أقصى 200 ميجابايت</p>
              </div>
            )}
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">أو أدخل معرف يوتيوب</summary>
            <div className="space-y-2 mt-2">
              <Label>YouTube Video ID</Label>
              <Input
                value={content.welcomeVideoId}
                onChange={(e) => setContent((prev) => ({ ...prev, welcomeVideoId: e.target.value }))}
                placeholder="dQw4w9WgXcQ"
                dir="ltr"
                className="rounded-xl"
              />
            </div>
          </details>
        </div>
      </div>

      {/* Upload Error */}
      {uploadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {uploadError}
        </div>
      )}

      {/* Mission Quote */}
      <div className="rounded-xl border border-border/30 bg-card/50">
        <div className="flex items-center gap-3 border-b border-border/20 px-4 py-3">
          <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">الاقتباس الرئيسي</h2>
        </div>
        <div className="p-4">
          <Textarea
            value={content.missionQuote}
            onChange={(e) => setContent((prev) => ({ ...prev, missionQuote: e.target.value }))}
            rows={2}
            className="rounded-xl"
          />
        </div>
      </div>

      {/* Values */}
      <div className="rounded-xl border border-border/30 bg-card/50">
        <div className="flex items-center gap-3 border-b border-border/20 px-4 py-3">
          <Heart className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">القيم</h2>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={addValue} className="h-8 rounded-xl">
            <Plus className="me-1 h-4 w-4" />
            إضافة
          </Button>
        </div>
        <div className="space-y-4 p-4">
          {content.values.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              لا توجد قيم. أضف أول قيمة.
            </p>
          )}
          {content.values.map((value) => (
            <div key={value.id} className="flex gap-3 items-start rounded-xl border border-border/20 bg-muted/20 p-3">
              <GripVertical className="h-5 w-5 mt-2 text-muted-foreground/50 shrink-0" />
              <div className="flex-1 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">العنوان</Label>
                  <Input
                    value={value.title}
                    onChange={(e) => updateValue(value.id, { title: e.target.value })}
                    placeholder="مثال: الأصالة"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">الأيقونة</Label>
                  <Input
                    value={value.icon}
                    onChange={(e) => updateValue(value.id, { icon: e.target.value })}
                    placeholder="Heart, Sparkles, Users..."
                    dir="ltr"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs">الوصف</Label>
                  <Input
                    value={value.description}
                    onChange={(e) => updateValue(value.id, { description: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">لون التدرج (Tailwind)</Label>
                  <Input
                    value={value.color}
                    onChange={(e) => updateValue(value.id, { color: e.target.value })}
                    placeholder="from-red-500/20 to-red-500/5"
                    dir="ltr"
                    className="rounded-xl"
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeValue(value.id)}
                className="shrink-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Team Members */}
      <div className="rounded-xl border border-border/30 bg-card/50">
        <div className="flex items-center gap-3 border-b border-border/20 px-4 py-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">فريق العمل</h2>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={addTeamMember} className="h-8 rounded-xl">
            <Plus className="me-1 h-4 w-4" />
            إضافة
          </Button>
        </div>
        <div className="space-y-4 p-4">
          {content.teamMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              لا يوجد أعضاء فريق. أضف أول عضو.
            </p>
          )}
          {content.teamMembers.map((member) => (
            <div key={member.id} className="flex gap-3 items-start rounded-xl border border-border/20 bg-muted/20 p-3">
              <GripVertical className="h-5 w-5 mt-2 text-muted-foreground/50 shrink-0" />
              <div className="flex-1 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">الاسم</Label>
                  <Input
                    value={member.name}
                    onChange={(e) => updateTeamMember(member.id, { name: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">الدور</Label>
                  <Input
                    value={member.role}
                    onChange={(e) => updateTeamMember(member.id, { role: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs">الصورة</Label>
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center shrink-0">
                      {member.image ? (
                        <img src={member.image} alt={member.name || "عضو"} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold text-muted-foreground/50">
                          {member.name ? member.name.charAt(0) : <ImageIcon className="h-5 w-5" />}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <input
                        ref={(el) => { teamMemberImageRefs.current[member.id] = el }}
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp"
                        className="hidden"
                        onChange={(e) => handleTeamMemberImageUpload(member.id, e)}
                      />
                      {member.image ? (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => teamMemberImageRefs.current[member.id]?.click()}
                            disabled={teamMemberUploading[member.id]}
                          >
                            {teamMemberUploading[member.id] ? <Loader2 className="me-1 h-3 w-3 animate-spin" /> : <RefreshCw className="me-1 h-3 w-3" />}
                            استبدال
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => updateTeamMember(member.id, { image: "" })}
                            className="text-destructive hover:text-destructive"
                          >
                            <X className="me-1 h-3 w-3" />
                            حذف
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => teamMemberImageRefs.current[member.id]?.click()}
                          disabled={teamMemberUploading[member.id]}
                        >
                          {teamMemberUploading[member.id] ? <Loader2 className="me-1 h-3 w-3 animate-spin" /> : <Upload className="me-1 h-3 w-3" />}
                          رفع صورة
                        </Button>
                      )}
                      <p className="text-[10px] text-muted-foreground">JPG, PNG, أو WebP</p>
                    </div>
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">أو أدخل رابط الصورة</summary>
                    <Input
                      value={member.image}
                      onChange={(e) => updateTeamMember(member.id, { image: e.target.value })}
                      placeholder="/content/team-member.jpg"
                      dir="ltr"
                      className="mt-1.5 rounded-xl text-xs"
                    />
                  </details>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs">الوصف</Label>
                  <Input
                    value={member.description}
                    onChange={(e) => updateTeamMember(member.id, { description: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeTeamMember(member.id)}
                className="shrink-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-xl border border-border/30 bg-card/50">
        <div className="flex items-center gap-3 border-b border-border/20 px-4 py-3">
          <Megaphone className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">دعوة للعمل (CTA)</h2>
        </div>
        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <Label>العنوان</Label>
            <Input
              value={content.ctaTitle}
              onChange={(e) => setContent((prev) => ({ ...prev, ctaTitle: e.target.value }))}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Textarea
              value={content.ctaDescription}
              onChange={(e) => setContent((prev) => ({ ...prev, ctaDescription: e.target.value }))}
              rows={2}
              className="rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* Social Links */}
      <div className="rounded-xl border border-border/30 bg-card/50">
        <div className="flex items-center gap-3 border-b border-border/20 px-4 py-3">
          <h2 className="text-sm font-semibold">الروابط الاجتماعية</h2>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={addSocialLink} className="h-8 rounded-xl">
            <Plus className="me-1 h-4 w-4" />
            إضافة
          </Button>
        </div>
        <div className="space-y-3 p-4">
          {content.socialLinks.map((link, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={link.name}
                onChange={(e) => updateSocialLink(index, { name: e.target.value })}
                placeholder="الاسم"
                className="w-28 rounded-xl"
              />
              <Input
                value={link.url}
                onChange={(e) => updateSocialLink(index, { url: e.target.value })}
                placeholder="الرابط"
                dir="ltr"
                className="flex-1 rounded-xl"
              />
              <Input
                value={link.icon}
                onChange={(e) => updateSocialLink(index, { icon: e.target.value })}
                placeholder="أيقونة"
                dir="ltr"
                className="w-28 rounded-xl"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeSocialLink(index)}
                className="text-destructive hover:text-destructive shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
