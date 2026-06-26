"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, Check, ChevronRight, ChevronLeft } from "lucide-react"
import Link from "next/link"

const COLLABORATION_OPTIONS = [
  { value: "episode_partnership", label: "شريك حلقة" },
  { value: "season_partnership", label: "شريك موسم" },
  { value: "collaborative_episode", label: "حلقة بتوقيع مشترك" },
  { value: "custom_strategic", label: "شراكة استراتيجية مخصّصة" },
  { value: "website_presence", label: "حضور على الموقع" },
  { value: "social_media_content", label: "محتوى على المنصات" },
  { value: "live_event", label: "فعالية حية" },
  { value: "not_sure", label: "غير متأكد بعد — أرشدونا" },
]

const GOAL_OPTIONS = [
  { value: "brand_awareness", label: "بناء الوعي بالعلامة" },
  { value: "product_launch", label: "إطلاق منتج أو خدمة" },
  { value: "brand_image", label: "تعزيز صورة العلامة ومكانتها" },
  { value: "thought_leadership", label: "ريادة فكرية في المجال" },
  { value: "recruitment", label: "استقطاب المواهب" },
  { value: "community_engagement", label: "التواصل العميق مع المجتمع" },
  { value: "other", label: "هدف آخر" },
]

const BUDGET_OPTIONS = [
  { value: "below_500", label: "أقل من 500 د.ك" },
  { value: "500_1000", label: "500 – 1,000 د.ك" },
  { value: "1000_3000", label: "1,000 – 3,000 د.ك" },
  { value: "3000_plus", label: "أكثر من 3,000 د.ك" },
  { value: "flexible", label: "مرن / حسب المقترح" },
]

const STEPS = [
  { number: "١", label: "الشركة" },
  { number: "٢", label: "العلامة والجمهور" },
  { number: "٣", label: "الأهداف والتوقعات" },
  { number: "٤", label: "الخبرة والتفاصيل" },
]

export function PartnerApplicationForm() {
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [reference, setReference] = useState("")

  // Step 1 — company
  const [companyName, setCompanyName] = useState("")
  const [industry, setIndustry] = useState("")
  const [companyWebsite, setCompanyWebsite] = useState("")
  const [contactName, setContactName] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  // Step 2 — brand & audience
  const [brandValues, setBrandValues] = useState("")
  const [targetAudience, setTargetAudience] = useState("")
  const [collaborationTypes, setCollaborationTypes] = useState<string[]>([])
  // Step 3 — objectives & expectations
  const [mainGoal, setMainGoal] = useState("")
  const [campaignGoals, setCampaignGoals] = useState("")
  const [expectations, setExpectations] = useState("")
  const [preferredTimeline, setPreferredTimeline] = useState("")
  // Step 4 — experience & details
  const [previousPartnerships, setPreviousPartnerships] = useState("")
  const [budgetRange, setBudgetRange] = useState("")
  const [additionalInfo, setAdditionalInfo] = useState("")

  const toggleCollaboration = (value: string) =>
    setCollaborationTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )

  function validateStep(s: number): string | null {
    switch (s) {
      case 0:
        if (!companyName.trim()) return "اسم الشركة مطلوب"
        if (!industry.trim()) return "المجال مطلوب"
        if (!contactName.trim()) return "اسم المسؤول مطلوب"
        if (!jobTitle.trim()) return "المسمى الوظيفي مطلوب"
        if (!email.trim() || !email.includes("@")) return "البريد الإلكتروني غير صالح"
        if (!phone.trim() || phone.trim().length < 8) return "رقم الهاتف مطلوب (8 أرقام على الأقل)"
        return null
      case 1:
        if (!brandValues.trim()) return "أخبرنا بما تمثّله علامتك"
        if (!targetAudience.trim()) return "الجمهور المستهدف مطلوب"
        if (collaborationTypes.length === 0) return "اختر نوع تعاون واحدًا على الأقل"
        return null
      case 2:
        if (!mainGoal) return "اختر الهدف الرئيسي"
        if (!campaignGoals.trim()) return "صف كيف يبدو النجاح بالنسبة لك"
        return null
      case 3:
        if (!budgetRange) return "اختر نطاق الميزانية"
        return null
      default:
        return null
    }
  }

  function handleNext() {
    const error = validateStep(step)
    if (error) {
      setStatus("error")
      setMessage(error)
      return
    }
    setStatus("idle")
    setMessage("")
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function handleBack() {
    setStatus("idle")
    setMessage("")
    setStep((s) => Math.max(s - 1, 0))
  }

  const handleSubmit = async () => {
    const error = validateStep(step)
    if (error) {
      setStatus("error")
      setMessage(error)
      return
    }
    setStatus("loading")
    setMessage("")

    const data = {
      company_name: companyName,
      industry,
      company_website: companyWebsite || null,
      contact_name: contactName,
      job_title: jobTitle,
      email,
      phone,
      collaboration_types: collaborationTypes,
      collaboration_other: null,
      main_goal: mainGoal,
      target_audience: targetAudience,
      brand_values: brandValues || null,
      campaign_goals: campaignGoals || null,
      expectations: expectations || null,
      previous_partnerships: previousPartnerships || null,
      preferred_timeline: preferredTimeline || null,
      budget_range: budgetRange,
      additional_info: additionalInfo || null,
    }

    try {
      const response = await fetch("/api/sponsor", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (response.ok) {
        setReference(result.reference || "")
        setStatus("success")
      } else {
        setStatus("error")
        setMessage(result.error || "صار خطأ، حاول مرة ثانية")
      }
    } catch {
      setStatus("error")
      setMessage("صار خطأ، حاول مرة ثانية")
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Check className="h-7 w-7 text-primary" />
        </div>
        <h3 className="mt-5 text-xl font-semibold">وصلنا طلبك — شكرًا لثقتك بخط</h3>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          سيراجع فريقنا طلبك بعناية ويعود إليك بمقترح شراكة مصمّم حول أهدافك. عادةً نرد خلال أيام
          عمل قليلة، وأرسلنا لك تأكيدًا على بريدك.
        </p>
        {reference && (
          <div className="mx-auto mt-5 inline-flex flex-col items-center rounded-xl border border-primary/20 bg-primary/[0.04] px-6 py-3">
            <span className="text-[11px] tracking-wide text-muted-foreground">رقمك المرجعي</span>
            <span className="text-lg font-extrabold tracking-widest text-primary" dir="ltr">{reference}</span>
          </div>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/episodes">
            <Button variant="outline">استكشف الحلقات</Button>
          </Link>
          <Link href="/">
            <Button variant="ghost">العودة للرئيسية</Button>
          </Link>
        </div>
      </div>
    )
  }

  const isLastStep = step === STEPS.length - 1
  const disabled = status === "loading"

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={`h-1.5 w-full rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
            <span
              className={`hidden text-[10px] transition-colors sm:block ${
                i <= step ? "font-medium text-primary" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {STEPS[step].number}
        </div>
        <h3 className="text-lg font-semibold">{STEPS[step].label}</h3>
        <span className="ms-auto text-sm text-muted-foreground">
          {step + 1} / {STEPS.length}
        </span>
      </div>

      {/* Step 1 — Company */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم الشركة *">
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={disabled} />
            </Field>
            <Field label="المجال / الصناعة *">
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={disabled} />
            </Field>
          </div>
          <Field label="الموقع الإلكتروني" hint="يساعدنا على فهم علامتك بشكل أعمق">
            <Input
              value={companyWebsite}
              onChange={(e) => setCompanyWebsite(e.target.value)}
              placeholder="example.com"
              dir="ltr"
              disabled={disabled}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم المسؤول *">
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={disabled} />
            </Field>
            <Field label="المسمى الوظيفي *">
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} disabled={disabled} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="البريد الإلكتروني *">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" disabled={disabled} />
            </Field>
            <Field label="رقم الهاتف *">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" disabled={disabled} />
            </Field>
          </div>
        </div>
      )}

      {/* Step 2 — Brand & audience */}
      {step === 1 && (
        <div className="space-y-4">
          <Field label="ما الذي تمثّله علامتكم؟ *" hint="قيمكم، رسالتكم، والنبرة التي تميّزكم">
            <Textarea
              value={brandValues}
              onChange={(e) => setBrandValues(e.target.value)}
              rows={3}
              placeholder="بِمَ تؤمن علامتكم؟ وما القيم التي تريدون أن يربطها الجمهور بها؟"
              disabled={disabled}
            />
          </Field>
          <Field label="الجمهور الذي تريدون الوصول إليه *">
            <Input
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="مثال: شباب الخليج المهتمون بالتقنية وريادة الأعمال (18–35)"
              disabled={disabled}
            />
          </Field>
          <div className="space-y-2">
            <Label>
              أنواع التعاون التي تهمّكم *{" "}
              <span className="font-normal text-muted-foreground">(اختر واحدة أو أكثر)</span>
            </Label>
            <div className="grid gap-2 sm:grid-cols-2" role="group">
              {COLLABORATION_OPTIONS.map((o) => (
                <SelectChip
                  key={o.value}
                  type="checkbox"
                  checked={collaborationTypes.includes(o.value)}
                  onChange={() => toggleCollaboration(o.value)}
                  label={o.label}
                  disabled={disabled}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Objectives & expectations */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>الهدف الرئيسي من الشراكة *</Label>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {GOAL_OPTIONS.map((o) => (
                <SelectChip
                  key={o.value}
                  type="radio"
                  name="main_goal"
                  checked={mainGoal === o.value}
                  onChange={() => setMainGoal(o.value)}
                  label={o.label}
                  disabled={disabled}
                />
              ))}
            </div>
          </div>
          <Field label="كيف يبدو النجاح بالنسبة لكم؟ *" hint="الأهداف أو المؤشرات التي تقيسون بها نجاح الحملة">
            <Textarea
              value={campaignGoals}
              onChange={(e) => setCampaignGoals(e.target.value)}
              rows={3}
              placeholder="مثال: الوصول لـ X مشاهدة، نمو متابعين، تفاعل مع إطلاق، إدراك علامة لدى فئة محددة..."
              disabled={disabled}
            />
          </Field>
          <Field label="ما الذي تتوقعونه من خط؟" hint="اختياري — يساعدنا على مواءمة المقترح مع توقعاتكم">
            <Textarea
              value={expectations}
              onChange={(e) => setExpectations(e.target.value)}
              rows={2}
              placeholder="ما الذي تأملون أن تحققه هذه الشراكة معنا تحديدًا؟"
              disabled={disabled}
            />
          </Field>
          <Field label="الإطار الزمني المفضّل" hint="اختياري">
            <Input
              value={preferredTimeline}
              onChange={(e) => setPreferredTimeline(e.target.value)}
              placeholder="مثال: الربع الثاني 2026"
              disabled={disabled}
            />
          </Field>
        </div>
      )}

      {/* Step 4 — Experience & details */}
      {step === 3 && (
        <div className="space-y-4">
          <Field label="خبرتكم السابقة مع شراكات المحتوى" hint="اختياري — رعايات أو شراكات بودكاست/مؤثرين سابقة">
            <Textarea
              value={previousPartnerships}
              onChange={(e) => setPreviousPartnerships(e.target.value)}
              rows={2}
              placeholder="هل سبق أن تعاونتم مع بودكاست أو منصة محتوى؟ وكيف كانت التجربة؟"
              disabled={disabled}
            />
          </Field>
          <div className="space-y-2">
            <Label>نطاق الميزانية التقريبي *</Label>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {BUDGET_OPTIONS.map((o) => (
                <SelectChip
                  key={o.value}
                  type="radio"
                  name="budget_range"
                  checked={budgetRange === o.value}
                  onChange={() => setBudgetRange(o.value)}
                  label={o.label}
                  disabled={disabled}
                />
              ))}
            </div>
          </div>
          <Field label="أي شيء آخر تودون مشاركته؟" hint="اختياري">
            <Textarea
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              rows={3}
              placeholder="رؤيتكم للشراكة، متطلبات خاصة، أو أسئلة تودون طرحها..."
              disabled={disabled}
            />
          </Field>
        </div>
      )}

      {message && status === "error" && (
        <p className="text-sm text-destructive">{message}</p>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-3">
        {step > 0 && (
          <Button type="button" variant="outline" onClick={handleBack} disabled={disabled} className="gap-1.5">
            <ChevronRight className="h-4 w-4" />
            السابق
          </Button>
        )}
        <div className="flex-1" />
        {isLastStep ? (
          <Button type="button" onClick={handleSubmit} size="lg" disabled={disabled} className="min-w-[170px]">
            {status === "loading" ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                جارٍ الإرسال...
              </>
            ) : (
              "أرسل طلب الشراكة"
            )}
          </Button>
        ) : (
          <Button type="button" onClick={handleNext} size="lg" disabled={disabled} className="min-w-[120px] gap-1.5">
            التالي
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function SelectChip({
  type,
  name,
  checked,
  onChange,
  label,
  disabled,
}: {
  type: "checkbox" | "radio"
  name?: string
  checked: boolean
  onChange: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
        checked
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border hover:border-primary/30"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="accent-primary"
        disabled={disabled}
      />
      <span className="text-sm">{label}</span>
    </label>
  )
}
