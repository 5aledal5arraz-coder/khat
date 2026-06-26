/**
 * Human-friendly guest application reference (e.g. KHAT-G-A3F9C1).
 *
 * Deterministic from the application id, so no extra column is needed and the
 * same reference always resolves to the same application. Shown on the
 * submission success screen, in the confirmation email, and used (with the
 * applicant's email) to look up status on the public /guest/status page.
 */
export function guestRef(applicationId: string): string {
  const hex = (applicationId || "").replace(/[^a-f0-9]/gi, "").slice(0, 6).toUpperCase()
  return `KHAT-G-${hex.padEnd(6, "0")}`
}
