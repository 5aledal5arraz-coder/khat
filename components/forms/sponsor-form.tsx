"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, Check } from "lucide-react"
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

export function SponsorForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [collaborationTypes, setCollaborationTypes] = useState<string[]>([])
  const [mainGoal, setMainGoal] = useState("")
  const [budgetRange, setBudgetRange] = useState("")

  const handleCollaborationToggle = (value: string) => {
    setCollaborationTypes((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value]
    )
  }

  const isFormValid = collaborationTypes.length > 0 && mainGoal && budgetRange

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!isFormValid) {
      setStatus("error")
      if (collaborationTypes.length === 0) {
        setMessage("يرجى اختيار نوع تعاون واحد على الأقل")
      } else if (!mainGoal) {
        setMessage("يرجى اختيار الهدف الرئيسي من الشراكة")
      } else if (!budgetRange) {
        setMessage("يرجى اختيار نطاق الميزانية")
      }
      return
    }

    setStatus("loading")
    setMessage("")

    const formData = new FormData(e.currentTarget)
    const data = {
      company_name: formData.get("company_name") as string,
      industry: formData.get("industry") as string,
      contact_name: formData.get("contact_name") as string,
      job_title: formData.get("job_title") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      collaboration_types: collaborationTypes,
      collaboration_other: (formData.get("collaboration_other") as string) || null,
      main_goal: mainGoal,
      target_audience: formData.get("target_audience") as string,
      preferred_timeline: (formData.get("preferred_timeline") as string) || null,
      budget_range: budgetRange,
      additional_info: (formData.get("additional_info") as string) || null,
    }

    try {
      const response = await fetch("/api/sponsor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (response.ok) {
        setStatus("success")
      } else {
        setStatus("error")
        setMessage(result.error || "حدث خطأ. يرجى المحاولة مرة أخرى.")
      }
    } catch {
      setStatus("error")
      setMessage("حدث خطأ. يرجى المحاولة مرة أخرى.")
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-8 text-center">
        <Check className="mx-auto h-12 w-12 text-green-600" />
        <h3 className="mt-4 text-xl font-semibold">شكرًا لاهتمامك بالشراكة مع خط</h3>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          سنراجع طلبك ونعود إليك بخطة تعاون مقترحة تناسب أهدافك.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => setStatus("idle")}>
            إرسال طلب آخر
          </Button>
          <Link href="/">
            <Button variant="ghost">العودة للرئيسية</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Section 1: Company Information */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            ١
          </div>
          <h3 className="font-semibold">معلومات الشركة</h3>
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company_name">اسم الشركة *</Label>
              <Input
                id="company_name"
                name="company_name"
                required
                disabled={status === "loading"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">المجال / الصناعة *</Label>
              <Input
                id="industry"
                name="industry"
                required
                disabled={status === "loading"}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact_name">اسم المسؤول *</Label>
              <Input
                id="contact_name"
                name="contact_name"
                required
                disabled={status === "loading"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job_title">المسمى الوظيفي *</Label>
              <Input
                id="job_title"
                name="job_title"
                required
                disabled={status === "loading"}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                disabled={status === "loading"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">رقم الهاتف *</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                required
                minLength={8}
                disabled={status === "loading"}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Campaign Details */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            ٢
          </div>
          <h3 className="font-semibold">تفاصيل التعاون</h3>
        </div>
        <div className="space-y-4">
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
                  } ${status === "loading" ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={collaborationTypes.includes(option.value)}
                    onChange={() => handleCollaborationToggle(option.value)}
                    className="accent-primary"
                    disabled={status === "loading"}
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
                name="collaboration_other"
                placeholder="اشرح نوع التعاون الذي تفكر فيه..."
                disabled={status === "loading"}
              />
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Objectives */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            ٣
          </div>
          <h3 className="font-semibold">الأهداف</h3>
        </div>
        <div className="space-y-4">
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
                  } ${status === "loading" ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <input
                    type="radio"
                    name="main_goal_radio"
                    checked={mainGoal === option.value}
                    onChange={() => setMainGoal(option.value)}
                    className="accent-primary"
                    disabled={status === "loading"}
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
              name="target_audience"
              placeholder="مثال: شباب الخليج المهتمين بالتقنية (18-35)"
              required
              disabled={status === "loading"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferred_timeline">الجدول الزمني المفضل</Label>
            <Input
              id="preferred_timeline"
              name="preferred_timeline"
              placeholder="مثال: الربع الثاني 2026"
              disabled={status === "loading"}
            />
          </div>
        </div>
      </div>

      {/* Section 4: Budget */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            ٤
          </div>
          <h3 className="font-semibold">الميزانية</h3>
        </div>
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
                } ${status === "loading" ? "opacity-50 pointer-events-none" : ""}`}
              >
                <input
                  type="radio"
                  name="budget_range_radio"
                  checked={budgetRange === option.value}
                  onChange={() => setBudgetRange(option.value)}
                  className="accent-primary"
                  disabled={status === "loading"}
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Section 5: Additional Info */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            ٥
          </div>
          <h3 className="font-semibold">معلومات إضافية</h3>
        </div>
        <div className="space-y-2">
          <Label htmlFor="additional_info">أي تفاصيل أخرى تود مشاركتها</Label>
          <Textarea
            id="additional_info"
            name="additional_info"
            rows={4}
            placeholder="أخبرنا المزيد عن رؤيتك للشراكة أو أي متطلبات خاصة..."
            disabled={status === "loading"}
          />
        </div>
      </div>

      {message && status === "error" && (
        <p className="text-sm text-destructive">{message}</p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={status === "loading"}>
        {status === "loading" ? (
          <>
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
            جاري الإرسال...
          </>
        ) : (
          "أرسل طلب الشراكة"
        )}
      </Button>
    </form>
  )
}
