import { requireAdmin } from "@/lib/api-utils"
import { getAboutContent } from "@/lib/content/static-content"

import { TeamEditor } from "./team-editor"

/**
 * The team as it appears on `/about` — editable at last.
 *
 * `saveAboutContent` had existed with NO CALLER: the about page (host, values,
 * team) could only be changed by running a script, so when Khalid asked for
 * photos on 2026-08-06 there was no screen to add one.
 *
 * ── WHY `about-team` AND NOT `team` ────────────────────────────────────────
 * `/admin/team` was already taken, and I overwrote it before noticing — it
 * manages ADMIN USER ACCOUNTS (`/api/admin/team/[id]/force-logout`), is gated
 * on OWNER, and refuses in place rather than redirecting. Two different things
 * called "the team": the people with logins, and the people on the about page.
 * This one is named for the page it edits so the two can never be confused
 * again.
 */
export const dynamic = "force-dynamic"

export default async function AdminAboutTeamPage() {
  await requireAdmin()
  const content = await getAboutContent()
  const members = [...(content.teamMembers ?? [])].sort((a, b) => a.order - b.order)

  return (
    <div className="mx-auto max-w-4xl p-6" dir="rtl">
      <header className="mb-6">
        <h1 className="text-heading font-bold">فريق صفحة «من نحن»</h1>
        <p className="mt-1.5 text-caption text-muted-foreground">
          الصورة والمسمّى والنبذة والرسالة والبريد وحسابات التواصل لكل عضو، كما تظهر
          للزائر. هذه ليست حسابات الدخول — تلك في «الفريق».
        </p>
      </header>
      <TeamEditor initial={members} />
    </div>
  )
}
