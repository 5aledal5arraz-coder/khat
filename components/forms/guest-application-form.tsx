"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Check, ChevronLeft, ChevronRight } from "lucide-react"

const COUNTRIES = [
  "الكويت",
  "السعودية",
  "الإمارات",
  "البحرين",
  "قطر",
  "عُمان",
  "العراق",
  "الأردن",
  "مصر",
  "لبنان",
  "سوريا",
  "فلسطين",
  "اليمن",
  "ليبيا",
  "تونس",
  "الجزائر",
  "المغرب",
  "السودان",
  "موريتانيا",
  "الصومال",
  "جيبوتي",
  "جزر القمر",
  "أخرى",
]

const STEPS = [
  { label: "المعلومات الأساسية", number: 1 },
  { label: "قصتك", number: 2 },
  { label: "التسجيل والظهور", number: 3 },
]

/* ─── Helper Components ─── */

function FieldLabel({
  children,
  hint,
  required,
}: {
  children: React.ReactNode
  hint?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">
        {children}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {hint && (
        <p className="text-xs leading-relaxed text-muted-foreground/60">
          {hint}
        </p>
      )}
    </div>
  )
}

function RadioOption({
  name,
  value,
  checked,
  onChange,
  disabled,
  children,
}: {
  name: string
  value: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-4 py-3 text-sm ring-1 transition-all ${
        checked
          ? "bg-primary/[0.06] text-foreground ring-primary/30"
          : "bg-white/[0.01] text-muted-foreground ring-border/30 hover:ring-border/60"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="accent-primary"
      />
      {children}
    </label>
  )
}

function StepIndicator({
  current,
  steps,
}: {
  current: number
  steps: typeof STEPS
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      {steps.map((step, i) => (
        <div key={step.number} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                i + 1 === current
                  ? "bg-primary text-primary-foreground"
                  : i + 1 < current
                    ? "bg-primary/20 text-primary"
                    : "bg-white/[0.04] text-muted-foreground/40 ring-1 ring-border/30"
              }`}
            >
              {i + 1 < current ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                step.number
              )}
            </div>
            <span
              className={`hidden text-xs font-medium sm:inline ${
                i + 1 === current
                  ? "text-foreground"
                  : i + 1 < current
                    ? "text-primary/70"
                    : "text-muted-foreground/40"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-px w-8 transition-all ${
                i + 1 < current ? "bg-primary/30" : "bg-border/30"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── Main Form ─── */

export function GuestApplicationForm() {
  const [step, setStep] = useState(1)
  const [formStatus, setFormStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle")
  const [errorMessage, setErrorMessage] = useState("")

  // Step 1 — Basic Info
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [country, setCountry] = useState("")
  const [canTravel, setCanTravel] = useState<string | null>(null)

  // Step 2 — Your Story
  const [storyIdea, setStoryIdea] = useState("")
  const [beyondJobTitle, setBeyondJobTitle] = useState("")
  const [lifeChangingMoment, setLifeChangingMoment] = useState("")
  const [hopePeopleUnderstand, setHopePeopleUnderstand] = useState("")
  const [unaskedQuestion, setUnaskedQuestion] = useState("")
  const [whyKhat, setWhyKhat] = useState("")

  // Step 3 — Recording & Appearance
  const [previousPodcast, setPreviousPodcast] = useState<boolean | null>(null)
  const [previousPodcastInfo, setPreviousPodcastInfo] = useState("")
  const [preferDialogueOrStory, setPreferDialogueOrStory] = useState("")
  const [topicsToAvoid, setTopicsToAvoid] = useState("")
  const [filmingConcern, setFilmingConcern] = useState<string | null>(null)
  const [agreesToPublish, setAgreesToPublish] = useState<boolean | null>(null)
  const [socialLinks, setSocialLinks] = useState("")

  const isOutsideKuwait = country !== "" && country !== "الكويت"

  const canProceedStep1 =
    name.trim() && email.trim() && phone.trim() && country

  const canProceedStep2 =
    storyIdea.trim() &&
    beyondJobTitle.trim() &&
    lifeChangingMoment.trim() &&
    hopePeopleUnderstand.trim() &&
    unaskedQuestion.trim() &&
    whyKhat.trim()

  const canSubmit =
    previousPodcast !== null &&
    preferDialogueOrStory.trim() &&
    filmingConcern !== null &&
    agreesToPublish === true

  const handleSubmit = async () => {
    setFormStatus("loading")

    const data = {
      name,
      email,
      phone,
      country,
      can_travel_to_kuwait: isOutsideKuwait ? canTravel : null,
      story_idea: storyIdea,
      beyond_job_title: beyondJobTitle,
      life_changing_moment: lifeChangingMoment,
      hope_people_understand: hopePeopleUnderstand,
      unasked_question: unaskedQuestion,
      why_khat: whyKhat,
      previous_podcast: previousPodcast,
      previous_podcast_info: previousPodcast ? previousPodcastInfo : null,
      prefer_dialogue_or_story: preferDialogueOrStory,
      topics_to_avoid: topicsToAvoid || null,
      filming_concern: filmingConcern,
      agrees_to_publish: agreesToPublish,
      social_links: socialLinks || null,
    }

    try {
      const response = await fetch("/api/guest-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (response.ok) {
        setFormStatus("success")
      } else {
        setFormStatus("error")
        setErrorMessage(
          result.error || "حدث خطأ. يرجى المحاولة مرة أخرى."
        )
      }
    } catch {
      setFormStatus("error")
      setErrorMessage("حدث خطأ. يرجى المحاولة مرة أخرى.")
    }
  }

  if (formStatus === "success") {
    return (
      <div className="rounded-3xl border border-primary/15 bg-primary/[0.03] px-8 py-14 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Check className="h-8 w-8 text-primary" />
        </div>
        <h3 className="mt-6 text-xl font-bold">وصلنا قصتك</h3>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          شكراً لمشاركتنا. سنراجع كل كلمة بعناية ونتواصل معك قريباً.
        </p>
        <p className="mt-6 text-xs text-muted-foreground/40">
          المحادثة بدأت من هنا.
        </p>
      </div>
    )
  }

  const loading = formStatus === "loading"

  return (
    <div className="space-y-8">
      {/* Progress */}
      <StepIndicator current={step} steps={STEPS} />

      {/* ═══ Step 1: Basic Information ═══ */}
      {step === 1 && (
        <div className="space-y-6 rounded-2xl border border-border/30 bg-card/50 p-6 backdrop-blur-sm sm:p-8">
          <div className="space-y-3">
            <FieldLabel required>
              اسمك الذي تحب أن نعرّفك به
            </FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              dir="auto"
            />
          </div>

          <div className="space-y-3">
            <FieldLabel required>البريد الإلكتروني</FieldLabel>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              dir="ltr"
              className="text-start"
            />
          </div>

          <div className="space-y-3">
            <FieldLabel required hint="واتساب إن أمكن">
              رقم الهاتف
            </FieldLabel>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+965 ..."
              disabled={loading}
              dir="ltr"
              className="text-start"
            />
          </div>

          <div className="space-y-3">
            <FieldLabel required>دولة الإقامة</FieldLabel>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value)
                setCanTravel(null)
              }}
              disabled={loading}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">اختر الدولة</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {isOutsideKuwait && (
            <div className="space-y-3 rounded-xl border border-primary/10 bg-primary/[0.03] p-5">
              <FieldLabel required>
                هل تستطيع الحضور إلى الكويت على نفقتك الخاصة لتسجيل الحلقة؟
              </FieldLabel>
              <div className="flex gap-3">
                <RadioOption
                  name="can_travel"
                  value="yes"
                  checked={canTravel === "yes"}
                  onChange={() => setCanTravel("yes")}
                  disabled={loading}
                >
                  نعم
                </RadioOption>
                <RadioOption
                  name="can_travel"
                  value="maybe"
                  checked={canTravel === "maybe"}
                  onChange={() => setCanTravel("maybe")}
                  disabled={loading}
                >
                  ربما
                </RadioOption>
                <RadioOption
                  name="can_travel"
                  value="no"
                  checked={canTravel === "no"}
                  onChange={() => setCanTravel("no")}
                  disabled={loading}
                >
                  لا
                </RadioOption>
              </div>
            </div>
          )}

          <Button
            onClick={() => setStep(2)}
            disabled={!canProceedStep1 || (isOutsideKuwait && !canTravel)}
            className="w-full gap-2 rounded-xl"
          >
            التالي
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ═══ Step 2: Your Story ═══ */}
      {step === 2 && (
        <div className="space-y-6 rounded-2xl border border-border/30 bg-card/50 p-6 backdrop-blur-sm sm:p-8">
          <div className="space-y-3">
            <FieldLabel
              required
              hint="لا تحتاج عنواناً مثالياً — اشرحها بكلماتك."
            >
              ما القصة أو الفكرة التي تود مشاركتها معنا؟
            </FieldLabel>
            <Textarea
              value={storyIdea}
              onChange={(e) => setStoryIdea(e.target.value)}
              rows={5}
              disabled={loading}
              dir="auto"
              className="leading-relaxed"
            />
          </div>

          <div className="space-y-3">
            <FieldLabel
              required
              hint="خبرات، صراعات، أو لحظات شكّلتك كإنسان."
            >
              من أنت بعيدًا عن المسمى الوظيفي؟
            </FieldLabel>
            <Textarea
              value={beyondJobTitle}
              onChange={(e) => setBeyondJobTitle(e.target.value)}
              rows={5}
              disabled={loading}
              dir="auto"
              className="leading-relaxed"
            />
          </div>

          <div className="space-y-3">
            <FieldLabel required>
              احكِ لنا عن لحظة في حياتك غيّرتك.
            </FieldLabel>
            <Textarea
              value={lifeChangingMoment}
              onChange={(e) => setLifeChangingMoment(e.target.value)}
              rows={6}
              disabled={loading}
              dir="auto"
              className="leading-relaxed"
            />
            <p className="text-[10px] text-muted-foreground/40">
              ٦–١٠ أسطر تقريباً
            </p>
          </div>

          <div className="space-y-3">
            <FieldLabel required>
              ما الذي تتمنى أن يفهمه الناس عنك بعد الحلقة؟
            </FieldLabel>
            <Textarea
              value={hopePeopleUnderstand}
              onChange={(e) => setHopePeopleUnderstand(e.target.value)}
              rows={4}
              disabled={loading}
              dir="auto"
              className="leading-relaxed"
            />
          </div>

          <div className="space-y-3">
            <FieldLabel required>
              ما السؤال الذي تتمنى أن أسألك إياه ولم يسألك أحد من قبل؟
            </FieldLabel>
            <Textarea
              value={unaskedQuestion}
              onChange={(e) => setUnaskedQuestion(e.target.value)}
              rows={3}
              disabled={loading}
              dir="auto"
              className="leading-relaxed"
            />
          </div>

          <div className="space-y-3">
            <FieldLabel required>
              لماذا اخترت بودكاست خط تحديدًا؟
            </FieldLabel>
            <Textarea
              value={whyKhat}
              onChange={(e) => setWhyKhat(e.target.value)}
              rows={4}
              disabled={loading}
              dir="auto"
              className="leading-relaxed"
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(1)}
              className="gap-2 rounded-xl"
            >
              <ChevronRight className="h-4 w-4" />
              السابق
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!canProceedStep2}
              className="flex-1 gap-2 rounded-xl"
            >
              التالي
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══ Step 3: Recording & Appearance ═══ */}
      {step === 3 && (
        <div className="space-y-6 rounded-2xl border border-border/30 bg-card/50 p-6 backdrop-blur-sm sm:p-8">
          <div className="space-y-3">
            <FieldLabel required>هل سبق لك الظهور في بودكاست؟</FieldLabel>
            <div className="flex gap-3">
              <RadioOption
                name="previous_podcast"
                value="yes"
                checked={previousPodcast === true}
                onChange={() => setPreviousPodcast(true)}
                disabled={loading}
              >
                نعم
              </RadioOption>
              <RadioOption
                name="previous_podcast"
                value="no"
                checked={previousPodcast === false}
                onChange={() => setPreviousPodcast(false)}
                disabled={loading}
              >
                لا
              </RadioOption>
            </div>
          </div>

          {previousPodcast && (
            <div className="space-y-3 rounded-xl border border-primary/10 bg-primary/[0.03] p-5">
              <FieldLabel>اسم البودكاست أو رابط الحلقة</FieldLabel>
              <Input
                value={previousPodcastInfo}
                onChange={(e) => setPreviousPodcastInfo(e.target.value)}
                disabled={loading}
                dir="auto"
              />
            </div>
          )}

          <div className="space-y-3">
            <FieldLabel required>
              هل تفضل أسلوب الحوار والنقاش أم سرد قصتك؟ لماذا؟
            </FieldLabel>
            <Textarea
              value={preferDialogueOrStory}
              onChange={(e) => setPreferDialogueOrStory(e.target.value)}
              rows={4}
              disabled={loading}
              dir="auto"
              className="leading-relaxed"
            />
          </div>

          <div className="space-y-3">
            <FieldLabel>هل هناك مواضيع تفضل عدم التطرق لها أو تسجيلها؟</FieldLabel>
            <Textarea
              value={topicsToAvoid}
              onChange={(e) => setTopicsToAvoid(e.target.value)}
              rows={3}
              disabled={loading}
              dir="auto"
              className="leading-relaxed"
            />
          </div>

          <div className="space-y-3">
            <FieldLabel required>
              هل لديك أي قلق بخصوص التصوير أو الظهور العلني؟
            </FieldLabel>
            <div className="flex gap-3">
              <RadioOption
                name="filming_concern"
                value="no"
                checked={filmingConcern === "no"}
                onChange={() => setFilmingConcern("no")}
                disabled={loading}
              >
                لا
              </RadioOption>
              <RadioOption
                name="filming_concern"
                value="a_little"
                checked={filmingConcern === "a_little"}
                onChange={() => setFilmingConcern("a_little")}
                disabled={loading}
              >
                قليلاً
              </RadioOption>
              <RadioOption
                name="filming_concern"
                value="yes"
                checked={filmingConcern === "yes"}
                onChange={() => setFilmingConcern("yes")}
                disabled={loading}
              >
                نعم
              </RadioOption>
            </div>
          </div>

          <div className="space-y-3">
            <FieldLabel required>
              هل توافق على نشر الحلقة على جميع منصات خط؟
            </FieldLabel>
            <div className="flex gap-3">
              <RadioOption
                name="agrees_to_publish"
                value="yes"
                checked={agreesToPublish === true}
                onChange={() => setAgreesToPublish(true)}
                disabled={loading}
              >
                نعم
              </RadioOption>
              <RadioOption
                name="agrees_to_publish"
                value="no"
                checked={agreesToPublish === false}
                onChange={() => setAgreesToPublish(false)}
                disabled={loading}
              >
                لا
              </RadioOption>
            </div>
          </div>

          <div className="space-y-3">
            <FieldLabel hint="حسابات التواصل الاجتماعي، موقعك الشخصي، أو أي عمل تود أن نطّلع عليه">
              روابط اجتماعية أو شخصية (اختياري)
            </FieldLabel>
            <Input
              value={socialLinks}
              onChange={(e) => setSocialLinks(e.target.value)}
              placeholder="https://..."
              disabled={loading}
              dir="ltr"
              className="text-start"
            />
          </div>

          {errorMessage && formStatus === "error" && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(2)}
              disabled={loading}
              className="gap-2 rounded-xl"
            >
              <ChevronRight className="h-4 w-4" />
              السابق
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              className="flex-1 gap-2 rounded-xl"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                "أرسل قصتي إلى خط"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
