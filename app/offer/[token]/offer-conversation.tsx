"use client"

/**
 * The negotiation, as the COMPANY sees it.
 *
 * Their reply used to be a one-way drop: they picked a package, typed a figure,
 * saw «وصلنا ردّكم», and the page went silent. Every subsequent round happened
 * in email, off the offer, so the one artefact both sides could point at stopped
 * being the record halfway through the negotiation.
 *
 * This renders the sequence in place: their round, then our answer nested
 * directly beneath it, oldest exchange at the bottom.
 *
 * ── WHAT REACHES THIS COMPONENT ────────────────────────────────────────────
 * `PublicOfferExchange`, built by whitelist in `buildPublicOffer()`. There is
 * no `status` and no `internal_note` in the props at all — not hidden by a
 * conditional here, ABSENT from the type — so no future edit to this file can
 * put Khaled's private note on a partner's screen.
 */

import { MessageSquare, CornerDownLeft } from "lucide-react"
import { formatArabicDate, formatKwd } from "@/lib/shared/formatters"
import type { PublicOfferExchange } from "@/types/database"

export function OfferConversation({ exchanges }: { exchanges: PublicOfferExchange[] }) {
  if (exchanges.length === 0) return null

  return (
    <div className="space-y-4" data-offer-conversation>
      <h2 className="flex items-center gap-2 text-lead font-bold">
        <MessageSquare className="h-4 w-4 text-primary" />
        سجلّ المحادثة
      </h2>

      <ol className="space-y-4">
        {exchanges.map((x) => (
          <li key={x.id} className="rounded-2xl border border-border/60 bg-background/50 p-5">
            {/* Their round */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-muted/50 px-2.5 py-1 text-caption font-semibold ring-1 ring-border/50">
                {x.selected_package}
              </span>
              {x.proposed_amount != null && (
                <span className="text-caption font-semibold text-primary">
                  {formatKwd(x.proposed_amount, x.proposed_currency)}
                </span>
              )}
              <span className="ms-auto text-micro text-muted-foreground">
                {formatArabicDate(x.created_at)}
              </span>
            </div>

            {x.notes && (
              <p className="mt-3 whitespace-pre-wrap text-caption leading-relaxed text-foreground/85">
                {x.notes}
              </p>
            )}

            <p className="mt-2 text-micro text-muted-foreground">{x.responder_name}</p>

            {/* Our answers, nested directly underneath and oldest first */}
            {x.counters.length > 0 && (
              <ul className="mt-4 space-y-3 border-t border-border/40 pt-4">
                {x.counters.map((c) => (
                  <li
                    key={c.id}
                    // `ms-` not `ml-`: the indent has to sit on the start side,
                    // which is the right in an RTL document.
                    className="ms-4 rounded-xl border border-primary/25 bg-primary/[0.04] p-4"
                  >
                    <p className="flex items-center gap-1.5 text-micro font-semibold text-primary">
                      <CornerDownLeft className="h-3 w-3" />
                      ردّ خط
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-caption leading-relaxed text-foreground/90">
                      {c.message}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted-foreground">
                      {c.counter_amount != null && (
                        <span className="font-semibold text-primary">
                          {formatKwd(c.counter_amount, c.counter_currency)}
                        </span>
                      )}
                      <span>{formatArabicDate(c.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
