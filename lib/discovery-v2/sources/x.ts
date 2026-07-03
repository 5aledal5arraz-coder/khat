/**
 * v2 enrichment source — X (Twitter) presence + recent activity.
 *
 * Identity-safe BY DESIGN: we only look up the EXACT handle Wikidata attaches
 * to the resolved person (property P2002, already extracted into
 * wiki.social.x). No fuzzy name search — a viral account that merely shares
 * the candidate's name can never contaminate their signals, matching the
 * QID-anchor philosophy of the whole v2 engine. No handle on Wikidata → null
 * slice (the candidate still scores from the other sources).
 *
 * Two bounded calls per candidate (profile + recent posts). Key-gated on
 * X_BEARER_TOKEN and never throws, like every other enrichment source.
 */

import { getUserByUsername, getUserRecentPosts, isXConfigured } from "@/lib/x/client"
import type { EnrichmentSignals, WikiFacts } from "../types"

export type XPostingCadence = "active" | "occasional" | "dormant"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Classify posting cadence from recent original-post timestamps.
 *   active     — posted within 30 days AND ≥3 posts in 90 days
 *   occasional — posted within 180 days
 *   dormant    — nothing in 180 days (or no dated posts at all)
 * Pure — unit-tested with an injected `now`.
 */
export function classifyPosting(postDates: Array<string | null>, now = Date.now()): XPostingCadence {
  const times = postDates
    .map((d) => (d ? Date.parse(d) : NaN))
    .filter((t) => Number.isFinite(t)) as number[]
  if (times.length === 0) return "dormant"
  const newest = Math.max(...times)
  const in90 = times.filter((t) => now - t <= 90 * DAY_MS).length
  if (now - newest <= 30 * DAY_MS && in90 >= 3) return "active"
  if (now - newest <= 180 * DAY_MS) return "occasional"
  return "dormant"
}

/** Extract the bare username from wiki.social.x ("https://x.com/<user>"). */
export function usernameFromWiki(wiki: WikiFacts): string | null {
  const url = wiki.social?.x
  if (!url) return null
  const m = url.match(/(?:x|twitter)\.com\/(@?[A-Za-z0-9_]{1,15})/)
  return m ? m[1].replace(/^@/, "") : null
}

export async function xPresence(wiki: WikiFacts): Promise<EnrichmentSignals["x"]> {
  if (!isXConfigured()) return null
  const username = usernameFromWiki(wiki)
  if (!username) return null

  const user = await getUserByUsername(username)
  if (!user) return null

  const posts = await getUserRecentPosts(user.id, 10)
  const posting = classifyPosting(posts.map((p) => p.created_at))
  const engagement = posts.length
    ? Math.round(posts.reduce((s, p) => s + p.likes + p.reposts + p.replies, 0) / posts.length)
    : 0
  // A cheap "what are they talking about" sample for the operator + AI briefs.
  const recentSample = posts
    .slice(0, 3)
    .map((p) => p.text.replace(/\s+/g, " ").slice(0, 140))

  return {
    url: `https://x.com/${user.username}`,
    username: user.username,
    followers: user.followers,
    verified: user.verified,
    posting,
    recent_posts: posts.length,
    avg_engagement: engagement,
    recent_sample: recentSample,
    bio: user.description,
  }
}
