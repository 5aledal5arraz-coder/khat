"use client"

import { useState } from "react"
import { Lock, Loader2, Check, Mail, Handshake, Clock } from "lucide-react"
import type { PublicPartnershipOffer } from "@/types/database"

export function OfferClient({
  token,
  requiresPassword,
  initialOffer,
}: {
  token: string
  requiresPassword: boolean
  initialOffer: PublicPartnershipOffer | null
}) {
  const [offer, setOffer] = useState<PublicPartnershipOffer | null>(initialOffer)
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function unlock(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/offer/${encodeURIComponent(token)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "تعذّر فتح العرض")
        return
      }
      setOffer(data.offer)
    } catch {
      setError("حدث خطأ، حاول مرة أخرى")
    } finally {
      setLoading(false)
    }
  }

  // ── Password gate ──────────────────────────────────────────────────────────
  if (requiresPassword && !offer) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold">عرض شراكة خاص</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            هذا العرض محميّ بكلمة مرور. أدخل الكلمة التي شاركها معك فريق خط لعرضه.
          </p>
          <form onSubmit={unlock} className="mt-6 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور"
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-center outline-none focus:border-primary"
              dir="ltr"
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              فتح العرض
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!offer) return null

  // ── The offer document ─────────────────────────────────────────────────────
  return (
    <div className="bg-gradient-to-b from-primary/[0.06] via-background to-background py-12 sm:py-16">
      <div className="container mx-auto px-4">
        <article className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
          {/* Header */}
          <header className="border-b border-border/50 bg-gradient-to-br from-primary/[0.08] to-accent/[0.05] px-8 py-10 text-center sm:px-12">
            <div className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary">
              <Handshake className="h-3 w-3" />
              عرض شراكة من خط
            </div>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
              {offer.title || `عرض شراكة — خط × ${offer.company_name}`}
            </h1>
            {offer.company_name && (
              <p className="mt-2 text-sm text-muted-foreground">
                مُعدّ خصيصًا لـ <span className="font-medium text-foreground">{offer.company_name}</span>
              </p>
            )}
          </header>

          <div className="space-y-8 px-8 py-10 sm:px-12">
            {/* Intro */}
            {offer.intro && (
              <p className="text-[15px] leading-relaxed text-foreground/90">{offer.intro}</p>
            )}

            {/* Body */}
            {offer.body && (
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/85">
                {offer.body}
              </div>
            )}

            {/* Packages */}
            {offer.packages.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold">الباقات المقترحة</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {offer.packages.map((pkg, i) => (
                    <div key={i} className="rounded-2xl border border-border/60 bg-background/50 p-5">
                      <h3 className="font-bold">{pkg.name}</h3>
                      {pkg.description && (
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                          {pkg.description}
                        </p>
                      )}
                      {pkg.price_range && (
                        <p className="mt-2 text-sm font-semibold text-primary">{pkg.price_range}</p>
                      )}
                      {pkg.deliverables.length > 0 && (
                        <ul className="mt-3 space-y-1.5 border-t border-border/40 pt-3">
                          {pkg.deliverables.map((d, j) => (
                            <li key={j} className="flex items-start gap-2 text-[13px] text-foreground/85">
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              {d}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Validity */}
            {offer.validity_note && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <p className="text-[13px] leading-relaxed text-foreground/85">{offer.validity_note}</p>
              </div>
            )}

            {/* Contact CTA */}
            <div className="rounded-2xl bg-primary/[0.04] p-6 text-center ring-1 ring-primary/15">
              <h2 className="text-lg font-bold">جاهزون لبدء المحادثة</h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
                للموافقة أو لمناقشة التفاصيل، تواصلوا معنا مباشرةً — يسعدنا بناء شراكة على مقاسكم.
              </p>
              {offer.contact_email && (
                <a
                  href={`mailto:${offer.contact_email}?subject=${encodeURIComponent(`بخصوص عرض الشراكة — ${offer.company_name}`)}`}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Mail className="h-4 w-4" />
                  تواصلوا معنا
                </a>
              )}
            </div>
          </div>

          <footer className="border-t border-border/50 px-8 py-5 text-center text-xs text-muted-foreground">
            بودكاست خط — شراكات محتوى ذات معنى
          </footer>
        </article>
      </div>
    </div>
  )
}
