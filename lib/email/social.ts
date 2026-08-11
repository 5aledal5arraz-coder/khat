/**
 * The social accounts the newsletter footer links to — read from the SAME table
 * the site footer reads, so the two cannot drift.
 *
 * They already had. The footer's links were typed into `templates.ts` by hand
 * and pointed at `instagram.com/khatpodcast` and `x.com/khatpodcast`, while the
 * accounts Khaled actually maintains are `Khat.Podcast` and `Khat_Podcast`.
 * Nothing caught it: Instagram and X answer **200 with a login wall** for a
 * handle that does not exist, so a link checker sees a healthy page. A shared
 * source is the only thing that can catch this class of drift.
 *
 * Only the four platforms with icon artwork are returned
 * (`scripts/build-email-social-icons.ts`). A row added to the table for a fifth
 * platform is skipped rather than rendered as a broken image — the fix is to
 * draw the icon, and that is a deliberate decision, not a silent default.
 */
import { db } from "@/lib/db"
import { podcastPlatformLinks } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

import { EMAIL_SOCIAL_LINKS } from "./templates"

/** Platform keys we have icon artwork for, in the order the footer shows them. */
const ICON_ORDER = ["youtube", "instagram", "x", "tiktok"] as const

const LABELS: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  x: "X",
  tiktok: "TikTok",
}

/**
 * Live rows, falling back to `EMAIL_SOCIAL_LINKS` when the database is
 * unavailable or has none of the four. A newsletter that goes out with slightly
 * stale links is better than one that goes out with no footer at all, and the
 * fallback is kept correct by `tests/email/social-links.test.ts`.
 */
export async function getEmailSocialLinks(): Promise<typeof EMAIL_SOCIAL_LINKS> {
  if (!db) return EMAIL_SOCIAL_LINKS
  try {
    const rows = await db
      .select({ key: podcastPlatformLinks.platform_key, url: podcastPlatformLinks.url })
      .from(podcastPlatformLinks)
      .where(eq(podcastPlatformLinks.is_active, true))

    const byKey = new Map(rows.map((r) => [r.key, r.url]))
    const resolved = ICON_ORDER.filter((k) => byKey.get(k)).map((k) => ({
      key: k as string,
      label: LABELS[k],
      url: byKey.get(k)!,
    }))

    return resolved.length > 0 ? resolved : EMAIL_SOCIAL_LINKS
  } catch {
    return EMAIL_SOCIAL_LINKS
  }
}
