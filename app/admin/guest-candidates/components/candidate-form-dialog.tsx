"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Loader2, Plus, X } from "lucide-react"
import { useToast } from "@/lib/use-toast"
import { CATEGORY_OPTIONS, PRIORITY_META } from "../lib/status"
import { candidatesApi } from "../lib/api"
import { EMAIL_REGEX } from "@/lib/validation/forms"
import type { GuestCandidatePriority, GuestCandidateView } from "@/types/database"

interface CandidateFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidate?: GuestCandidateView | null
  onSuccess: () => void
}

interface SocialDraft {
  platform: string
  url: string
  label: string
}

const SOCIAL_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X / Twitter" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "website", label: "موقع شخصي" },
  { value: "other", label: "أخرى" },
]

export function CandidateFormDialog({ open, onOpenChange, candidate, onSuccess }: CandidateFormDialogProps) {
  const { toast } = useToast()
  const isEdit = !!candidate

  const [fullName, setFullName] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [category, setCategory] = useState("")
  const [city, setCity] = useState("")
  const [country, setCountry] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [bio, setBio] = useState("")
  const [notes, setNotes] = useState("")
  const [priority, setPriority] = useState<GuestCandidatePriority>("medium")
  const [sourceNote, setSourceNote] = useState("")
  const [socials, setSocials] = useState<SocialDraft[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (candidate) {
      setFullName(candidate.full_name)
      setDisplayName(candidate.display_name || "")
      setCategory(candidate.category || "")
      setCity(candidate.city || "")
      setCountry(candidate.country || "")
      setPhone(candidate.phone || "")
      setEmail(candidate.email || "")
      setBio(candidate.bio || "")
      setNotes(candidate.notes_internal || "")
      setPriority((candidate.priority_level as GuestCandidatePriority) || "medium")
      setSourceNote(candidate.source_note || "")
      setSocials([]) // edit mode: existing socials managed in detail page
    } else {
      setFullName("")
      setDisplayName("")
      setCategory("")
      setCity("")
      setCountry("")
      setPhone("")
      setEmail("")
      setBio("")
      setNotes("")
      setPriority("medium")
      setSourceNote("")
      setSocials([])
    }
  }, [open, candidate])

  function addSocial() {
    setSocials((s) => [...s, { platform: "instagram", url: "", label: "" }])
  }

  function removeSocial(index: number) {
    setSocials((s) => s.filter((_, i) => i !== index))
  }

  function updateSocial(index: number, field: keyof SocialDraft, value: string) {
    setSocials((s) => s.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || fullName.trim().length < 2) {
      toast({ variant: "destructive", title: "الاسم مطلوب", description: "الرجاء إدخال اسم كامل صحيح" })
      return
    }

    const validSocials = socials.filter((s) => s.url.trim().length > 0)
    for (const s of validSocials) {
      try { new URL(s.url) } catch {
        toast({ variant: "destructive", title: "رابط غير صالح", description: s.url })
        return
      }
    }

    const phoneTrim = phone.trim()
    const emailTrim = email.trim()

    if (emailTrim && !EMAIL_REGEX.test(emailTrim)) {
      toast({ variant: "destructive", title: "بريد غير صالح", description: "الرجاء إدخال بريد إلكتروني صحيح" })
      return
    }

    // Criterion م1: at least one contact channel is required on save.
    // In edit mode the dialog doesn't manage socials (they live on the
    // detail page), so an already-saved social link counts as a channel.
    const hasExistingSocial = isEdit && (candidate?.social_links?.length ?? 0) > 0
    if (!phoneTrim && !emailTrim && validSocials.length === 0 && !hasExistingSocial) {
      toast({
        variant: "destructive",
        title: "قناة تواصل مطلوبة",
        description: "أضف هاتفاً أو بريداً إلكترونياً أو رابطاً اجتماعياً واحداً على الأقل",
      })
      return
    }

    setSubmitting(true)
    try {
      if (isEdit && candidate) {
        await candidatesApi.update(candidate.id, {
          full_name: fullName.trim(),
          display_name: displayName.trim() || null,
          category: category || null,
          city: city.trim() || null,
          country: country.trim() || null,
          phone: phoneTrim || null,
          email: emailTrim || null,
          bio: bio.trim() || null,
          notes_internal: notes.trim() || null,
          priority_level: priority,
          source_note: sourceNote.trim() || null,
        })
        toast({ title: "تم التحديث", description: "تم حفظ تعديلات المرشح بنجاح" })
      } else {
        await candidatesApi.create({
          full_name: fullName.trim(),
          display_name: displayName.trim() || null,
          category: category || null,
          city: city.trim() || null,
          country: country.trim() || null,
          phone: phoneTrim || null,
          email: emailTrim || null,
          bio: bio.trim() || null,
          notes_internal: notes.trim() || null,
          priority_level: priority,
          source_note: sourceNote.trim() || null,
          social_links: validSocials.map((s) => ({
            platform: s.platform,
            url: s.url.trim(),
            label: s.label.trim() || null,
          })),
        })
        toast({ title: "تم الإنشاء", description: "تمت إضافة المرشح إلى القائمة" })
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ غير متوقع"
      toast({ variant: "destructive", title: "فشلت العملية", description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل المرشح" : "إضافة مرشح جديد"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                الاسم الكامل <span className="text-rose-700">*</span>
              </label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثال: أحمد عبدالله"
                required
                minLength={2}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">الاسم الظاهر</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="اختياري"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">التصنيف</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— اختر —</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">المدينة</label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="الرياض" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">البلد</label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="السعودية" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">الهاتف</label>
              <Input
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+965 0000 0000"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">البريد الإلكتروني</label>
              <Input
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>

            <p className="sm:col-span-2 -mt-1 text-[11px] text-muted-foreground">
              مطلوب قناة تواصل واحدة على الأقل: هاتف أو بريد إلكتروني أو رابط اجتماعي. تُستخدم داخلياً فقط — لا تظهر للعامة.
            </p>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">الأولوية</label>
              <div className="flex gap-2">
                {(["high", "medium", "low"] as GuestCandidatePriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                      priority === p
                        ? `${PRIORITY_META[p].badgeClass} border-transparent ring-2 ring-offset-1 ring-current/30`
                        : "border-input bg-background text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {PRIORITY_META[p].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">نبذة قصيرة</label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="من هو هذا الشخص ولماذا قد يكون ضيفاً مناسباً؟"
                rows={3}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">ملاحظات داخلية</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات للفريق فقط — لن تظهر للضيف"
                rows={2}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">المصدر / كيف وصلنا له</label>
              <Input
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
                placeholder="مثال: ترشيح من فلان، حساب على X..."
              />
            </div>
          </div>

          {!isEdit && (
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold">روابط اجتماعية (اختياري)</h4>
                <Button type="button" variant="ghost" size="sm" onClick={addSocial} className="h-7 text-xs">
                  <Plus className="ms-1 h-3 w-3" /> إضافة
                </Button>
              </div>
              {socials.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">لم يتم إضافة روابط بعد</p>
              ) : (
                <div className="space-y-2">
                  {socials.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={s.platform}
                        onChange={(e) => updateSocial(i, "platform", e.target.value)}
                        className="h-8 w-32 rounded-md border border-input bg-transparent px-2 text-xs"
                      >
                        {SOCIAL_PLATFORMS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      <Input
                        value={s.url}
                        onChange={(e) => updateSocial(i, "url", e.target.value)}
                        placeholder="https://..."
                        className="h-8 flex-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => removeSocial(i)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
              {isEdit ? "حفظ التعديلات" : "إنشاء"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
