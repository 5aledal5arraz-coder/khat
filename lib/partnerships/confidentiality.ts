/**
 * The confidentiality clause every partnership offer carries.
 *
 * ── WHY THIS IS A CONSTANT AND NOT A COLUMN ────────────────────────────────
 * Offers go out with tiered pricing — a single episode priced above the same
 * episode inside a season bundle. One offer forwarded to another company
 * reopens every negotiation at once, and the clause that says "don't" existed
 * nowhere: not on `/offer/<token>`, not in the PDF, not in the AI draft.
 *
 * A `confidentiality_note` column, or a checkbox, would have the SAME failure
 * mode as the leak it is meant to prevent: the offer goes out without the
 * clause because someone forgot to fill the field. So there is no field. Both
 * surfaces read this module unconditionally, which makes an offer with no
 * confidentiality notice unreachable rather than merely unlikely.
 *
 * If per-offer wording is ever genuinely needed, it goes in as an OVERRIDE on
 * top of this default — never as a value that must be filled for the clause to
 * appear at all.
 */

/** The lead-in, set bold on both surfaces. */
export const CONFIDENTIALITY_LEAD = "خاص وسري."

/**
 * Stands in for the company name when the lead carries none.
 *
 * `getOfferCompanyName()` returns "" for a lead row that no longer exists, and
 * an empty name would print «مُعدّة لـ«» حصراً». The clause still has to
 * appear — that is the entire point of it — so it names the recipient
 * generically rather than going missing.
 */
const UNNAMED_RECIPIENT = "الجهة المستلمة"

/**
 * The clause body, with the recipient named. Returns PLAIN TEXT: the React
 * surface renders it as a child (escaped by React), the PDF runs it through its
 * own `esc()`. Never pre-escaped here, or one of the two would double-escape.
 */
export function confidentialityBody(companyName: string | null | undefined): string {
  const recipient = (companyName ?? "").trim() || UNNAMED_RECIPIENT
  return (
    `هذا العرض وأسعاره مُعدّة لـ«${recipient}» حصراً. ` +
    `لا يجوز نشره أو تداول أسعاره مع أي طرف ثالث دون موافقة كتابية من بودكاست خط.`
  )
}
