/**
 * Human-friendly community-contribution reference (e.g. KHAT-C-A3F9C1).
 * Deterministic from the contribution id — shown on the success screen and in
 * the confirmation email so a contributor can quote "my idea is KHAT-C-…".
 */
export function communityRef(id: string): string {
  const hex = (id || "").replace(/[^a-f0-9]/gi, "").slice(0, 6).toUpperCase()
  return `KHAT-C-${hex.padEnd(6, "0")}`
}
