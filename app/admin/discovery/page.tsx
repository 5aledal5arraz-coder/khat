/**
 * Legacy /admin/discovery — RETIRED.
 *
 * Guest Discovery v1 has been replaced by the name-first, Wikidata-
 * anchored v2 engine at /admin/discovery-v2. This route now permanently
 * redirects there so old bookmarks and deep links keep working.
 */

import { redirect } from "next/navigation"

export default function LegacyDiscoveryRedirect() {
  redirect("/admin/discovery-v2")
}
