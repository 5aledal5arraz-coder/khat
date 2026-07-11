/**
 * Instagram Graph API client — the single low-level client for every
 * Instagram consumer in the app (guest-discovery enrichment, future
 * preparation research). Official Meta surface only ("Instagram API with
 * Facebook Login", graph.facebook.com).
 *
 * What Meta officially allows for OTHER people's public content (2026):
 *   • Business Discovery — public profile + recent media (captions,
 *     like/comment counts, timestamps) of any Business/Creator account,
 *     looked up by EXACT username. No authorization from the target needed.
 *   • Hashtag Search — top/recent public media for a hashtag. Hard quota:
 *     30 unique hashtags per rolling 7 days per IG account, and it needs
 *     the "Instagram Public Content Access" feature (Meta App Review).
 *   • Nothing else. There is NO official keyword search over users,
 *     captions, or locations; the Basic Display API was shut down
 *     (Dec 2024); CrowdTangle is gone (Aug 2024) and its successor (Meta
 *     Content Library) is restricted to vetted academic research.
 *     Scraping/unofficial resellers violate Meta's ToS — deliberately NOT
 *     implemented. See docs/instagram-research.md for the full picture.
 *
 * Setup (both required):
 *   IG_GRAPH_TOKEN         — long-lived access token from a Meta app with
 *                            `instagram_basic` (+ "Instagram Public Content
 *                            Access" for hashtags), issued via Facebook
 *                            Login for Business.
 *   IG_BUSINESS_ACCOUNT_ID — the IG professional (business/creator)
 *                            account id linked to the podcast's Facebook
 *                            Page. Business Discovery + hashtag search are
 *                            anchored on an account we own.
 *   IG_GRAPH_VERSION       — optional Graph version, defaults to v23.0.
 *
 * Design rules, matching the other external adapters (lib/x/client.ts):
 *   • key-gated: without config every call resolves null/[] — callers
 *     degrade gracefully, nothing throws.
 *   • never throws: network / 4xx / 5xx / abort all → null/[].
 *   • bounded: 9s timeout per call, small page sizes.
 */

import { env } from "@/lib/env"

const TIMEOUT_MS = 9_000
const DEFAULT_GRAPH_VERSION = "v23.0"

/** IG usernames: letters, digits, dots, underscores, ≤30 chars. Strict —
 *  the username is interpolated into the `fields` expression, so anything
 *  else must be rejected outright. */
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/

export function isInstagramConfigured(): boolean {
  return Boolean(env.IG_GRAPH_TOKEN && env.IG_BUSINESS_ACCOUNT_ID)
}

function graphBase(): string {
  const v = env.IG_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION
  return `https://graph.facebook.com/${v}`
}

async function getJson(path: string, params: Record<string, string>): Promise<unknown | null> {
  const token = env.IG_GRAPH_TOKEN
  if (!token) return null
  const url = new URL(`${graphBase()}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set("access_token", token)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal })
    // 400 here usually means "target is not a Business/Creator account" —
    // a documented coverage gap, not an error worth surfacing.
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export interface IgMedia {
  id: string
  caption: string | null
  /** null when the owner hides like counts — treat as "unknown", not 0. */
  likes: number | null
  comments: number
  timestamp: string | null
  permalink: string | null
  media_type: string | null
}

export interface IgBusinessProfile {
  username: string
  name: string | null
  biography: string | null
  website: string | null
  followers: number
  media_count: number
  media: IgMedia[]
}

function mapMedia(items: unknown): IgMedia[] {
  if (!Array.isArray(items)) return []
  return items.map((m: Record<string, unknown>) => ({
    id: String(m.id ?? ""),
    caption: typeof m.caption === "string" ? m.caption : null,
    likes: typeof m.like_count === "number" ? m.like_count : null,
    comments: Number(m.comments_count) || 0,
    timestamp: typeof m.timestamp === "string" ? m.timestamp : null,
    permalink: typeof m.permalink === "string" ? m.permalink : null,
    media_type: typeof m.media_type === "string" ? m.media_type : null,
  }))
}

/**
 * Public profile + recent media of another Business/Creator account, by
 * exact username (official Business Discovery). Personal accounts and
 * unknown usernames resolve null.
 */
export async function getBusinessProfile(username: string): Promise<IgBusinessProfile | null> {
  const anchorId = env.IG_BUSINESS_ACCOUNT_ID
  if (!isInstagramConfigured() || !anchorId) return null
  const clean = username.replace(/^@/, "").trim()
  if (!USERNAME_RE.test(clean)) return null

  const fields =
    `business_discovery.username(${clean})` +
    `{username,name,biography,website,followers_count,media_count,` +
    `media.limit(12){caption,like_count,comments_count,timestamp,media_type,permalink}}`
  const j = (await getJson(`/${encodeURIComponent(anchorId)}`, { fields })) as {
    business_discovery?: Record<string, unknown>
  } | null
  const d = j?.business_discovery
  if (!d || typeof d.username !== "string") return null

  const media = (d.media as { data?: unknown } | undefined)?.data
  return {
    username: d.username,
    name: typeof d.name === "string" ? d.name : null,
    biography: typeof d.biography === "string" ? d.biography : null,
    website: typeof d.website === "string" ? d.website : null,
    followers: Number(d.followers_count) || 0,
    media_count: Number(d.media_count) || 0,
    media: mapMedia(media),
  }
}

/**
 * Public top media for a hashtag (two Graph calls: id lookup → top_media).
 * QUOTA: each UNIQUE hashtag counts against 30 per rolling 7 days for the
 * anchor account — call this sparingly and cache upstream. Returns [] when
 * unconfigured, over quota, or the app lacks Instagram Public Content
 * Access (Advanced Access via App Review).
 */
export async function searchHashtagTopMedia(hashtag: string, limit = 25): Promise<IgMedia[]> {
  const anchorId = env.IG_BUSINESS_ACCOUNT_ID
  if (!isInstagramConfigured() || !anchorId) return []
  // Arabic hashtags are first-class on Instagram — strip # and whitespace only.
  const clean = hashtag.replace(/^#/, "").trim()
  if (!clean || /\s/.test(clean)) return []

  const found = (await getJson(`/ig_hashtag_search`, {
    user_id: anchorId,
    q: clean,
  })) as { data?: Array<{ id?: string }> } | null
  const hashtagId = found?.data?.[0]?.id
  if (!hashtagId) return []

  const media = (await getJson(`/${encodeURIComponent(hashtagId)}/top_media`, {
    user_id: anchorId,
    fields: "caption,like_count,comments_count,timestamp,media_type,permalink",
    limit: String(Math.min(Math.max(limit, 1), 50)),
  })) as { data?: unknown } | null
  return mapMedia(media?.data)
}
