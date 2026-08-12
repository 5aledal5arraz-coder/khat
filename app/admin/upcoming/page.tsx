/**
 * `/admin/upcoming` — the episode pages that exist before the episodes do.
 *
 * Khaled writes one of these when a season-two guest is confirmed but nothing
 * is filmed yet: a title, the subject, the axes, optionally a word from the
 * guest, and a permanent slug he can put in the newsletter that day. Publishing
 * it puts `/episodes/<slug>` live immediately; the episode inherits the same
 * URL when it airs.
 *
 * Auth: reading is VIEWER (matching the read/write split in `lib/api-utils.ts`),
 * every mutation is EDITOR inside `actions.ts`. Below EDITOR the editor is not
 * offered at all — a form guaranteed to fail on save is worse than no form.
 */

import { checkPageRole, hasRole } from "@/lib/api-utils"
import { listUpcomingEpisodesForAdmin } from "@/lib/queries/upcoming-episodes"
import { listEpisodeIntelligenceRecords } from "@/lib/eir/service"
import { getGuests } from "@/lib/queries/episodes"
import { AdminPageHeader } from "../components/admin-page-header"
import { NoAccess } from "../ops/_components/no-access"
import { UpcomingManager } from "./upcoming-client"

export const dynamic = "force-dynamic"

export default async function AdminUpcomingPage() {
  const gate = await checkPageRole("VIEWER")
  if (!gate.ok) return <NoAccess roleLabelAr="مشاهد" />
  const canEdit = hasRole(gate.user.role, "EDITOR")

  // The two pickers are read here rather than in the client so the form has
  // its options on first paint — these lists are small and change rarely.
  const [rows, eirs, guests] = await Promise.all([
    listUpcomingEpisodesForAdmin(),
    listEpisodeIntelligenceRecords({ limit: 200 }).catch(() => []),
    getGuests().catch(() => []),
  ])

  return (
    <div className="space-y-6" dir="rtl" lang="ar">
      <AdminPageHeader
        title="الحلقات القادمة"
        description="صفحة الحلقة قبل نزولها — نفس الرابط اللي بتاخذه الحلقة بعد النشر"
      />

      <UpcomingManager
        rows={rows}
        canEdit={canEdit}
        eirOptions={eirs.map((e) => ({
          id: e.id,
          label: e.working_title?.trim() || "(بدون عنوان مبدئي)",
          phase: e.phase,
        }))}
        guestOptions={guests.map((g) => ({ id: g.id, name: g.name }))}
      />
    </div>
  )
}
