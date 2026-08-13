"use client"

/**
 * «ردّكم على العرض» — the company's counter-offer form.
 *
 * ── OUR PRICE NEVER LEAVES THE PAGE ────────────────────────────────────────
 * The obvious build is an editable price field pre-filled with our number. That
 * inverts the negotiation: the moment they erase our figure and type theirs,
 * THEY set the anchor and we bargain upward from it. So our `price_range` stays
 * printed on every option and beside the input, and their figure goes into a
 * separate box labelled «اقتراحكم». Same flexibility, opposite framing — they
 * are asking for a concession, not announcing a price.
 *
 * They SELECT a package rather than compose one, for the same reason: an
 * invented package means negotiating over something we never offered.
 */

import { useState } from "react"
import { Loader2, Check, CheckCircle2, HandCoins } from "lucide-react"
import type { ProposedPackage } from "@/types/database"

/** What was sent, kept so the success panel can show it back rather than go blank. */
interface Sent {
  packageName: string
  amount: string
}

export function OfferResponseForm({
  token,
  packages,
  /**
   * The password the visitor unlocked this offer with, or "" for an open link.
   * A gated offer requires it again on submit — the respond route runs the same
   * `verifyOfferPassword()` the unlock did, because unlocking leaves nothing
   * behind that a later request could prove itself with.
   */
  password,
}: {
  token: string
  packages: ProposedPackage[]
  password: string
}) {
  const [selected, setSelected] = useState<string>("")
  const [amount, setAmount] = useState("")
  const [notes, setNotes] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState<Sent | null>(null)

  const chosen = packages.find((p) => p.name === selected) ?? null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!selected) return setError("اختر إحدى الباقات المعروضة")
    if (!name.trim()) return setError("الاسم مطلوب")
    if (!email.trim()) return setError("البريد الإلكتروني مطلوب")

    setBusy(true)
    try {
      const res = await fetch(`/api/offer/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify({
          password,
          selected_package: selected,
          // "" means "no counter-offer" — the route reads that as null rather
          // than coercing it to 0, which the DB would reject anyway.
          proposed_amount: amount.trim(),
          notes,
          responder_name: name,
          responder_email: email,
          responder_job_title: jobTitle,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "تعذّر إرسال ردّكم")
        return
      }
      setSent({ packageName: selected, amount: amount.trim() })
    } catch {
      setError("حدث خطأ، حاول مرة أخرى")
    } finally {
      setBusy(false)
    }
  }

  // ── Sent ───────────────────────────────────────────────────────────────────
  // Stays on screen. A form that vanishes leaves the sender unsure it arrived.
  if (sent) {
    return (
      <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lead font-bold">وصلنا ردّكم</h2>
        <p className="mx-auto mt-1.5 max-w-md text-caption text-muted-foreground">
          سجّلنا اختياركم لـ<span className="font-medium text-foreground">«{sent.packageName}»</span>
          {sent.amount ? ` باقتراح ${sent.amount} د.ك` : " دون اقتراح سعر"}. سنعود إليكم على{" "}
          <span className="font-medium text-foreground" dir="ltr">
            {email}
          </span>
          .
        </p>
      </div>
    )
  }

  // ── The form ───────────────────────────────────────────────────────────────
  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border/60 bg-background/40 p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lead font-bold">
          <HandCoins className="h-4 w-4 text-primary" />
          ردّكم على العرض
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">
          اختاروا الباقة الأنسب، وإن رغبتم أضيفوا اقتراحكم للسعر — ونكمل من هناك.
        </p>
      </div>

      {/* Package choice — our price printed on every option. */}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-caption font-semibold">الباقة المختارة</legend>
        {packages.map((pkg, i) => (
          <label
            key={i}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
              selected === pkg.name ? "border-primary/50 bg-primary/[0.05]" : "border-border/50 hover:bg-muted/30"
            }`}
          >
            <input
              type="radio"
              name="selected_package"
              value={pkg.name}
              checked={selected === pkg.name}
              onChange={() => setSelected(pkg.name)}
              className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
            />
            <span className="min-w-0 flex-1 text-caption font-medium">{pkg.name}</span>
            {pkg.price_range && (
              <span className="shrink-0 text-caption font-semibold text-primary">{pkg.price_range}</span>
            )}
          </label>
        ))}
      </fieldset>

      {/* Their figure — BESIDE ours, never over it. */}
      <div className="space-y-2">
        <label htmlFor="offer-amount" className="block text-caption font-semibold">
          اقتراحكم (اختياري)
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary">
            <input
              id="offer-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="المبلغ"
              className="w-full min-w-0 bg-transparent outline-none"
            />
            <span className="shrink-0 text-caption text-muted-foreground">د.ك</span>
          </div>
          {/* Our number stays visible next to theirs — this is the whole point. */}
          <p className="text-caption text-muted-foreground">
            سعرنا:{" "}
            <span className="font-semibold text-foreground">
              {chosen?.price_range || (chosen ? "—" : "اختر باقة أولاً")}
            </span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="offer-notes" className="block text-caption font-semibold">
          ملاحظات (اختياري)
        </label>
        <textarea
          id="offer-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="شروط، أسئلة، أو توقيت يناسبكم..."
          className="w-full rounded-xl border border-border bg-background px-3 py-2 outline-none focus:border-primary"
        />
      </div>

      {/* Who is replying. The link travels inside a company; without these two
          «الشركة ردّت» is not something the system actually knows. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="offer-name" className="block text-caption font-semibold">
            الاسم <span className="text-destructive">*</span>
          </label>
          <input
            id="offer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="offer-email" className="block text-caption font-semibold">
            البريد الإلكتروني <span className="text-destructive">*</span>
          </label>
          <input
            id="offer-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={200}
            dir="ltr"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-start outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="offer-title" className="block text-caption font-semibold">
            المنصب (اختياري)
          </label>
          <input
            id="offer-title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            maxLength={120}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </div>
      </div>

      {error && <p className="text-caption text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-caption font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        إرسال الردّ
      </button>
    </form>
  )
}
