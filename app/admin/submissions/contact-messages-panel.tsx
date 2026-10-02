"use client"

import { useState } from "react"
import { AlertTriangle, Check, Clock, Mail, MailOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatArabicDateTime } from "@/lib/shared/formatters"
import type { ContactMessage } from "@/types/database"

/**
 * «رسائل التواصل» — the inbox behind the public /contact form.
 *
 * Each card says two separate things: whether an operator has read it, and
 * whether the TEAM EMAIL went out (`email_status`). A failed notification is
 * shown on the card, because the whole reason this inbox exists is that a
 * message must not depend on that email arriving.
 */
const EMAIL_STATUS: Record<ContactMessage["email_status"], { label: string; cls: string }> = {
  queued: { label: "الإشعار بالانتظار", cls: "bg-amber-500/10 text-amber-700" },
  sent: { label: "أُرسل الإشعار", cls: "bg-emerald-500/10 text-emerald-700" },
  failed: { label: "فشل إرسال الإشعار", cls: "bg-red-500/10 text-red-700" },
}

/** `mailto:` with the local part encoded (a `?`/`&`/`#` there would start a query). */
function mailtoHref(email: string): string {
  const at = email.lastIndexOf("@")
  return at > 0 ? `mailto:${encodeURIComponent(email.slice(0, at))}${email.slice(at)}` : `mailto:${encodeURIComponent(email)}`
}

export function unreadCount(messages: ContactMessage[]): number {
  return messages.filter((m) => !m.read_at).length
}

export function ContactMessagesPanel({
  messages,
  onChange,
  search,
}: {
  messages: ContactMessage[]
  onChange: (next: ContactMessage[]) => void
  search: string
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const q = search.trim().toLowerCase()
  const shown = q
    ? messages.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.message.toLowerCase().includes(q),
      )
    : messages

  async function setRead(m: ContactMessage, read: boolean) {
    setBusyId(m.id)
    setError(null)
    const prev = messages
    onChange(messages.map((x) => (x.id === m.id ? { ...x, read_at: read ? new Date().toISOString() : null } : x)))
    try {
      const res = await fetch(`/api/admin/submissions/contact/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "khat" },
        body: JSON.stringify({ read }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
    } catch (e) {
      onChange(prev)
      setError(e instanceof Error ? e.message : "تعذّر الحفظ")
    } finally {
      setBusyId(null)
    }
  }

  if (shown.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/50 px-6 py-12 text-center text-[13px] text-muted-foreground">
        {q ? "لا توجد رسائل مطابقة" : "لا توجد رسائل بعد"}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-700">{error}</p>
      )}
      {shown.map((m) => {
        const unread = !m.read_at
        const st = EMAIL_STATUS[m.email_status] ?? EMAIL_STATUS.queued
        return (
          <article
            key={m.id}
            className={cn(
              "rounded-2xl border p-4",
              unread ? "border-primary/30 bg-primary/[0.03]" : "border-border/40 bg-card/60",
            )}
          >
            <header className="flex flex-wrap items-center gap-2">
              {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="غير مقروءة" />}
              <span className="text-[14px] font-semibold text-foreground">{m.name}</span>
              <a href={mailtoHref(m.email)} dir="ltr" className="text-[12px] text-primary hover:underline">
                {m.email}
              </a>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatArabicDateTime(m.created_at)}
              </span>
              <span className={cn("ms-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium", st.cls)}>
                {m.email_status === "failed" ? <AlertTriangle className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                {st.label}
              </span>
            </header>
            {m.email_status === "failed" && m.email_error && (
              <p className="mt-2 rounded-lg bg-red-500/5 px-3 py-1.5 text-[11px] text-red-700">{m.email_error}</p>
            )}
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-[1.8] text-foreground">{m.message}</p>
            <footer className="mt-3 flex flex-wrap gap-2">
              <a
                href={mailtoHref(m.email)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted/40"
              >
                <Mail className="h-3.5 w-3.5" /> رد بالبريد
              </a>
              <button
                type="button"
                disabled={busyId === m.id}
                onClick={() => setRead(m, unread)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted/40 disabled:opacity-50"
              >
                {unread ? <Check className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                {unread ? "تمييز كمقروءة" : "تمييز كغير مقروءة"}
              </button>
            </footer>
          </article>
        )
      })}
    </div>
  )
}
