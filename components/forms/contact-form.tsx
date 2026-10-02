"use client"

import { useState } from "react"
import { Check, Loader2, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { CONTACT_HONEYPOT_FIELD, CONTACT_LIMITS } from "@/lib/validation/contact"

const FIELD =
  "mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-field text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none md:text-control"

/**
 * «تواصل معنا» — a real form. Stored in the admin inbox and mailed to the team
 * (POST /api/contact). The mailto link stays on the page as the second way.
 */
export function ContactForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [trap, setTrap] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const ready =
    name.trim().length >= CONTACT_LIMITS.NAME_MIN &&
    email.trim().length > 0 &&
    message.trim().length >= CONTACT_LIMITS.MESSAGE_MIN

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setStatus("loading")
    setErrorMsg("")
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "khat" },
        body: JSON.stringify({ name, email, message, [CONTACT_HONEYPOT_FIELD]: trap }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setStatus("success")
      else {
        setStatus("error")
        setErrorMsg(data.error || "صار خطأ، حاول مرة ثانية")
      }
    } catch {
      setStatus("error")
      setErrorMsg("صار خطأ، حاول مرة ثانية")
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-primary/15 bg-primary/[0.03] px-6 py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Check className="h-7 w-7 text-primary" />
        </div>
        <h3 className="mt-5 text-lead font-bold">وصلتنا رسالتك</h3>
        <p className="mx-auto mt-2 max-w-sm text-caption text-muted-foreground">
          شكرًا لك. نقرأ كل رسالة، وسنرد على بريدك قريبًا.
        </p>
        <button
          type="button"
          onClick={() => {
            setName("")
            setEmail("")
            setMessage("")
            setStatus("idle")
          }}
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-caption font-medium text-foreground transition-colors hover:bg-muted/40"
        >
          أرسل رسالة أخرى
        </button>
      </div>
    )
  }

  const loading = status === "loading"

  return (
    <form onSubmit={submit} className="relative space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="text-caption font-medium text-foreground">
            الاسم
          </label>
          <input
            id="contact-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={CONTACT_LIMITS.NAME_MAX}
            autoComplete="name"
            required
            disabled={loading}
            className={cn(FIELD, "h-11")}
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="text-caption font-medium text-foreground">
            البريد الإلكتروني
          </label>
          <input
            id="contact-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={loading}
            className={cn(FIELD, "h-11 text-start")}
          />
        </div>
      </div>
      <div>
        <label htmlFor="contact-message" className="text-caption font-medium text-foreground">
          رسالتك
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={CONTACT_LIMITS.MESSAGE_MAX}
          required
          disabled={loading}
          className={cn(FIELD, "resize-y")}
        />
        <p className="mt-1 text-micro text-muted-foreground">
          {CONTACT_LIMITS.MESSAGE_MIN} أحرف على الأقل
        </p>
      </div>

      {/* Honeypot — invisible to people and to assistive tech; bots fill it. */}
      <div aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor="contact-website">الموقع</label>
        <input
          id="contact-website"
          name={CONTACT_HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          value={trap}
          onChange={(e) => setTrap(e.target.value)}
        />
      </div>

      {status === "error" && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-center text-caption text-destructive"
        >
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !ready}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-caption font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-8"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        أرسل الرسالة
      </button>
    </form>
  )
}
