"use client"

import { useState, useTransition, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Save, Loader2, Plus, Trash2, GripVertical, User, Video,
  Heart, MessageSquareQuote, Megaphone, Users, Upload, RefreshCw, X, ImageIcon, FileVideo,
  Globe, Link as LinkIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { AboutPageContent, ValueItem, TeamMember } from "@/types/static-content"
import { saveAboutContentAction, uploadHostImageAction } from "./actions"

interface ContentEditorProps {
  initialContent: AboutPageContent
}

const tabs = [
  { id: "host", label: "المقدم", icon: User },
  { id: "values", label: "القيم", icon: Heart },
  { id: "team", label: "الفريق", icon: Users },
  { id: "media", label: "الوسائط", icon: Video },
  { id: "cta", label: "CTA والروابط", icon: Megaphone },
] as const

type TabId = (typeof tabs)[number]["id"]

export function ContentEditor({ initialContent }: ContentEditorProps) {
  const [content, setContent] = useState<AboutPageContent>(initialContent)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>("host")

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">صفحة &quot;من نحن&quot;</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تحرير محتوى صفحة التعريف بالبودكاست
          </p>
        </div>
        <div className="flex items-center gap-3">
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
      </div>

      {/* Upload Error */}
      {uploadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          {uploadError}
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setUploadError(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border/30 bg-muted/30 p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.id === "values" && content.values.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[10px]">{content.values.length}</span>
              )}
              {tab.id === "team" && content.teamMembers.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[10px]">{content.teamMembers.length}</span>
              )}
              {tab.id === "cta" && content.socialLinks.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[10px]">{content.socialLinks.length}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="animate-in fade-in duration-200">
        {/* ─── Host Tab ─── */}
        {activeTab === "host" && (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="rounded-xl border border-border/30 bg-card/50">
              <div className="flex items-center gap-3 border-b border-border/20 px-5 py-4">
                <User className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">المعلومات الأساسية</h2>
              </div>
              <div className="space-y-4 p-5">
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
              </div>
            </div>

            {/* Host Photo */}
            <div className="rounded-xl border border-border/30 bg-card/50">
              <div className="flex items-center gap-3 border-b border-border/20 px-5 py-4">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">الصورة الشخصية</h2>
              </div>
              <div className="p-5">
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
                <details className="mt-4 text-sm">
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

            {/* Mission Quote */}
            <div className="rounded-xl border border-border/30 bg-card/50">
              <div className="flex items-center gap-3 border-b border-border/20 px-5 py-4">
                <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">الاقتباس الرئيسي</h2>
              </div>
              <div className="p-5">
                <Textarea
                  value={content.missionQuote}
                  onChange={(e) => setContent((prev) => ({ ...prev, missionQuote: e.target.value }))}
                  rows={2}
                  className="rounded-xl"
                  placeholder="اقتباس يعبّر عن رسالة البودكاست..."
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── Values Tab ─── */}
        {activeTab === "values" && (
          <div className="rounded-xl border border-border/30 bg-card/50">
            <div className="flex items-center gap-3 border-b border-border/20 px-5 py-4">
              <Heart className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">القيم</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{content.values.length}</span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={addValue} className="h-8 rounded-xl">
                <Plus className="me-1 h-4 w-4" />
                إضافة قيمة
              </Button>
            </div>
            <div className="p-5">
              {content.values.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Heart className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">لا توجد قيم بعد</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">أضف القيم التي يمثلها البودكاست</p>
                  <Button variant="outline" size="sm" onClick={addValue} className="mt-4 rounded-xl">
                    <Plus className="me-1 h-4 w-4" />
                    إضافة أول قيمة
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {content.values.map((value, index) => (
                    <div key={value.id} className="rounded-xl border border-border/20 bg-muted/20 p-4 transition-colors hover:bg-muted/30">
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary mt-0.5">
                          {index + 1}
                        </span>
                        <div className="flex-1 grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">العنوان</Label>
                            <Input
                              value={value.title}
                              onChange={(e) => updateValue(value.id, { title: e.target.value })}
                              placeholder="مثال: الأصالة"
                              className="rounded-xl"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">الأيقونة</Label>
                            <Input
                              value={value.icon}
                              onChange={(e) => updateValue(value.id, { icon: e.target.value })}
                              placeholder="Heart, Sparkles, Users..."
                              dir="ltr"
                              className="rounded-xl"
                            />
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label className="text-xs">الوصف</Label>
                            <Input
                              value={value.description}
                              onChange={(e) => updateValue(value.id, { description: e.target.value })}
                              className="rounded-xl"
                            />
                          </div>
                          <div className="space-y-1.5">
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
                          className="shrink-0 text-destructive/60 hover:text-destructive mt-0.5"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Team Tab ─── */}
        {activeTab === "team" && (
          <div className="rounded-xl border border-border/30 bg-card/50">
            <div className="flex items-center gap-3 border-b border-border/20 px-5 py-4">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">فريق العمل</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{content.teamMembers.length}</span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={addTeamMember} className="h-8 rounded-xl">
                <Plus className="me-1 h-4 w-4" />
                إضافة عضو
              </Button>
            </div>
            <div className="p-5">
              {content.teamMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">لا يوجد أعضاء فريق</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">أضف أعضاء فريق البودكاست</p>
                  <Button variant="outline" size="sm" onClick={addTeamMember} className="mt-4 rounded-xl">
                    <Plus className="me-1 h-4 w-4" />
                    إضافة أول عضو
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {content.teamMembers.map((member) => (
                    <div key={member.id} className="rounded-xl border border-border/20 bg-muted/20 p-4 transition-colors hover:bg-muted/30">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center shrink-0">
                          {member.image ? (
                            <img src={member.image} alt={member.name || "عضو"} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-lg font-bold text-muted-foreground/50">
                              {member.name ? member.name.charAt(0) : <ImageIcon className="h-5 w-5" />}
                            </span>
                          )}
                        </div>

                        <div className="flex-1 space-y-3">
                          {/* Name + Role */}
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs">الاسم</Label>
                              <Input
                                value={member.name}
                                onChange={(e) => updateTeamMember(member.id, { name: e.target.value })}
                                className="rounded-xl"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">الدور</Label>
                              <Input
                                value={member.role}
                                onChange={(e) => updateTeamMember(member.id, { role: e.target.value })}
                                className="rounded-xl"
                              />
                            </div>
                          </div>

                          {/* Description */}
                          <div className="space-y-1.5">
                            <Label className="text-xs">الوصف</Label>
                            <Input
                              value={member.description}
                              onChange={(e) => updateTeamMember(member.id, { description: e.target.value })}
                              className="rounded-xl"
                            />
                          </div>

                          {/* Image Upload */}
                          <div className="flex items-center gap-2">
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
                                  className="h-7 text-xs"
                                >
                                  {teamMemberUploading[member.id] ? <Loader2 className="me-1 h-3 w-3 animate-spin" /> : <RefreshCw className="me-1 h-3 w-3" />}
                                  استبدال الصورة
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => updateTeamMember(member.id, { image: "" })}
                                  className="h-7 text-xs text-destructive hover:text-destructive"
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
                                className="h-7 text-xs"
                              >
                                {teamMemberUploading[member.id] ? <Loader2 className="me-1 h-3 w-3 animate-spin" /> : <Upload className="me-1 h-3 w-3" />}
                                رفع صورة
                              </Button>
                            )}
                            <details className="text-xs">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">رابط</summary>
                              <Input
                                value={member.image}
                                onChange={(e) => updateTeamMember(member.id, { image: e.target.value })}
                                placeholder="/content/team-member.jpg"
                                dir="ltr"
                                className="mt-1.5 rounded-xl text-xs w-60"
                              />
                            </details>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTeamMember(member.id)}
                          className="shrink-0 text-destructive/60 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Media Tab ─── */}
        {activeTab === "media" && (
          <div className="rounded-xl border border-border/30 bg-card/50">
            <div className="flex items-center gap-3 border-b border-border/20 px-5 py-4">
              <Video className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">الفيديو الترحيبي</h2>
            </div>
            <div className="p-5 space-y-4">
              {currentVideo ? (
                <div className="space-y-3">
                  <div className="relative aspect-video max-w-md rounded-xl overflow-hidden border bg-muted">
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
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <FileVideo className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">لا يوجد فيديو ترحيبي</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">MP4, WebM, أو MOV — حد أقصى 200 ميجابايت</p>
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
                    className="mt-4 rounded-xl"
                  >
                    {videoUploading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Upload className="me-1 h-4 w-4" />}
                    {videoUploading ? "جارٍ الرفع..." : "رفع فيديو"}
                  </Button>
                </div>
              )}

              <details className="text-sm border-t border-border/20 pt-4">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">أو أدخل معرف يوتيوب</summary>
                <div className="space-y-2 mt-2">
                  <Label>YouTube Video ID</Label>
                  <Input
                    value={content.welcomeVideoId}
                    onChange={(e) => setContent((prev) => ({ ...prev, welcomeVideoId: e.target.value }))}
                    placeholder="dQw4w9WgXcQ"
                    dir="ltr"
                    className="rounded-xl max-w-sm"
                  />
                </div>
              </details>
            </div>
          </div>
        )}

        {/* ─── CTA & Links Tab ─── */}
        {activeTab === "cta" && (
          <div className="space-y-6">
            {/* CTA */}
            <div className="rounded-xl border border-border/30 bg-card/50">
              <div className="flex items-center gap-3 border-b border-border/20 px-5 py-4">
                <Megaphone className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">دعوة للعمل (CTA)</h2>
              </div>
              <div className="space-y-4 p-5">
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
              <div className="flex items-center gap-3 border-b border-border/20 px-5 py-4">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">الروابط الاجتماعية</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{content.socialLinks.length}</span>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={addSocialLink} className="h-8 rounded-xl">
                  <Plus className="me-1 h-4 w-4" />
                  إضافة
                </Button>
              </div>
              <div className="p-5">
                {content.socialLinks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Globe className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">لا توجد روابط</p>
                    <Button variant="outline" size="sm" onClick={addSocialLink} className="mt-4 rounded-xl">
                      <Plus className="me-1 h-4 w-4" />
                      إضافة رابط
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {content.socialLinks.map((link, index) => (
                      <div key={index} className="flex items-center gap-2 rounded-xl border border-border/20 bg-muted/20 p-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                          <LinkIcon className="h-4 w-4" />
                        </div>
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
                          className="text-destructive/60 hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
