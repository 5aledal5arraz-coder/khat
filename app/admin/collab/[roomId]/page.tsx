/**
 * Legacy /admin/collab/[roomId] — RETIRED.
 *
 * The multi-role live collaboration room has been folded into the unified
 * V2 recording room at /admin/recording/[roomId]/v2, which now covers the
 * full multi-participant experience (presence, role-based views on prep_v2,
 * live section sync, director markers, team notes, energy, materials). This
 * route permanently redirects there so old links and bookmarks keep working.
 */

import { redirect } from "next/navigation"

export default async function LegacyCollabRedirect({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
  redirect(`/admin/recording/${roomId}/v2`)
}
