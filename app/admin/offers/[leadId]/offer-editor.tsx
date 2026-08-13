"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Lock,
  Unlock,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  Send,
  AlertCircle,
} from "lucide-react"
import { formatRelativeTime } from "@/lib/shared/formatters"
import type { PartnershipOffer, ProposedPackage } from "@/types/database"

export function OfferEditor({
  offer: initial,
  companyName,
  leadEmail,
  contactName,
}: {
  offer: PartnershipOffer
  companyName: string
  /** `sponsorship_leads.email` — the only address this offer can be sent to. */
  leadEmail: string
  contactName: string
}) {
  const [offer, setOffer] = useState<PartnershipOffer>(initial)
  const [title, setTitle] = useState(initial.title ?? "")
  const [intro, setIntro] = useState(initial.intro ?? "")
  const [body, setBody] = useState(initial.body ?? "")
  const [validity, setValidity] = useState(initial.validity_note ?? "")
  const [contactEmail, setContactEmail] = useState(initial.contact_email ?? "")
  const [packages, setPackages] = useState<ProposedPackage[]>(initial.packages ?? [])

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pwInput, setPwInput] = useState("")
  const [pwBusy, setPwBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tokenBusy, setTokenBusy] = useState(false)
  const [sendBusy, setSendBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const link = typeof window !== "undefined" ? `${window.location.origin}/offer/${offer.token}` : `/offer/${offer.token}`

  async function patch(payload: Record<string, unknown>): Promise<PartnershipOffer | null> {
    const res = await fetch(`/api/admin/offers/${offer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    return data.offer ?? null
  }

  async function saveContent() {
    setSaving(true)
    setSaved(false)
    const updated = await patch({ title, intro, body, validity_note: validity, contact_email: contactEmail, packages })
    if (updated) setOffer(updated)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function togglePublish(next: boolean) {
    const updated = await patch({ published: next })
    if (updated) setOffer(updated)
  }

  async function savePassword(remove = false) {
    setPwBusy(true)
    const updated = await patch({ password: remove ? "" : pwInput })
    if (updated) setOffer(updated)
    setPwInput("")
    setPwBusy(false)
  }

  async function rotateToken() {
    if (!confirm("سيتوقف الرابط القديم عن العمل. متابعة؟")) return
    setTokenBusy(true)
    const updated = await patch({ regenerateToken: true })
    if (updated) setOffer(updated)
    setTokenBusy(false)
  }

  /**
   * Mail the link to the lead's registered contact.
   *
   * Two confirmations, not one, when it has gone out before: a duplicate offer
   * landing in a partner's inbox reads as disorganised, and unlike a saved draft
   * it cannot be taken back. The server re-checks both the publish state and the
   * resend acknowledgement — this dialog is a courtesy, not the gate.
   */
  async function sendOffer() {
    if (!offer.published) return
    const already = offer.sent_at
    if (!confirm(`سيُرسل العرض إلى ${contactName} على ${leadEmail}. متابعة؟`)) return
    if (already && !confirm(`تنبيه: سبق إرسال هذا العرض ${formatRelativeTime(already)}. إرساله مرة أخرى؟`)) return

    setSendBusy(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/admin/offers/${offer.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_resend: Boolean(already) }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; sent_at?: string }
      // A failed send must never look like a sent one — no optimistic stamp.
      if (!res.ok) {
        setSendError(data.error || "فشل الإرسال — لم يُرسل شيء.")
        return
      }
      setOffer((prev) => ({ ...prev, sent_at: data.sent_at ?? new Date().toISOString() }))
    } catch {
      setSendError("تعذّر الاتصال بالخادم — لم يُرسل شيء.")
    } finally {
      setSendBusy(false)
    }
  }

  function copyLink() {
    navigator.clipboard?.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const updatePackage = (i: number, key: keyof ProposedPackage, value: string | string[]) =>
    setPackages((prev) => prev.map((p, j) => (j === i ? { ...p, [key]: value } : p)))

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* ── Content editor ── */}
      <div className="space-y-5 rounded-2xl border border-border/60 bg-card p-6">
        <div className="space-y-2">
          <Label>عنوان العرض</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`عرض شراكة — خط × ${companyName}`} />
        </div>
        <div className="space-y-2">
          <Label>مقدمة قصيرة</Label>
          <Textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={2} placeholder="سطر أو سطران يفتتحان العرض..." />
        </div>
        <div className="space-y-2">
          <Label>نص العرض</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className="font-[inherit] leading-relaxed"
            placeholder="النص الكامل للعرض — يمكنك تعديل ما ولّده الذكاء الاصطناعي بحرية."
          />
          <p className="text-[11px] text-muted-foreground">يُحفظ بفواصل الأسطر كما هي.</p>
        </div>

        {/* Packages */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>الباقات</Label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPackages((p) => [...p, { name: "", description: "", price_range: "", deliverables: [] }])}
            >
              <Plus className="me-1 h-3.5 w-3.5" />
              باقة
            </Button>
          </div>
          {packages.map((pkg, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Input value={pkg.name} onChange={(e) => updatePackage(i, "name", e.target.value)} placeholder="اسم الباقة" className="flex-1" />
                <Input value={pkg.price_range} onChange={(e) => updatePackage(i, "price_range", e.target.value)} placeholder="السعر/النطاق (اختياري)" className="w-44" />
                <Button type="button" size="icon" variant="ghost" onClick={() => setPackages((p) => p.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Input value={pkg.description} onChange={(e) => updatePackage(i, "description", e.target.value)} placeholder="وصف مختصر" />
              <Textarea
                value={pkg.deliverables.join("\n")}
                onChange={(e) => updatePackage(i, "deliverables", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
                rows={3}
                placeholder="المخرجات — كل سطر بند"
                className="text-[13px]"
              />
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>صلاحية العرض (اختياري)</Label>
            <Input value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="مثال: هذا العرض صالح حتى 30 يونيو" />
          </div>
          <div className="space-y-2">
            <Label>بريد التواصل</Label>
            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} dir="ltr" />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border/40 pt-4">
          <Button onClick={saveContent} disabled={saving}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            حفظ التعديلات
          </Button>
          {saved && <span className="text-sm text-green-700">تم الحفظ</span>}
        </div>
      </div>

      {/* ── Share / publish sidebar ── */}
      <div className="space-y-4">
        {/* Publish */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold">نشر العرض</p>
              <p className="text-[11px] text-muted-foreground">
                {offer.published ? "الرابط يعمل الآن" : "الرابط معطّل حتى النشر"}
              </p>
            </div>
            <Switch checked={offer.published} onCheckedChange={togglePublish} />
          </div>
        </div>

        {/* Send to the company */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold">
            <Send className="h-3.5 w-3.5 text-primary" />
            إرسال العرض للشركة
          </p>
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            يذهب إلى جهة الاتصال المسجّلة في الطلب:{" "}
            <span className="font-medium text-foreground">{contactName}</span>
            {" — "}
            <span dir="ltr" className="inline-block font-medium text-foreground">{leadEmail}</span>
          </p>
          <Button onClick={sendOffer} disabled={!offer.published || sendBusy} className="w-full">
            {sendBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Send className="me-2 h-4 w-4" />}
            {offer.sent_at ? "إرسال مرة أخرى" : "أرسل العرض"}
          </Button>
          {!offer.published && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              انشر العرض أولاً — الرابط غير المنشور يفتح صفحة «غير موجود» عند الشركة.
            </p>
          )}
          {offer.sent_at && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Check className="h-3 w-3 text-green-700" />
              أُرسل {formatRelativeTime(offer.sent_at)}
            </p>
          )}
          {sendError && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-relaxed text-red-700">
              <AlertCircle className="me-1 inline-block h-3 w-3 align-[-1px]" />
              {sendError}
            </p>
          )}
        </div>

        {/* Secret link */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <p className="mb-2 text-[13px] font-semibold">الرابط السرّي</p>
          <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 p-2">
            <input readOnly value={link} dir="ltr" className="min-w-0 flex-1 bg-transparent px-1 text-[11px] text-muted-foreground outline-none" />
            <button onClick={copyLink} className="rounded-lg bg-background p-1.5 ring-1 ring-border/50 hover:bg-muted" title="نسخ">
              {copied ? <Check className="h-3.5 w-3.5 text-green-700" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
              <Eye className="h-3 w-3" /> معاينة
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
            <span className="text-[11px] text-muted-foreground">·</span>
            <button onClick={rotateToken} disabled={tokenBusy} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50">
              {tokenBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} تجديد الرابط
            </button>
          </div>
          {offer.view_count > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">شوهد {offer.view_count} مرة</p>
          )}
        </div>

        {/* Password gate */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold">
            {offer.password_hash ? <Lock className="h-3.5 w-3.5 text-primary" /> : <Unlock className="h-3.5 w-3.5 text-muted-foreground" />}
            كلمة المرور
          </p>
          <p className="mb-3 text-[11px] text-muted-foreground">
            {offer.password_hash ? "العرض محميّ بكلمة مرور." : "اختياري — أضف كلمة مرور لحماية إضافية."}
          </p>
          <div className="flex items-center gap-2">
            <Input value={pwInput} onChange={(e) => setPwInput(e.target.value)} placeholder={offer.password_hash ? "كلمة مرور جديدة" : "كلمة مرور"} dir="ltr" className="flex-1" />
            <Button size="sm" disabled={pwBusy || !pwInput} onClick={() => savePassword(false)}>
              {pwBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "حفظ"}
            </Button>
          </div>
          {offer.password_hash && (
            <button onClick={() => savePassword(true)} disabled={pwBusy} className="mt-2 text-[11px] text-destructive hover:underline disabled:opacity-50">
              إزالة كلمة المرور
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
