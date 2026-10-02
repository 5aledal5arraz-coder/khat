"use client"

/**
 * The visitor counter's collector — one beacon per public page view.
 *
 * Mounted ONLY in the public chrome of app/layout.tsx (never on admin,
 * /prepare/*, or the maintenance page). The root layout is not re-rendered on
 * a client-side navigation, though, so it also re-checks every path against
 * the same allowlist the server uses (via `beaconDecision`) — a soft navigation
 * into a private route is never reported even if this stays mounted.
 *
 * Why client-side at all: public pages are statically rendered and cached, so
 * server-side logging in a page component would miss most real views.
 *
 * No cookie, no storage, no id — the server derives a daily-rotating hash.
 * Do-Not-Track / Global Privacy Control → nothing is sent.
 */

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { beaconDecision } from "@/lib/analytics/beacon"

export const TRACK_ENDPOINT = "/api/track"

function privacySignal(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return nav.doNotTrack === "1" || nav.globalPrivacyControl === true
}

function send(payload: { path: string; referrer: string }) {
  const body = JSON.stringify(payload)
  try {
    if (navigator.sendBeacon?.(TRACK_ENDPOINT, new Blob([body], { type: "application/json" }))) return
  } catch {
    // fall through to fetch
  }
  fetch(TRACK_ENDPOINT, {
    method: "POST",
    body,
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  }).catch(() => {})
}

export function VisitBeacon() {
  const pathname = usePathname()
  // The page we were on before this navigation. null on the first view of a
  // page load, where the real entry referrer is `document.referrer`.
  const previous = useRef<string | null>(null)

  useEffect(() => {
    const { here, payload } = beaconDecision({
      pathname,
      previous: previous.current,
      origin: window.location.origin,
      documentReferrer: document.referrer,
      privacySignal: privacySignal(),
    })
    previous.current = here
    if (payload) send(payload)
  }, [pathname])

  return null
}
