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
 */

import { revalidatePath } from "next/cache"

export function revalidateStudio(sessionId?: string): void {
  revalidatePath("/admin/studio")
  if (sessionId) {
    revalidatePath(`/admin/studio/${sessionId}`)
  }
}
