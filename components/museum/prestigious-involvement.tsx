"use client"

import { useState, useCallback } from "react"
import Image from "next/image"

interface PartnerDisplay {
  id: string
  name: string
  logo_url: string | null
  website_url: string | null
}

// ---------------------------------------------------------------------------
// Newsletter status types
// ---------------------------------------------------------------------------

type NewsletterStatus = "idle" | "loading" | "success" | "duplicate" | "error"

function useNewsletterForm() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<NewsletterStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setStatus("loading")
    setErrorMessage("")

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ email: email.trim() }),
      })

      const data = await res.json()

      if (res.ok) {
        setStatus("success")
        setEmail("")
      } else if (data.duplicate) {
        setStatus("duplicate")
      } else {
        setStatus("error")
        setErrorMessage(data.error || "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.")
      }
    } catch {
      setStatus("error")
      setErrorMessage("تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت وحاول مرة أخرى.")
    }
  }, [email])

  const reset = useCallback(() => {
    setStatus("idle")
    setErrorMessage("")
  }, [])

  return { email, setEmail, status, errorMessage, submit, reset }
}

// ---------------------------------------------------------------------------
// Feedback messages
// ---------------------------------------------------------------------------

function NewsletterFeedback({
  status,
  errorMessage,
  onReset,
}: {
  status: NewsletterStatus
  errorMessage: string
  onReset: () => void
}) {
  if (status === "success") {
    return (
      <div className="mt-8 rounded-sm border border-primary/20 bg-primary/5 px-6 py-5 text-center">
        <p className="text-lg font-light text-primary">
          مرحبًا بك في الدائرة
        </p>
        <p className="mt-2 text-sm font-light leading-relaxed text-muted-foreground">
          تم تسجيل بريدك بنجاح. ستصلك رسالتنا القادمة مباشرة إلى صندوقك.
        </p>
      </div>
    )
  }

  if (status === "duplicate") {
    return (
      <div className="mt-8 rounded-sm border border-white/10 bg-white/[0.03] px-6 py-5 text-center">
        <p className="text-lg font-light text-foreground/80">
          أنت بالفعل من الدائرة
        </p>
        <p className="mt-2 text-sm font-light leading-relaxed text-muted-foreground">
          هذا البريد مسجّل لدينا. رسائلنا في طريقها إليك.
        </p>
        <button
          onClick={onReset}
          className="mt-3 text-xs font-medium tracking-wide text-primary/70 transition-colors hover:text-primary"
        >
          استخدم بريدًا آخر
        </button>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="mt-8 rounded-sm border border-red-500/20 bg-red-500/5 px-6 py-5 text-center">
        <p className="text-sm font-light text-red-400">
          {errorMessage}
        </p>
        <button
          onClick={onReset}
          className="mt-3 text-xs font-medium tracking-wide text-red-400/70 transition-colors hover:text-red-400"
        >
          حاول مرة أخرى
        </button>
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Thinker suggestion form
// ---------------------------------------------------------------------------

type SuggestionStatus = "idle" | "loading" | "success" | "rate_limited" | "error"

function useThinkerSuggestionForm() {
  const [thinkerName, setThinkerName] = useState("")
  const [researchField, setResearchField] = useState("")
  const [reason, setReason] = useState("")
  const [socialLinks, setSocialLinks] = useState("")
  const [phone, setPhone] = useState("")
  const [status, setStatus] = useState<SuggestionStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!thinkerName.trim() || !researchField.trim() || !reason.trim()) return

    setStatus("loading")
    setErrorMessage("")

    try {
      const res = await fetch("/api/thinker-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({
          thinker_name: thinkerName.trim(),
          research_field: researchField.trim(),
          reason: reason.trim(),
          social_links: socialLinks.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      })

      if (res.ok) {
        setStatus("success")
        setThinkerName("")
        setResearchField("")
        setReason("")
        setSocialLinks("")
        setPhone("")
      } else if (res.status === 429) {
        setStatus("rate_limited")
      } else {
        const data = await res.json()
        setStatus("error")
        setErrorMessage(data.error || "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.")
      }
    } catch {
      setStatus("error")
      setErrorMessage("تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت وحاول مرة أخرى.")
    }
  }, [thinkerName, researchField, reason, socialLinks, phone])

  const reset = useCallback(() => {
    setStatus("idle")
    setErrorMessage("")
  }, [])

  return {
    thinkerName, setThinkerName,
    researchField, setResearchField,
    reason, setReason,
    socialLinks, setSocialLinks,
    phone, setPhone,
    status, errorMessage, submit, reset,
  }
}

function SuggestionFeedback({
  status,
  errorMessage,
  onReset,
}: {
  status: SuggestionStatus
  errorMessage: string
  onReset: () => void
}) {
  if (status === "success") {
    return (
      <div className="rounded-sm border border-primary/20 bg-primary/5 px-6 py-5 text-center">
        <p className="text-lg font-light text-primary">
          شكرًا لاقتراحك
        </p>
        <p className="mt-2 text-sm font-light leading-relaxed text-muted-foreground">
          تم استلام اقتراحك بنجاح. سنراجعه ونأخذه بعين الاعتبار.
        </p>
        <button
          onClick={onReset}
          className="mt-3 text-xs font-medium tracking-wide text-primary/70 transition-colors hover:text-primary"
        >
          أرسل اقتراحًا آخر
        </button>
      </div>
    )
  }

  if (status === "rate_limited") {
    return (
      <div className="rounded-sm border border-amber-500/20 bg-amber-500/5 px-6 py-5 text-center">
        <p className="text-sm font-light text-amber-400">
          لقد أرسلت عدة اقتراحات. يرجى المحاولة لاحقًا.
        </p>
        <button
          onClick={onReset}
          className="mt-3 text-xs font-medium tracking-wide text-amber-400/70 transition-colors hover:text-amber-400"
        >
          حاول مرة أخرى
        </button>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="rounded-sm border border-red-500/20 bg-red-500/5 px-6 py-5 text-center">
        <p className="text-sm font-light text-red-400">
          {errorMessage}
        </p>
        <button
          onClick={onReset}
          className="mt-3 text-xs font-medium tracking-wide text-red-400/70 transition-colors hover:text-red-400"
        >
          حاول مرة أخرى
        </button>
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const FALLBACK_PARTNERS = [
  { id: "1", name: "AETHEL", logo_url: null, website_url: null },
  { id: "2", name: "MONOLITH", logo_url: null, website_url: null },
  { id: "3", name: "CODEX", logo_url: null, website_url: null },
  { id: "4", name: "PRIMA", logo_url: null, website_url: null },
]

export function MuseumPrestigiousInvolvement({ partners }: { partners?: PartnerDisplay[] | null }) {
  const displayPartners = partners && partners.length > 0 ? partners : FALLBACK_PARTNERS
  const newsletter = useNewsletterForm()
  const suggestion = useThinkerSuggestionForm()
  const showForm = newsletter.status === "idle" || newsletter.status === "loading"
  const showSuggestionForm = suggestion.status === "idle" || suggestion.status === "loading"

  return (
    <div>
      {/* Patron Hall */}
      <section className="border-t border-white/5 py-40">
        <div className="mx-auto max-w-7xl space-y-20 px-6 text-center">
          <div className="space-y-6">
            <span className="text-[10px] font-bold tracking-[0.3em] text-primary">
              دعم الإرث
            </span>
            <h2 className="museum-font-headline text-5xl tracking-tight md:text-7xl">
              رعاة الأفكار
            </h2>
            <div className="mx-auto h-px w-20 bg-primary/40" />
            <p className="mx-auto max-w-2xl text-xl font-light italic leading-relaxed text-muted-foreground">
              &ldquo;من يدعم الأفكار يرسم ملامح مستقبل الفكر. نُكرّم شركاءنا
              المؤسسيين.&rdquo;
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-32 gap-y-16 opacity-30 transition-all duration-1000 hover:opacity-100">
            {displayPartners.map((partner) => {
              const content = partner.logo_url ? (
                <Image
                  src={partner.logo_url}
                  alt={partner.name}
                  width={200}
                  height={80}
                  className="h-14 w-auto object-contain transition-all hover:opacity-80"
                />
              ) : (
                <div className="museum-font-headline text-5xl tracking-tighter transition-colors hover:text-primary">
                  {partner.name}
                </div>
              )

              if (partner.website_url) {
                return (
                  <a
                    key={partner.id}
                    href={partner.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {content}
                  </a>
                )
              }

              return <div key={partner.id}>{content}</div>
            })}
          </div>
        </div>
      </section>

      {/* Circle & Proposals */}
      <section className="relative overflow-hidden border-t border-white/5 bg-[#0F0E0D] py-40">
        <div className="relative z-10 mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-32 lg:grid-cols-2">
            {/* Newsletter */}
            <div className="space-y-12">
              <div className="space-y-4">
                <span className="text-[10px] font-bold tracking-[0.3em] text-primary">
                  الدائرة الداخلية
                </span>
                <h2 className="museum-font-headline text-5xl tracking-tight md:text-6xl">
                  انضم إلى المفكرين
                </h2>
              </div>
              <p className="text-xl font-light italic leading-relaxed text-muted-foreground">
                تلقَّ أفكارًا تستحق الاحتفاظ بها. رسائلنا نادرة، مركّزة،
                وصُمّمت خصيصًا للعقول التأملية.
              </p>

              {showForm ? (
                <form onSubmit={newsletter.submit} className="max-w-md space-y-6 pt-6">
                  <div className="group relative">
                    <input
                      type="email"
                      required
                      value={newsletter.email}
                      onChange={(e) => newsletter.setEmail(e.target.value)}
                      placeholder="عنوانك الإلكتروني"
                      disabled={newsletter.status === "loading"}
                      className="h-16 w-full border-x-0 border-b border-t-0 border-white/10 bg-transparent px-0 text-xl text-foreground placeholder:text-muted-foreground/30 transition-all focus:border-primary focus:outline-none disabled:opacity-50"
                    />
                    <div className="absolute inset-inline-start-0 bottom-0 h-px w-0 bg-primary transition-all duration-700 group-focus-within:w-full" />
                  </div>
                  <button
                    type="submit"
                    disabled={newsletter.status === "loading"}
                    className="h-16 w-full bg-primary text-xs font-bold tracking-[0.3em] text-background shadow-xl transition-all duration-500 hover:bg-white hover:text-black disabled:opacity-60"
                  >
                    {newsletter.status === "loading" ? (
                      <span className="inline-flex items-center gap-3">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        جارٍ التسجيل...
                      </span>
                    ) : (
                      "انضم إلى الدائرة"
                    )}
                  </button>
                </form>
              ) : (
                <div className="max-w-md pt-6">
                  <NewsletterFeedback
                    status={newsletter.status}
                    errorMessage={newsletter.errorMessage}
                    onReset={newsletter.reset}
                  />
                </div>
              )}
            </div>

            {/* Guest Suggestion */}
            <div className="space-y-12">
              <div className="space-y-4">
                <span className="text-[10px] font-bold tracking-[0.3em] text-primary">
                  اقتراح تنسيقي
                </span>
                <h2 className="museum-font-headline text-5xl tracking-tight md:text-6xl">
                  ساهم في المتحف
                </h2>
              </div>
              <p className="text-xl font-light italic leading-relaxed text-muted-foreground">
                &ldquo;اقتراح ضيف يعني رسم ملامح مستقبل الحوارات. من يجب أن
                نستضيف في معرضنا القادم؟&rdquo;
              </p>
              {showSuggestionForm ? (
                <form onSubmit={suggestion.submit} className="space-y-8 pt-6">
                  <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
                    <div className="group relative">
                      <input
                        type="text"
                        required
                        value={suggestion.thinkerName}
                        onChange={(e) => suggestion.setThinkerName(e.target.value)}
                        maxLength={200}
                        placeholder="اسم المفكّر"
                        disabled={suggestion.status === "loading"}
                        className="h-12 w-full border-x-0 border-b border-t-0 border-white/10 bg-transparent px-0 text-foreground placeholder:text-muted-foreground/30 focus:border-primary focus:outline-none disabled:opacity-50"
                      />
                      <div className="absolute inset-inline-start-0 bottom-0 h-px w-0 bg-primary transition-all duration-700 group-focus-within:w-full" />
                    </div>
                    <div className="group relative">
                      <input
                        type="text"
                        required
                        value={suggestion.researchField}
                        onChange={(e) => suggestion.setResearchField(e.target.value)}
                        maxLength={200}
                        placeholder="مجال البحث"
                        disabled={suggestion.status === "loading"}
                        className="h-12 w-full border-x-0 border-b border-t-0 border-white/10 bg-transparent px-0 text-foreground placeholder:text-muted-foreground/30 focus:border-primary focus:outline-none disabled:opacity-50"
                      />
                      <div className="absolute inset-inline-start-0 bottom-0 h-px w-0 bg-primary transition-all duration-700 group-focus-within:w-full" />
                    </div>
                  </div>
                  <div className="group relative">
                    <textarea
                      required
                      value={suggestion.reason}
                      onChange={(e) => suggestion.setReason(e.target.value)}
                      maxLength={2000}
                      placeholder="لماذا يجب أن يُخلَّد صوته في الأرشيف؟"
                      disabled={suggestion.status === "loading"}
                      className="min-h-[140px] w-full resize-none border-x-0 border-b border-t-0 border-white/10 bg-transparent px-0 text-lg text-foreground placeholder:text-muted-foreground/30 focus:border-primary focus:outline-none disabled:opacity-50"
                    />
                    <div className="absolute inset-inline-start-0 bottom-0 h-px w-0 bg-primary transition-all duration-700 group-focus-within:w-full" />
                  </div>
                  <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
                    <div className="group relative">
                      <input
                        type="text"
                        value={suggestion.socialLinks}
                        onChange={(e) => suggestion.setSocialLinks(e.target.value)}
                        maxLength={1000}
                        placeholder="روابط التواصل الاجتماعي (اختياري)"
                        disabled={suggestion.status === "loading"}
                        className="h-12 w-full border-x-0 border-b border-t-0 border-white/10 bg-transparent px-0 text-foreground placeholder:text-muted-foreground/30 focus:border-primary focus:outline-none disabled:opacity-50"
                      />
                      <div className="absolute inset-inline-start-0 bottom-0 h-px w-0 bg-primary transition-all duration-700 group-focus-within:w-full" />
                    </div>
                    <div className="group relative">
                      <input
                        type="tel"
                        value={suggestion.phone}
                        onChange={(e) => suggestion.setPhone(e.target.value)}
                        maxLength={30}
                        placeholder="رقم الهاتف (اختياري)"
                        disabled={suggestion.status === "loading"}
                        className="h-12 w-full border-x-0 border-b border-t-0 border-white/10 bg-transparent px-0 text-foreground placeholder:text-muted-foreground/30 focus:border-primary focus:outline-none disabled:opacity-50"
                      />
                      <div className="absolute inset-inline-start-0 bottom-0 h-px w-0 bg-primary transition-all duration-700 group-focus-within:w-full" />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={suggestion.status === "loading"}
                    className="h-16 w-full border border-primary/30 text-xs font-bold tracking-[0.3em] text-primary transition-all duration-500 hover:bg-primary hover:text-background disabled:opacity-60"
                  >
                    {suggestion.status === "loading" ? (
                      <span className="inline-flex items-center gap-3">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        جارٍ الإرسال...
                      </span>
                    ) : (
                      "أرسل الاقتراح"
                    )}
                  </button>
                </form>
              ) : (
                <div className="pt-6">
                  <SuggestionFeedback
                    status={suggestion.status}
                    errorMessage={suggestion.errorMessage}
                    onReset={suggestion.reset}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
