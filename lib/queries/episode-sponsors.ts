import { db } from "@/lib/db"
import { episodeSponsors } from "@/lib/db/schema/episodes"
import { trustedPartners } from "@/lib/db/schema/partnerships"
import { eq } from "drizzle-orm"

export interface EpisodeSponsorData {
  partnerId: string
  name: string
  logoUrl: string | null
  websiteUrl: string | null
  description: string | null
  brandLine: string | null
}

/** Get the sponsor for an episode. Returns null if no sponsor assigned. */
export async function getEpisodeSponsor(episodeId: string): Promise<EpisodeSponsorData | null> {
  // A3 — DB-null guard. "no sponsor" is a safe fallback for the
  // episode page and matches the catch-fallback for transient errors.
  if (!db) return null
  try {
    const [row] = await db
      .select({
        partnerId: trustedPartners.id,
        name: trustedPartners.name,
        logoUrl: trustedPartners.logo_url,
        websiteUrl: trustedPartners.website_url,
        description: trustedPartners.description,
        brandLine: episodeSponsors.custom_brand_line,
      })
      .from(episodeSponsors)
      .innerJoin(trustedPartners, eq(episodeSponsors.partner_id, trustedPartners.id))
      .where(eq(episodeSponsors.episode_id, episodeId))
      .limit(1)

    return row || null
  } catch {
    return null
  }
}

/** Assign a sponsor to an episode. Pass null partnerId to remove. */
export async function setEpisodeSponsor(
  episodeId: string,
  partnerId: string | null,
  customBrandLine?: string
): Promise<void> {
  // Remove existing
  await db!.delete(episodeSponsors).where(eq(episodeSponsors.episode_id, episodeId))

  // Add new if provided
  if (partnerId) {
    await db!.insert(episodeSponsors).values({
      episode_id: episodeId,
      partner_id: partnerId,
      custom_brand_line: customBrandLine || null,
    })
  }
}
