/**
 * Human-friendly partnership application reference (e.g. KHAT-PT-A3F9C1).
 *
 * Deterministic from the lead id, so no extra column is needed and the same
 * reference always resolves to the same application. Shown on the submission
 * success screen, in the confirmation/admin emails, and on the admin record —
 * the enterprise touch that lets an applicant quote "my reference is …".
 */
export function partnershipRef(leadId: string): string {
  const hex = (leadId || "").replace(/[^a-f0-9]/gi, "").slice(0, 6).toUpperCase()
  return `KHAT-PT-${hex.padEnd(6, "0")}`
}
