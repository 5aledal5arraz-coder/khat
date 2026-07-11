/**
 * v2 enrichment source — Instagram presence + recent activity, via the
 * official Business Discovery API (lib/instagram/client.ts).
 *
 * Identity-safe BY DESIGN, exactly like the X source: we only look up the
 * EXACT username Wikidata attaches to the resolved person (property P2003,
 * already extracted into wiki.social.instagram). No fuzzy name search —
 * Google-index/site-search lookups by display name were considered and
 * rejected: a same-name creator with a big account would contaminate the
 * candidate's signals. No handle on Wikidata → null slice.
 *
 * Coverage limitation (documented, accepted): Business Discovery only
 * resolves Business/Creator accounts. A personal-mode account → null slice;
 * the static Wikidata link still appears in evidence, the candidate simply
 * doesn't get the live-activity boost. One bounded Graph call per candidate.
 */

import { getBusinessProfile, isInstagramConfigured } from "@/lib/instagram/client"
import type { EnrichmentSignals, WikiFacts } from "../types"
import { classifyPosting } from "./x"

/** Extract the bare username from wiki.social.instagram
 *  ("https://instagram.com/<user>"). */
export function igUsernameFromWiki(wiki: WikiFacts): string | null {
  const url = wiki.social?.instagram
  if (!url) return null
  const m = url.match(/instagram\.com\/(@?[A-Za-z0-9._]{1,30})/)
  return m ? m[1].replace(/^@/, "") : null
}

export async function instagramPresence(
  wiki: WikiFacts,
): Promise<EnrichmentSignals["instagram"]> {
  if (!isInstagramConfigured()) return null
  const username = igUsernameFromWiki(wiki)
  if (!username) return null

  const profile = await getBusinessProfile(username)
  if (!profile) return null

  const posting = classifyPosting(profile.media.map((m) => m.timestamp))
  const withEngagement = profile.media.filter((m) => m.likes !== null)
  const engagement = withEngagement.length
    ? Math.round(
        withEngagement.reduce((s, m) => s + (m.likes ?? 0) + m.comments, 0) /
          withEngagement.length,
      )
    : 0
  // A cheap "what are they posting about" sample for the operator + AI briefs.
  const recentSample = profile.media
    .map((m) => m.caption)
    .filter((c): c is string => Boolean(c))
    .slice(0, 3)
    .map((c) => c.replace(/\s+/g, " ").slice(0, 140))

  return {
    url: `https://instagram.com/${profile.username}`,
    username: profile.username,
    followers: profile.followers,
    media_count: profile.media_count,
    posting,
    recent_posts: profile.media.length,
    avg_engagement: engagement,
    recent_sample: recentSample,
    bio: profile.biography,
    website: profile.website,
  }
}
