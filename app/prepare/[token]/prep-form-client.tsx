"use client"

import { useState } from "react"
import type { GuestPrepResponse, GuestPrepFormStatus } from "@/types/database"

interface PrepFormClientProps {
  token: string
  guestName: string
  status: GuestPrepFormStatus
  existingResponse: GuestPrepResponse | null
  editable: boolean
}

const DAYS = [
  { value: "sunday", label: "الأحد" },
  { value: "monday", label: "الاثنين" },
  { value: "tuesday", label: "الثلاثاء" },
  { value: "wednesday", label: "الأربعاء" },
  { value: "thursday", label: "الخميس" },
  { value: "saturday", label: "السبت" },
]

const TIMES = [
  { value: "morning", label: "صباحاً (٩–١٢)" },
  { value: "afternoon", label: "ظهراً (١٢–٤)" },
  { value: "evening", label: "مساءً (٤–٨)" },
]

export function PrepFormClient({ token, guestName, status, existingResponse, editable }: PrepFormClientProps) {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(status === "submitted" || status === "locked")
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [preferredName, setPreferredName] = useState(existingResponse?.preferred_name || "")
  const [pronunciationNotes, setPronunciationNotes] = useState(existingResponse?.pronunciation_notes || "")
  const [phoneWhatsapp, setPhoneWhatsapp] = useState(existingResponse?.phone_whatsapp || "")
  const [socialAccounts, setSocialAccounts] = useState(existingResponse?.social_accounts || {})
  const [preferredDrink, setPreferredDrink] = useState(existingResponse?.preferred_drink || "")
  const [preferredFilmingDays, setPreferredFilmingDays] = useState<string[]>(existingResponse?.preferred_filming_days || [])
  const [preferredFilmingTime, setPreferredFilmingTime] = useState(existingResponse?.preferred_filming_time || "")
  const [schedulingRestrictions, setSchedulingRestrictions] = useState(existingResponse?.scheduling_restrictions || "")
  const [arrivalConfirmation, setArrivalConfirmation] = useState(existingResponse?.arrival_confirmation || false)
  const [clothingAcknowledgment, setClothingAcknowledgment] = useState(existingResponse?.clothing_acknowledgment || false)
  const [locationConfirmation, setLocationConfirmation] = useState(existingResponse?.location_confirmation || false)
  const [technicalNeeds, setTechnicalNeeds] = useState(existingResponse?.technical_needs || "")
  const [topicsExcitedAbout, setTopicsExcitedAbout] = useState(existingResponse?.topics_excited_about || "")
  const [sensitivitiesToAvoid, setSensitivitiesToAvoid] = useState(existingResponse?.sensitivities_to_avoid || "")
  const [teamNotes, setTeamNotes] = useState(existingResponse?.team_notes || "")

  const toggleDay = (day: string) => {
    setPreferredFilmingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  const updateSocial = (key: string, value: string) => {
    setSocialAccounts((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    setError(null)
    setSubmitting(true)

    const response: GuestPrepResponse = {
      preferred_name: preferredName.trim(),
      pronunciation_notes: pronunciationNotes.trim() || null,
      phone_whatsapp: phoneWhatsapp.trim(),
      social_accounts: socialAccounts,
      preferred_drink: preferredDrink.trim(),
      preferred_filming_days: preferredFilmingDays,
      preferred_filming_time: preferredFilmingTime,
      scheduling_restrictions: schedulingRestrictions.trim() || null,
      arrival_confirmation: arrivalConfirmation,
      clothing_acknowledgment: clothingAcknowledgment,
      location_confirmation: locationConfirmation,
      technical_needs: technicalNeeds.trim() || null,
      topics_excited_about: topicsExcitedAbout.trim(),
      sensitivities_to_avoid: sensitivitiesToAvoid.trim() || null,
      team_notes: teamNotes.trim() || null,
    }

    try {
      const res = await fetch(`/api/prepare/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      })
      const data = await res.json()

      if (res.ok) {
        setSubmitted(true)
      } else {
        setError(data.error || "حدث خطأ أثناء الإرسال")
      }
    } catch {
      setError("فشل الاتصال بالخادم")
    } finally {
      setSubmitting(false)
    }
  }

  // Success state
  if (submitted && !editable) {
    return <SuccessState guestName={guestName} />
  }
  if (submitted && editable && status === "submitted") {
    return (
      <SuccessState guestName={guestName}>
        <button
          onClick={() => setSubmitted(false)}
          className="mt-4 rounded-xl border border-border/30 px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
        >
          تعديل الإجابات
        </button>
      </SuccessState>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mb-4 text-sm font-medium tracking-wide text-muted-foreground">خط بودكاست</div>
        <h1 className="mb-3 text-2xl font-bold text-foreground sm:text-3xl">استبيان التحضير للحلقة</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          أهلاً <span className="font-medium text-foreground">{guestName}</span>، شكراً لقبولك دعوتنا. هذا الاستبيان يساعدنا في تحضير أفضل تجربة تسجيل ممكنة لك.
        </p>
      </div>

      {/* Instructions card */}
      <div className="mb-10 rounded-2xl border border-primary/10 bg-primary/[0.03] p-5 sm:p-6">
        <h2 className="mb-3 text-sm font-semibold text-primary">ملاحظات مهمة</h2>
        <ul className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">
          <li className="flex gap-2">
            <span className="mt-1 shrink-0 text-primary">•</span>
            <span>يرجى الحضور <strong className="text-foreground">قبل ٣٠ دقيقة</strong> من موعد التسجيل لإتمام التحضيرات</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1 shrink-0 text-primary">•</span>
            <span>نفضّل الملابس ذات الألوان <strong className="text-foreground">الهادئة والموحّدة</strong> — تجنّب الخطوط والنقوش الدقيقة والأبيض الساطع</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1 shrink-0 text-primary">•</span>
            <span>التسجيل يتم في <strong className="text-foreground">الاستوديو</strong> — سنشارك الموقع الدقيق بعد تأكيد الموعد</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1 shrink-0 text-primary">•</span>
            <span>لا حاجة لتحضير إجابات محفوظة — الحوار طبيعي وعفوي</span>
          </li>
        </ul>
      </div>

      {/* Form */}
      <div className="space-y-10">
        {/* Section 1: Personal */}
        <FormSection title="المعلومات الشخصية">
          <FormField label="كيف تحب ننادك أثناء التسجيل؟" required>
            <input
              type="text"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              placeholder="الاسم المفضل"
              className="form-input"
            />
          </FormField>

          <FormField label="ملاحظات على نطق اسمك" hint="هل هناك طريقة معينة لنطق اسمك يجب أن نعرفها؟">
            <input
              type="text"
              value={pronunciationNotes}
              onChange={(e) => setPronunciationNotes(e.target.value)}
              placeholder="اختياري"
              className="form-input"
            />
          </FormField>

          <FormField label="رقم الهاتف / واتساب" required>
            <input
              type="tel"
              dir="ltr"
              value={phoneWhatsapp}
              onChange={(e) => setPhoneWhatsapp(e.target.value)}
              placeholder="+965 XXXX XXXX"
              className="form-input text-left"
            />
          </FormField>
        </FormSection>

        {/* Section 2: Social */}
        <FormSection title="حسابات التواصل الاجتماعي" subtitle="اختياري — لمشاركتها عند نشر الحلقة">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: "instagram", label: "Instagram", placeholder: "@username" },
              { key: "twitter", label: "X / Twitter", placeholder: "@username" },
              { key: "linkedin", label: "LinkedIn", placeholder: "رابط الملف الشخصي" },
              { key: "youtube", label: "YouTube", placeholder: "رابط القناة" },
              { key: "tiktok", label: "TikTok", placeholder: "@username" },
              { key: "website", label: "موقع شخصي", placeholder: "https://..." },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
                <input
                  type="text"
                  dir="ltr"
                  value={(socialAccounts as Record<string, string>)[key] || ""}
                  onChange={(e) => updateSocial(key, e.target.value)}
                  placeholder={placeholder}
                  className="form-input text-left text-[13px]"
                />
              </div>
            ))}
          </div>
        </FormSection>

        {/* Section 3: Logistics */}
        <FormSection title="التحضيرات اللوجستية">
          <FormField label="ما مشروبك المفضل؟" hint="سنحضّره لك في الاستوديو" required>
            <input
              type="text"
              value={preferredDrink}
              onChange={(e) => setPreferredDrink(e.target.value)}
              placeholder="مثال: قهوة سوداء، شاي أخضر، ماء..."
              className="form-input"
            />
          </FormField>

          <FormField label="الأيام المفضلة للتصوير" required>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleDay(value)}
                  className={`rounded-lg border px-3 py-1.5 text-[13px] transition-all ${
                    preferredFilmingDays.includes(value)
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border/30 text-muted-foreground hover:border-border/50 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="الوقت المفضل للتصوير" required>
            <div className="flex flex-wrap gap-2">
              {TIMES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPreferredFilmingTime(value)}
                  className={`rounded-lg border px-3 py-1.5 text-[13px] transition-all ${
                    preferredFilmingTime === value
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border/30 text-muted-foreground hover:border-border/50 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="هل لديك أي قيود على المواعيد؟" hint="تواريخ سفر، التزامات عمل، أو أي شيء يجب مراعاته">
            <textarea
              value={schedulingRestrictions}
              onChange={(e) => setSchedulingRestrictions(e.target.value)}
              placeholder="اختياري"
              rows={2}
              className="form-input resize-none"
            />
          </FormField>

          <FormField label="هل لديك أي احتياجات تقنية خاصة؟" hint="إضاءة معينة، ميكروفون خارجي، أو أي متطلبات أخرى">
            <textarea
              value={technicalNeeds}
              onChange={(e) => setTechnicalNeeds(e.target.value)}
              placeholder="اختياري"
              rows={2}
              className="form-input resize-none"
            />
          </FormField>
        </FormSection>

        {/* Section 4: Content */}
        <FormSection title="عن الحوار">
          <FormField label="ما المواضيع التي تتحمس للحديث عنها؟" required hint="ليس بالضرورة مواضيع محددة — يمكن أن تكون أفكاراً أو تجارب أو زوايا تهمك">
            <textarea
              value={topicsExcitedAbout}
              onChange={(e) => setTopicsExcitedAbout(e.target.value)}
              placeholder="شاركنا ما يحمّسك..."
              rows={3}
              className="form-input resize-none"
            />
          </FormField>

          <FormField label="هل هناك مواضيع أو أمور تفضّل تجنّبها في الحوار؟" hint="أي حساسيات أو خطوط حمراء يجب أن نراعيها">
            <textarea
              value={sensitivitiesToAvoid}
              onChange={(e) => setSensitivitiesToAvoid(e.target.value)}
              placeholder="اختياري — خصوصيتك مهمة لنا"
              rows={2}
              className="form-input resize-none"
            />
          </FormField>
        </FormSection>

        {/* Section 5: Confirmations */}
        <FormSection title="التأكيدات">
          <Checkbox
            checked={arrivalConfirmation}
            onChange={setArrivalConfirmation}
            label="أتعهد بالحضور قبل ٣٠ دقيقة من موعد التسجيل"
            required
          />
          <Checkbox
            checked={clothingAcknowledgment}
            onChange={setClothingAcknowledgment}
            label="اطلعت على إرشادات الملابس (ألوان هادئة وموحّدة، بدون نقوش أو خطوط دقيقة)"
          />
          <Checkbox
            checked={locationConfirmation}
            onChange={setLocationConfirmation}
            label="أؤكد حضوري في الاستوديو للتسجيل"
            required
          />
        </FormSection>

        {/* Section 6: Notes */}
        <FormSection title="ملاحظات إضافية">
          <FormField label="هل لديك أي ملاحظات أو طلبات خاصة للفريق؟">
            <textarea
              value={teamNotes}
              onChange={(e) => setTeamNotes(e.target.value)}
              placeholder="أي شيء تحب نعرفه..."
              rows={3}
              className="form-input resize-none"
            />
          </FormField>
        </FormSection>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="pt-2 pb-8">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-xl bg-primary px-8 py-3.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "جارٍ الإرسال..." : existingResponse ? "حفظ التعديلات" : "إرسال الاستبيان"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SuccessState({ guestName, children }: { guestName: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
          <svg className="h-8 w-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mb-3 text-xl font-semibold text-foreground">تم استلام إجاباتك</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          شكراً <span className="font-medium text-foreground">{guestName}</span>. سيتواصل معك فريق خط قريباً لتأكيد موعد التسجيل ومشاركة تفاصيل الاستوديو.
        </p>
        {children}
        <div className="mt-8 text-xs text-muted-foreground/60">خط بودكاست</div>
      </div>
    </div>
  )
}

function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function FormField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-foreground">
        {label}
        {required && <span className="mr-1 text-red-400">*</span>}
      </label>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}

function Checkbox({ checked, onChange, label, required }: { checked: boolean; onChange: (v: boolean) => void; label: string; required?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/20 p-3 transition-colors hover:bg-muted/20">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
      />
      <span className="text-[13px] leading-relaxed text-foreground">
        {label}
        {required && <span className="mr-1 text-red-400">*</span>}
      </span>
    </label>
  )
}
