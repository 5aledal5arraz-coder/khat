import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { verifyAdminSession, devNoAuthUser } from "@/lib/admin/auth"
import { getAiDegradedState } from "@/lib/ops/ai-degraded"
import AdminLayoutClient from "./admin-layout-client"
import { VersionWatcher } from "./components/version-watcher"

/**
 * The admin's own title. All 52 `page.tsx` under /admin plus /admin/login
 * exported no `metadata` at all, so every operations screen inherited the
 * PUBLIC site's default — «خط | كل إنسان يحمل قصة تستحق أن تُروى» — which is
 * marketing copy on a tool, and makes a row of pinned admin tabs
 * indistinguishable from a row of pinned site tabs.
 *
 * Declared on the layout, so it covers every admin route including the
 * chrome-less ones (login, /admin/recording/*) without 53 edits, and a page
 * that wants a specific title just exports its own `metadata` and lands in
 * the template. `robots: noindex` because the public `metadataBase` makes
 * these absolute-URL'd, and an operations panel has no business in an index.
 *
 * `absolute`, not `default`: the ROOT layout also declares a template
 * (`%s | خط`), and Next applies a parent template to a child's `default`.
 * Measured — with `default` the admin home rendered «لوحة خط | بودكاست خط»,
 * i.e. the public brand tail was still there. `absolute` stops the parent
 * template at this boundary; the `template` here still serves the pages
 * below.
 */
export const metadata: Metadata = {
  title: { absolute: "لوحة خط", template: "%s | لوحة خط" },
  robots: { index: false, follow: false },
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get("__admin_session")?.value

  // `next dev` only — the panel opens with no login at all. Null in any built
  // app, so the two branches below are exactly what production still does.
  const devUser = devNoAuthUser()

  // No token: this is the login page (middleware redirects other admin pages
  // to /admin/login when no cookie exists), so render without dashboard chrome.
  if (!token && !devUser) {
    return <>{children}</>
  }

  // Token exists: verify it's valid
  const user = devUser ?? (await verifyAdminSession(token!))
  if (!user) {
    // Invalid/expired session — bounce through clear-session so the
    // stale cookie gets cleared. Redirecting straight to /admin/login
    // loops because middleware bounces /admin/login → /admin when the
    // cookie is present (existence-only check, no DB lookup).
    redirect("/admin/clear-session")
  }

  // Live recording is a focus surface: the host is facing a guest and the
  // director/photographer are on phones. No sidebar, no dashboard header,
  // and specifically no AI-degraded banner — that banner reports internal
  // pipeline health to people who are not operating the pipeline, and its
  // count includes report-mode observations that blocked nothing.
  //
  // The probe is skipped entirely rather than hidden with CSS: `aiDegraded`
  // is a prop, so hiding it visually would still ship the state (and its
  // rejection counts) inside the RSC payload to every room participant.
  const pathname = (await headers()).get("x-pathname") ?? ""
  if (pathname.startsWith("/admin/recording/")) {
    // No token scope to apply here any more: the admin's colour and control
    // overrides moved to `:root[data-surface="admin"]` in globals.css, so a
    // chrome-less admin surface is tokenised by <html> like every other one.
    // This wrapper survives only for the background/foreground pair.
    return (
      <div className="min-h-screen bg-background text-foreground">
        {children}
      </div>
    )
  }

  // A10 — Probe the AI-degraded state once per render. Single bounded
  // SQL count; fail-safe (returns degraded=false on any error). Banner
  // auto-recovers on the next navigation when the rolling-window count
  // drops below threshold.
  const aiDegraded = await getAiDegradedState()

  // Valid session — render dashboard chrome with role
  return (
    <AdminLayoutClient userRole={user.role} aiDegraded={aiDegraded}>
      {children}
      {/* Stale-deployment guard: prompts a reload when a new build ships
          while this tab is open (otherwise Server Actions fail silently). */}
      <VersionWatcher />
    </AdminLayoutClient>
  )
}
