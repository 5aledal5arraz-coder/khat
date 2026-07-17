import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifyAdminSession } from "@/lib/admin/auth"
import { getAiDegradedState } from "@/lib/ops/ai-degraded"
import AdminLayoutClient from "./admin-layout-client"
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
