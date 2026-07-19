import { notFound } from "next/navigation"

/**
 * Catch-all for /admin/* URLs that match no real admin route.
 *
 * App Router only sends UNMATCHED URLs to the ROOT app/not-found.tsx
 * (public-site identity) — a segment-level not-found.tsx alone catches
 * nothing but explicit notFound() calls inside its segment. This route
 * exists purely to throw notFound() inside /admin, so dead admin URLs
 * (e.g. /admin/khat-brain/market) render app/admin/not-found.tsx within
 * the admin shell instead of bouncing operators to the public site.
 *
 * Real pages always win: Next matches static and dynamic routes before
 * catch-alls, so this only fires when nothing else matched.
 */
export default function AdminCatchAll() {
  notFound()
}
