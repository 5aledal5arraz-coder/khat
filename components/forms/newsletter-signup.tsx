"use client"

/**
 * Public newsletter signup — the entry point that feeds POST /api/newsletter.
 * Presentations sharing one piece of logic:
 *   • variant="footer" — compact block for the site footer
 *   • variant="hero"   — a centered brand CTA section for the homepage
 *   • variant="inline" — a horizontal band for in-page placement, matching
 *     the footer band's proportions (~160px tall instead of the hero's 462)
 *   • variant="upcoming" — the ask on an unaired episode's page, where it is
 *     the ONLY thing a visitor can do; its own copy, because "أحدث الحلقات"
 *     is the wrong promise on a page about one specific episode
 *
 * The DOM ids are derived from the variant name (`nl-email-${variant}`), so
 * two instances on one page must use two different variant names — otherwise
 * the duplicate id sends every `htmlFor`/`aria-describedby` to the first
 * field. That is why the homepage band is "inline" and not a reuse of
 * "footer-bare", which the footer already occupies on the same document.
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
  variant?: "footer" | "footer-bare" | "hero" | "inline" | "upcoming"
  className?: string
}) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState("")
  // Honeypot — real users never see/fill this; bots that do are dropped server-side.
  const [website, setWebsite] = useState("")

  const isHero = variant === "hero"
  const isInline = variant === "inline"
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
  // The inline band keeps its own shell on success — only the form column is
  // swapped — so the homepage never jumps by the height of the whole block.
  const successBar = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3",
        status === "duplicate"
          ? "border-border bg-muted/50 text-foreground"
          : "border-primary/20 bg-primary/5 text-foreground",
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          status === "duplicate"
            ? "bg-muted-foreground/15 text-muted-foreground"
            : "bg-primary text-primary-foreground",
        )}
      >
        {status === "duplicate" ? <Info className="h-4 w-4" /> : <Check className="h-4 w-4" />}
      </span>
      <p className="text-caption font-medium">{message}</p>
    </div>
  )

  if (done && !isInline) {
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
        <p className={cn("font-medium", isHero ? "text-body" : "text-caption")}>
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
            isHero ? "px-4 py-3 text-body" : "px-3.5 py-2.5 text-field md:text-control",
          )}
        />
        <button
          type="submit"
          disabled={loading}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-70",
            /* ── THE CTA IS KHAT ORANGE, AND THE LABEL IS WHY IT CAN BE ────
               Khaled looked at this on his phone and said the orange was not
               the identity's. He was right: the fill was KHAT BURNT Orange
               (#C83B0D), not KHAT Orange (#FD4F04). Both are in «ملف عرض
               الشعار», but the accent the brand actually leads with is the
               brighter one, and this is the site's primary call to action.

               THE REASON IT WAS THE DARKER ONE. On #FD4F04 no identity colour
               reaches 4.5:1 — Signature Purple is the best at 3.66, then Deep
               Indigo 3.56, Soft Blush 3.16, Warm Ivory 3.03. That is a property
               of the orange, not a gap in the palette, so at a 14px label the
               fill HAD to be the darker orange.

               WHAT CHANGED IS THE LABEL, NOT THE PALETTE. WCAG asks 4.5:1 of
               normal text but only 3:1 of LARGE text — 24px, or 18.66px bold.
               At `text-subhead` (24px) the 3.66:1 of Signature Purple on the
               brand orange is compliant, so the button can carry the real
               accent. Khaled chose this over keeping the darker fill.

               No border any more: it existed because Burnt Orange sat 2.31:1
               off the indigo card and the shape stopped reading as a control.
               KHAT Orange is 3.56:1 against that card, which clears SC 1.4.11
               on its own. */
            isInline
              /* Hover darkens toward the indigo behind it rather than swapping
                 colour, so contrast RISES on the state a user is about to
                 click instead of falling. */
              ? "bg-accent text-foreground hover:bg-accent/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            isHero ? "px-7 py-3 text-body" : "px-5 py-2.5 text-caption",
            /* The inline band is the only variant on the brand orange, so it is
               the only one that needs the large-text size to stay legible. */
            isInline && "text-subhead font-bold py-2.5",
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
        <p className="mt-2 text-micro text-destructive" role="alert">
          {message}
        </p>
      )}
      <p
        id={`nl-help-${variant}`}
        className={cn(
          // FULL opacity. `--muted-foreground` is already tuned to sit just
          // above 4.5:1 on the page background; the /80 dropped this line to a
          // measured 3.56:1 (rgb(137,133,156) on white) — the only contrast
          // failure on the public site. Muted text does not get an opacity
          // modifier on top of an already-muted token.
          /* On the indigo band the muted token (Dusty Violet) would sit at
             1.9:1 — the whole point of a dark surface is that "muted" has to
             be a LIGHT tone, not the light surface's grey. */
          isInline ? "text-background/85" : "text-muted-foreground",
          isHero ? "mt-3 text-center text-micro" : "mt-2 text-micro",
        )}
      >
        بدون إزعاج — يمكنك إلغاء الاشتراك في أي وقت.
      </p>
    </form>
  )

  // ── Inline variant (mid-page band) ────────────────────────────────────
  // Deliberately a short horizontal band, NOT the hero card: at ~160px it
  // reads as a divider between two sections instead of a page ending, so it
  // can't create a false bottom above the episodes grid.
  if (isInline) {
    return (
      /* KHAT DEEP INDIGO field with a KHAT ORANGE call to action.
         Khaled asked whether this band should be orange, to pull the eye. The
         identity answers it: across the whole file there is no large orange
         surface — the approved backgrounds are the cream and the indigo, and
         orange appears as the diamond over the khaa and as sparse marks in the
         pattern. It is a stress, not a field. Made the whole band orange, the
         orange becomes the background and the button has nothing left to pop
         against; on the indigo it is the only warm thing on the page. */
      <div
        className={cn(
          "flex flex-col gap-6 rounded-3xl bg-primary px-6 py-8 shadow-sm sm:px-10 md:flex-row md:items-center md:justify-between",
          className,
        )}
      >
        <div className="max-w-sm">
          <h2 className="text-lead font-bold text-background sm:text-subhead">
            حوارات تستحق أن تبقى — في بريدك
          </h2>
          <p className="mt-2 text-caption text-background/85">
            أحدث الحلقات، اقتباسات مختارة، ومحتوى حصري — بدون إزعاج.
          </p>
        </div>
        <div className="w-full md:max-w-sm">{done ? successBar : form}</div>
      </div>
    )
  }

  // ── Upcoming-episode variant ──────────────────────────────────────────
  // A bordered card rather than the indigo band: on `/episodes/<slug>` before
  // the episode exists this is the page's single call to action, and it has to
  // read as part of the article, not as the footer arriving early.
  //
  // Its own DOM ids come free — they are derived from the variant name, which
  // is exactly why this is a NEW variant and not a second "inline". The site
  // footer renders on this page too, so reusing "footer" would have pointed
  // both labels and both `aria-describedby` at whichever field parsed first.
  if (variant === "upcoming") {
    return (
      <section
        className={cn(
          "rounded-3xl border border-border bg-card px-6 py-8 shadow-sm sm:px-8",
          className,
        )}
      >
        <h2 className="text-subhead font-bold text-foreground">
          نعلمك أول ما تنزل
        </h2>
        <p className="mt-2 max-w-measure text-caption text-muted-foreground">
          اشترك في نشرة خط، وتوصلك الحلقة أول ما تنزل — بدون إزعاج.
        </p>
        <div className="mt-5 max-w-md">{form}</div>
      </section>
    )
  }

  // ── Footer variants ───────────────────────────────────────────────────
  if (!isHero) {
    // "footer-bare": just the form (the band supplies its own heading/copy).
    if (variant === "footer-bare") {
      return <div className={className}>{form}</div>
    }
    return (
      <div className={className}>
        <h3 className="text-caption font-semibold">النشرة البريدية</h3>
        <p className="mt-2 mb-3 text-caption text-muted-foreground">
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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-micro font-semibold text-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          النشرة البريدية
        </span>
        <h2 className="mt-5 text-pretty text-subhead font-bold text-foreground sm:text-heading">
          حوارات تستحق أن تبقى — في بريدك
        </h2>
        <p className="mx-auto mt-3 max-w-md text-pretty text-body text-muted-foreground">
          اشترك في نشرة خط لتصلك أحدث الحلقات، اقتباسات مختارة، ومحتوى حصري — باعتناء، وبدون إزعاج.
        </p>
        <div className="mt-7">{form}</div>
      </div>
    </section>
  )
}
