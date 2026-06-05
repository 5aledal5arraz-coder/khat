/**
 * UX-1 — `/admin/khat-brain/command` is now an alias for the Command
 * Center, which lives at `/admin/khat-brain` (the operator's home).
 *
 * Kept in place so existing bookmarks + deep links from emails / docs /
 * ad-hoc tooling continue to work for at least one release.
 */

import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function CommandCenterAliasPage() {
  redirect("/admin/khat-brain")
}
