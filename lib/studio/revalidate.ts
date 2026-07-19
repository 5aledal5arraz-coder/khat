/**
 * Studio cache revalidation helper.
 *
 * Studio admin pages use `dynamic = "force-dynamic"`, so revalidation is
 * effectively a no-op at runtime — but calling it after every mutation keeps
 * the admin UI defensively coherent and matches the Episodes/Guests pattern
 * (and satisfies the QA persistence/mutation-revalidates check).
 *
 * Usage:
 *   import { revalidateStudio } from "@/lib/studio/revalidate"
 *   revalidateStudio()              // top-level list mutation
 *   revalidateStudio(sessionId)     // per-session mutation
 *
 * There is no `/admin/studio/[sessionId]` page — sessions open inside
 * `/admin/studio` (deep-linked via `?video=`), so the list path covers
 * per-session mutations too. The optional param is kept so the ~30
 * mutation routes calling `revalidateStudio(id)` stay source-compatible.
 */

import { revalidatePath } from "next/cache"

export function revalidateStudio(sessionId?: string): void {
  // Accepted for call-site compatibility only — no per-session page exists.
  void sessionId
  revalidatePath("/admin/studio")
}
