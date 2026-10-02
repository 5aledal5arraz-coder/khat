/**
 * The client beacon's per-navigation decision — pure, so it can be tested
 * without a DOM (tests/analytics/beacon.test.ts). Client-safe: no Node imports.
 * components/layout/visit-beacon.tsx is the thin React shell around it.
 */
import { isTrackablePath, normalizePath } from "./paths"

export interface BeaconInput {
  /** `usePathname()` for this render. */
  pathname: string | null
  /** The full URL of the page this navigation came FROM; null on the first view of a page load. */
  previous: string | null
  /** `window.location.origin`. */
  origin: string
  /** `document.referrer` — only used on the first view. */
  documentReferrer: string
  /** DNT or Global Privacy Control is on. */
  privacySignal: boolean
}

export interface BeaconDecision {
  /** What `previous` must become for the next navigation. */
  here: string
  /** The body to send, or null to send nothing. */
  payload: { path: string; referrer: string } | null
}

/** Origin + path only — the query string of a referrer can carry anything. */
export function stripQuery(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}${u.pathname}`
  } catch {
    return ""
  }
}

export function beaconDecision(input: BeaconInput): BeaconDecision {
  const here = input.origin + (input.pathname ?? "")
  // Same page twice = React StrictMode re-running the effect in dev, not a
  // second view (a real navigation changes `pathname`; a reload resets the ref).
  if (input.previous === here) return { here, payload: null }
  const path = normalizePath(input.pathname)
  if (!path || !isTrackablePath(path) || input.privacySignal) return { here, payload: null }
  // A soft navigation's referrer is our own page — the server buckets it as
  // «internal», so only real entries count as a traffic source.
  return { here, payload: { path, referrer: stripQuery(input.previous ?? input.documentReferrer) } }
}
