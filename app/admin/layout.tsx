import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { verifyAdminSession } from "@/lib/admin/auth"
import { getAiDegradedState } from "@/lib/ops/ai-degraded"
import AdminLayoutClient from "./admin-layout-client"
import { ADMIN_LIGHT_TOKENS } from "./components/light-theme"
import { VersionWatcher } from "./components/version-watcher"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get("__admin_session")?.value

  // No token: this is the login page (middleware redirects other admin pages
  // to /admin/login when no cookie exists), so render without dashboard chrome.
  if (!token) {
    return <>{children}</>
  }

  // Token exists: verify it's valid
  const user = await verifyAdminSession(token)
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
    // The token scope still has to be applied here: it normally rides on
    // AdminLayoutClient, and the root layout deliberately leaves /admin
    // untokenised. Same pattern the login page already uses for an admin
    // surface that renders without the dashboard chrome.
    return (
      <div style={ADMIN_LIGHT_TOKENS} className="min-h-screen bg-background text-foreground">
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
