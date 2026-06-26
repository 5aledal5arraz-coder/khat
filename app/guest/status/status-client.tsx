"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Search, CheckCircle2, Clock, MailCheck } from "lucide-react"

interface StatusResult {
  found: boolean
  state?: string
  label?: string
  note?: string
  reference?: string
}

export function GuestStatusClient() {
  const searchParams = useSearchParams()
  const [reference, setReference] = useState(searchParams.get("ref") || "")
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<StatusResult | null>(null)
  const [error, setError] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reference.trim() || !email.trim()) return
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const res = await fetch("/api/guest-application/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "khat" },
        body: JSON.stringify({ reference: reference.trim(), email: email.trim() }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || "تعذّر التحقق. حاول مرة أخرى.")
      } else {
        setResult(d)
      }
    } catch {
      setError("تعذّر الاتصال. حاول مرة أخرى.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-8">
      <form onSubmit={submit} className="space-y-3 rounded-3xl border border-border bg-card p-6">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">الرقم المرجعي</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="KHAT-G-XXXXXX"
            dir="ltr"
            className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm tracking-widest text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">البريد الإلكتروني</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            dir="ltr"
            className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !reference.trim() || !email.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          تحقّق من الحالة
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-center text-sm text-destructive">{error}</p>
      )}

      {result && !result.found && (
        <div className="mt-4 rounded-2xl border border-border bg-card px-5 py-6 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            لم نعثر على طلب بهذا الرقم والبريد. تأكّد من الرقم المرجعي والبريد الإلكتروني الذي تقدّمت به.
          </p>
        </div>
      )}

      {result && result.found && (
        <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.03] px-5 py-7 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            {result.state === "decided" ? (
              <MailCheck className="h-7 w-7 text-primary" />
            ) : result.state === "review" ? (
              <Clock className="h-7 w-7 text-primary" />
            ) : (
              <CheckCircle2 className="h-7 w-7 text-primary" />
            )}
          </div>
          <h3 className="mt-4 text-lg font-bold text-foreground">{result.label}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{result.note}</p>
          {result.reference && (
            <p className="mt-4 text-[11px] tracking-widest text-muted-foreground/60" dir="ltr">{result.reference}</p>
          )}
        </div>
      )}
    </div>
  )
}
