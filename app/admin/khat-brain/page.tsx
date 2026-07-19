import { redirect } from "next/navigation"

/**
 * Phase 2.2 — the Khat Brain command center merged into the admin home.
 * "ما الذي يحتاج انتباهك الآن؟", stale EIRs, and the full phase distribution
 * now live on `/admin/ops` (a single honest home instead of two competing
 * dashboards). This route redirects so old bookmarks and any in-app links
 * to `/admin/khat-brain` keep resolving.
 *
 * The former command-center widgets were moved to `app/admin/ops/` and its
 * `_components/home-attention.tsx`. `getCommandCenterData()` is now unused by
 * the UI (kept in lib for potential reuse; slated for the deferred cleanup
 * pass alongside the slate/token tidy-up).
 */
export default function CommandCenterPage() {
  redirect("/admin/ops")
}
