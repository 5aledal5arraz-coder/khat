export const dynamic = 'force-dynamic'

import { checkPageRole } from '@/lib/api-utils'
import { NoAccess } from '../ops/_components/no-access'
import { TeamManager } from './team-manager'

/**
 * Page-level gate matching the API contract.
 *
 * Every handler under /api/admin/team already enforces `requireRole('OWNER')`,
 * so no team data could leak without this — but without it a VIEWER who opened
 * the page got the full chrome (header, "إضافة مستخدم", an empty table) and a
 * bare "حدث خطأ", which reads as a broken page rather than a closed door. Same
 * pattern as /admin/blind-panel and /admin/ops: refuse in place, don't redirect.
 */
export default async function TeamPage() {
  const gate = await checkPageRole('OWNER')
  if (!gate.ok) return <NoAccess roleLabelAr="المالك" />

  return <TeamManager />
}
