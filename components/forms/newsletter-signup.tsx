"use client"

/**
 * Public newsletter signup — the entry point that feeds POST /api/newsletter.
 * Two presentations share one piece of logic:
 *   • variant="footer" — compact block for the site footer
 *   • variant="hero"   — a centered brand CTA section for the homepage
 *
 * Sends the CSRF custom header the API requires (validateMutation →
 * validateCustomHeader) and gives clear, localized feedback for every
 * outcome (success / already-subscribed / rate-limited / error).
 */

import { useState, type FormEvent } from "react"
import { Check, Info, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

type Status = "idle" | "loading" | "success" | "duplicate" | "error"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function NewsletterSignup({
  variant = "footer",
  className,
}: {
  variant?: "footer" | "footer-bare" | "hero"
  className?: string
}) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState("")
  // Honeypot — real users never see/fill this; bots that do are dropped server-side.
  const [website, setWebsite] = useState("")

  const isHero = variant === "hero"
  const done = status === "success" || status === "duplicate"
  const loading = status === "loading"

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading || done) return

    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setStatus("error")
      setMessage("يرجى إدخال بريد إلكتروني صحيح، مثل: name@example.com")
      return
    }

    setStatus("loading")
    setMessage("")
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({ email: trimmed, website }),
      })

      if (res.ok) {
        setStatus("success")
        setMessage("تم اشتراكك بنجاح — أرسلنا لك رسالة ترحيب على بريدك.")
        setEmail("")
        return
      }
      const data: { error?: string } = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setStatus("duplicate")
        setMessage("هذا البريد مشترك في نشرتنا بالفعل — لا حاجة لإعادة الاشتراك.")
        return
      }
      if (res.status === 429) {
        setStatus("error")
        setMessage("محاولات كثيرة — يرجى المحاولة بعد قليل.")
        return
      }
      setStatus("error")
      setMessage(data.error || "حدث خطأ، يرجى المحاولة مرة أخرى.")
    } catch {
      setStatus("error")
      setMessage("تعذّر الاتصال بالخادم، حاول مرة أخرى.")
    }
  }

  // ── Resolved state ────────────────────────────────────────────────────
  // Fresh subscription = celebratory green check. Already-subscribed = a
  // calmer info tone, so the two outcomes never look identical.
  if (done) {
    const isDuplicate = status === "duplicate"
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border",
          isDuplicate
            ? "border-border bg-muted/50 text-foreground"
            : "border-primary/20 bg-primary/5 text-foreground",
          isHero ? "mx-auto max-w-md px-5 py-4" : "px-4 py-3",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            isDuplicate
              ? "bg-muted-foreground/15 text-muted-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          {isDuplicate ? <Info className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        </span>
        <p className={cn("font-medium leading-snug", isHero ? "text-[15px]" : "text-sm")}>
          {message}
        </p>
      </div>
    )
  }

  const form = (
    <form onSubmit={onSubmit} noValidate className={isHero ? "mx-auto max-w-md" : ""}>
      {/* Honeypot: off-screen, hidden from AT + tab order. Bots fill it; humans can't. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <label className="sr-only" htmlFor={`nl-email-${variant}`}>
          البريد الإلكتروني
        </label>
        <input
          id={`nl-email-${variant}`}
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          placeholder="بريدك الإلكتروني"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (status === "error") {
              setStatus("idle")
              setMessage("")
            }
          }}
          disabled={loading}
          aria-invalid={status === "error"}
          aria-describedby={`nl-help-${variant}`}
          className={cn(
            "min-w-0 flex-1 rounded-xl border border-border bg-background text-foreground text-end placeholder:text-muted-foreground/70 transition-colors focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60",
            isHero ? "px-4 py-3 text-[15px]" : "px-3.5 py-2.5 text-sm",
          )}
        />
        <button
          type="submit"
          disabled={loading}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-70",
            isHero ? "px-7 py-3 text-[15px]" : "px-5 py-2.5 text-sm",
          )}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ الاشتراك…
            </>
          ) : (
            "اشترك"
          )}
        </button>
      </div>
      {status === "error" && (
        <p className="mt-2 text-[12.5px] text-destructive" role="alert">
          {message}
        </p>
      )}
      <p
        id={`nl-help-${variant}`}
        className={cn(
          "text-muted-foreground/80",
          isHero ? "mt-3 text-center text-[12.5px]" : "mt-2 text-[11.5px]",
        )}
      >
        بدون إزعاج — يمكنك إلغاء الاشتراك في أي وقت.
      </p>
    </form>
  )

  // ── Footer variants ───────────────────────────────────────────────────
  if (!isHero) {
    // "footer-bare": just the form (the band supplies its own heading/copy).
    if (variant === "footer-bare") {
      return <div className={className}>{form}</div>
    }
    return (
      <div className={className}>
        <h3 className="text-sm font-semibold">النشرة البريدية</h3>
        <p className="mt-2 mb-3 text-sm text-muted-foreground">
          أحدث الحلقات والاقتباسات، مباشرة إلى بريدك.
        </p>
        {form}
      </div>
    )
  }

  // ── Hero variant (homepage) ───────────────────────────────────────────
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-12 text-center shadow-sm sm:px-12 sm:py-14",
        className,
      )}
    >
      {/* soft brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 start-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[12px] font-semibold text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          النشرة البريدية
        </span>
        <h2 className="mt-5 text-pretty text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          حوارات تستحق أن تبقى — في بريدك
        </h2>
        <p className="mx-auto mt-3 max-w-md text-pretty text-[15px] leading-relaxed text-muted-foreground">
          اشترك في نشرة خط لتصلك أحدث الحلقات، اقتباسات مختارة، ومحتوى حصري — باعتناء، وبدون إزعاج.
        </p>
        <div className="mt-7">{form}</div>
      </div>
    </section>
  )
}
