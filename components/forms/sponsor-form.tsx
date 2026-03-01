"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, Check, ChevronRight, ChevronLeft } from "lucide-react"
import Link from "next/link"

const COLLABORATION_OPTIONS = [
  { value: "episode_partnership", label: "شراكة حلقة" },
  { value: "multiple_episodes", label: "عدة حلقات" },
  { value: "season_partnership", label: "شراكة موسم" },
  { value: "collaborative_episode", label: "حلقة تعاونية" },
  { value: "website_presence", label: "ظهور على الموقع" },
  { value: "social_media_content", label: "محتوى سوشيال ميديا" },
  { value: "live_event", label: "فعالية حية" },
  { value: "other", label: "أخرى" },
]

const GOAL_OPTIONS = [
  { value: "brand_awareness", label: "زيادة الوعي بالعلامة التجارية" },
  { value: "product_launch", label: "إطلاق منتج أو خدمة" },
  { value: "brand_image", label: "تعزيز صورة العلامة التجارية" },
  { value: "recruitment", label: "استقطاب المواهب" },
  { value: "community_engagement", label: "التفاعل مع المجتمع" },
  { value: "other", label: "أخرى" },
]

const BUDGET_OPTIONS = [
  { value: "below_500", label: "أقل من 500 د.ك" },
  { value: "500_1000", label: "500 - 1,000 د.ك" },
  { value: "1000_3000", label: "1,000 - 3,000 د.ك" },
  { value: "3000_plus", label: "أكثر من 3,000 د.ك" },
]

const STEPS = [
  { number: "١", label: "معلومات الشركة" },
  { number: "٢", label: "تفاصيل التعاون" },
  { number: "٣", label: "الأهداف" },
  { number: "٤", label: "الميزانية والتفاصيل" },
]

export function SponsorForm() {
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [collaborationTypes, setCollaborationTypes] = useState<string[]>([])
  const [mainGoal, setMainGoal] = useState("")
  const [budgetRange, setBudgetRange] = useState("")

  // Form fields state (needed since we hide/show sections)
  const [companyName, setCompanyName] = useState("")
  const [industry, setIndustry] = useState("")
  const [contactName, setContactName] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [collaborationOther, setCollaborationOther] = useState("")
  const [targetAudience, setTargetAudience] = useState("")
  const [preferredTimeline, setPreferredTimeline] = useState("")
  const [additionalInfo, setAdditionalInfo] = useState("")

  const handleCollaborationToggle = (value: string) => {
    setCollaborationTypes((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value]
    )
  }

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
        if (collaborationTypes.length === 0) return "يرجى اختيار نوع تعاون واحد على الأقل"
        return null
      case 2:
        if (!mainGoal) return "يرجى اختيار الهدف الرئيسي"
        if (!targetAudience.trim()) return "الجمهور المستهدف مطلوب"
        return null
      case 3:
        if (!budgetRange) return "يرجى اختيار نطاق الميزانية"
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
      contact_name: contactName,
      job_title: jobTitle,
      email,
      phone,
      collaboration_types: collaborationTypes,
      collaboration_other: collaborationOther || null,
      main_goal: mainGoal,
      target_audience: targetAudience,
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
      <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-8 text-center">
        <Check className="mx-auto h-12 w-12 text-green-600" />
        <h3 className="mt-4 text-xl font-semibold">شكراً لاهتمامك بالشراكة مع خط</h3>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          بنراجع طلبك ونرد عليك بخطة تعاون تناسب أهدافك.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => { setStatus("idle"); setStep(0) }}>
            أرسل طلب ثاني
          </Button>
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
      {/* Progress Bar */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className={`h-1.5 w-full rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
            <span className={`text-[10px] hidden sm:block transition-colors ${
              i <= step ? "text-primary font-medium" : "text-muted-foreground"
            }`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
          {STEPS[step].number}
        </div>
        <h3 className="text-lg font-semibold">{STEPS[step].label}</h3>
        <span className="text-sm text-muted-foreground ms-auto">
          {step + 1} / {STEPS.length}
        </span>
      </div>

      {/* Step 1: Company Information */}
      {step === 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-start-4 duration-300">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company_name">اسم الشركة *</Label>
              <Input id="company_name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">المجال / الصناعة *</Label>
              <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} required disabled={disabled} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact_name">اسم المسؤول *</Label>
              <Input id="contact_name" value={contactName} onChange={(e) => setContactName(e.target.value)} required disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job_title">المسمى الوظيفي *</Label>
              <Input id="job_title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required disabled={disabled} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني *</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={disabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف *</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={8} disabled={disabled} />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Collaboration Details */}
      {step === 1 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-start-4 duration-300">
          <div className="space-y-2">
            <Label>أنواع التعاون المطلوبة * <span className="text-muted-foreground font-normal">(اختر واحدة أو أكثر)</span></Label>
            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="أنواع التعاون المطلوبة">
              {COLLABORATION_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                    collaborationTypes.includes(option.value)
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30"
                  } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={collaborationTypes.includes(option.value)}
                    onChange={() => handleCollaborationToggle(option.value)}
                    className="accent-primary"
                    disabled={disabled}
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          {collaborationTypes.includes("other") && (
            <div className="space-y-2">
              <Label htmlFor="collaboration_other">وصف التعاون الآخر</Label>
              <Input
                id="collaboration_other"
                value={collaborationOther}
                onChange={(e) => setCollaborationOther(e.target.value)}
                placeholder="اشرح نوع التعاون الذي تفكر فيه..."
                disabled={disabled}
              />
            </div>
          )}
        </div>
      )}

      {/* Step 3: Objectives */}
      {step === 2 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-start-4 duration-300">
          <div className="space-y-2">
            <Label>الهدف الرئيسي من الشراكة *</Label>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-required="true" aria-label="الهدف الرئيسي من الشراكة">
              {GOAL_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                    mainGoal === option.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30"
                  } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <input
                    type="radio"
                    name="main_goal_radio"
                    checked={mainGoal === option.value}
                    onChange={() => setMainGoal(option.value)}
                    className="accent-primary"
                    disabled={disabled}
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="target_audience">الجمهور المستهدف *</Label>
            <Input
              id="target_audience"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="مثال: شباب الخليج المهتمين بالتقنية (18-35)"
              required
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferred_timeline">الجدول الزمني المفضل</Label>
            <Input
              id="preferred_timeline"
              value={preferredTimeline}
              onChange={(e) => setPreferredTimeline(e.target.value)}
              placeholder="مثال: الربع الثاني 2026"
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {/* Step 4: Budget + Additional Info */}
      {step === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-start-4 duration-300">
          <div className="space-y-2">
            <Label>نطاق الميزانية التقريبي *</Label>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-required="true" aria-label="نطاق الميزانية التقريبي">
              {BUDGET_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                    budgetRange === option.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30"
                  } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <input
                    type="radio"
                    name="budget_range_radio"
                    checked={budgetRange === option.value}
                    onChange={() => setBudgetRange(option.value)}
                    className="accent-primary"
                    disabled={disabled}
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="additional_info">أي تفاصيل أخرى تود مشاركتها</Label>
            <Textarea
              id="additional_info"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              rows={4}
              placeholder="أخبرنا المزيد عن رؤيتك للشراكة أو أي متطلبات خاصة..."
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
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
          <Button type="button" onClick={handleSubmit} size="lg" disabled={disabled} className="min-w-[160px]">
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
          <Button type="button" onClick={handleNext} size="lg" disabled={disabled} className="gap-1.5 min-w-[120px]">
            التالي
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
