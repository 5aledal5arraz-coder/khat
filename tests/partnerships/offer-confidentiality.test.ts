/**
 * Every partnership offer carries its confidentiality clause — on BOTH
 * surfaces, with nothing filled in.
 *
 * ── WHAT THIS IS GUARDING ──────────────────────────────────────────────────
 * Offers go out with tiered pricing, so one offer forwarded to another company
 * reopens every negotiation. The clause that says "don't" is deliberately a
 * constant and not a column (see `lib/partnerships/confidentiality.ts`): a
 * field can be left empty, and an offer that shipped without the clause because
 * someone forgot a checkbox is exactly the failure being prevented.
 *
 * So the test that matters is not "the clause renders" — it is "the clause
 * renders when EVERY optional field is empty". Both surfaces are driven here
 * with title/intro/body/packages/validity/contact all null or empty, which is a
 * freshly-created offer that has been published and nothing else.
 *
 * ── AND THE ASSERTIONS ARE PROVED TO SEE ───────────────────────────────────
 * A guard that stops seeing goes green forever. Each surface is therefore also
 * rendered, MUTATED — the clause's container removed by its class, i.e. by
 * structure and never by the words being asserted, so the removal is not
 * circular — and the same detector re-run. It must come back negative. The
 * mutation is itself checked for having removed anything at all, because a
 * no-op mutation is how this kind of proof quietly stops proving.
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { OfferClient } from "@/app/offer/[token]/offer-client"
import { buildProposalHtml, type ProposalPdfInput } from "@/lib/pdf/proposal-pdf"
import { CONFIDENTIALITY_LEAD, confidentialityBody } from "@/lib/partnerships/confidentiality"
import type { PublicPartnershipOffer } from "@/types/database"

const COMPANY = "شركة المستقبل"

/**
 * A published offer on which the operator has filled in NOTHING. Every field
 * that can be null is null; `packages` is empty. This is the shape
 * `getOrCreateOfferForLead()` inserts before anyone touches it.
 */
const EMPTY_OFFER: PublicPartnershipOffer = {
  title: null,
  intro: null,
  body: null,
  packages: [],
  validity_note: null,
  contact_email: null,
  company_name: COMPANY,
}

const publicHtml = (offer: PublicPartnershipOffer): string =>
  renderToStaticMarkup(
    createElement(OfferClient, { token: "offer-test", requiresPassword: false, initialOffer: offer }),
  )

/**
 * The PDF with nothing curated either: no offer row, no AI proposal. Only the
 * five lead fields the document reads. The cast is to the function's own input
 * type so a field it starts reading tomorrow fails to type-check here rather
 * than printing `undefined`.
 */
const pdfHtml = (company: string): string =>
  buildProposalHtml({
    lead: { company_name: company, industry: "إعلام", contact_name: "سالم", job_title: "مدير" },
    proposal: null,
    offer: null,
    reference: "REF-2026-01",
  } as ProposalPdfInput)

/** Collapse tags and whitespace so a `<strong>` split does not hide a sentence. */
const plain = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()

/**
 * The detector, run identically on the real and the mutated render: the bold
 * lead-in AND the full clause naming this recipient must both be present.
 * Asserting the whole sentence — not just the word «سري» — is what makes it
 * impossible to satisfy by accident from body copy elsewhere on the page.
 */
function carriesClause(html: string, company: string): boolean {
  const text = plain(html)
  return text.includes(CONFIDENTIALITY_LEAD) && text.includes(plain(confidentialityBody(company)))
}

/**
 * Remove an element by its CLASS — structure, not wording. Handles the one
 * level of nesting the clause block has (`<strong>`), which is all either
 * surface uses; a deeper block would leave a stray close tag and the
 * "mutation removed something" assertion below would still hold, so the
 * detector, not this regex, stays the thing under test.
 */
function stripByClass(html: string, className: string): string {
  const open = new RegExp(`<div[^>]*class="[^"]*${className.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}[^"]*"[^>]*>`)
  const m = open.exec(html)
  if (!m) return html
  const from = m.index
  let depth = 1
  let i = from + m[0].length
  const tag = /<(\/?)div\b[^>]*>/g
  tag.lastIndex = i
  let t: RegExpExecArray | null
  while ((t = tag.exec(html))) {
    depth += t[1] ? -1 : 1
    if (depth === 0) {
      i = t.index + t[0].length
      break
    }
  }
  return html.slice(0, from) + html.slice(i)
}

describe("the confidentiality clause is on every offer, with nothing filled in", () => {
  it("public offer page: renders it when every optional field is empty", () => {
    const html = publicHtml(EMPTY_OFFER)

    // The premise: this really is the bare page — no body, no packages, no
    // validity note, no contact button. If any of these ever start rendering
    // from a default, the test above them stops testing "empty".
    expect(html).not.toContain("الباقات المقترحة")
    expect(html).not.toContain("mailto:")

    expect(carriesClause(html, COMPANY)).toBe(true)
  })

  it("public offer page: names the recipient generically when the lead has no company name", () => {
    // `getOfferCompanyName()` returns "" for a lead row that is gone. The
    // clause must still appear, and must not print «لـ«» حصراً».
    const html = publicHtml({ ...EMPTY_OFFER, company_name: "" })
    expect(carriesClause(html, "")).toBe(true)
    expect(plain(html)).not.toContain("لـ«» حصراً")
  })

  it("public offer page: the clause sits after the content and before the footer", () => {
    const text = plain(publicHtml(EMPTY_OFFER))
    expect(text.indexOf(CONFIDENTIALITY_LEAD)).toBeGreaterThan(text.indexOf("جاهزون لبدء المحادثة"))
    expect(text.indexOf(CONFIDENTIALITY_LEAD)).toBeLessThan(text.indexOf("شراكات محتوى ذات معنى"))
  })

  it("proposal PDF: renders it with no offer row and no AI proposal", () => {
    const html = pdfHtml(COMPANY)

    // Same premise check — this document has no curated content at all.
    expect(html).not.toContain("باقات الشراكة المقترحة")
    expect(html).not.toContain("الخطوات التالية")

    expect(carriesClause(html, COMPANY)).toBe(true)
  })

  it("proposal PDF: the clause sits before the footer", () => {
    const html = pdfHtml(COMPANY)
    expect(html.indexOf("confidential")).toBeLessThan(html.indexOf('class="footer"'))
  })

  it("the wording is the approved wording, verbatim", () => {
    expect(CONFIDENTIALITY_LEAD).toBe("خاص وسري.")
    expect(confidentialityBody(COMPANY)).toBe(
      `هذا العرض وأسعاره مُعدّة لـ«${COMPANY}» حصراً. ` +
        `لا يجوز نشره أو تداول أسعاره مع أي طرف ثالث دون موافقة كتابية من بودكاست خط.`,
    )
  })
})

describe("and the assertions above can actually see the clause disappear", () => {
  it("public offer page: removing the block makes the same check fail", () => {
    const html = publicHtml(EMPTY_OFFER)
    const mutated = stripByClass(html, "bg-muted/20")

    // A mutation that changed nothing proves nothing. If the clause block's
    // class ever changes, this is the assertion that says so.
    expect(mutated.length, "the mutation removed no markup — it is no longer deleting the clause block").toBeLessThan(
      html.length,
    )
    expect(carriesClause(mutated, COMPANY)).toBe(false)
    // And nothing else on the page carries the clause as a second copy.
    expect(plain(mutated)).not.toContain(CONFIDENTIALITY_LEAD)
  })

  it("proposal PDF: removing the block makes the same check fail", () => {
    const html = pdfHtml(COMPANY)
    const mutated = stripByClass(html, "confidential")

    expect(mutated.length, "the mutation removed no markup — it is no longer deleting the clause block").toBeLessThan(
      html.length,
    )
    expect(carriesClause(mutated, COMPANY)).toBe(false)
    expect(plain(mutated)).not.toContain(CONFIDENTIALITY_LEAD)
  })
})
