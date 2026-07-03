/**
 * X (Twitter) API v2 client — the single low-level client for every X
 * consumer in the app (guest-discovery enrichment, preparation research).
 *
 * Design rules, matching the other external adapters (enrich-sources.ts):
 *   • key-gated: without X_BEARER_TOKEN every call resolves null — callers
 *     degrade gracefully, nothing throws.
 *   • never throws: network / 4xx / 5xx / 429 / abort all → null.
 *   • bounded: 9s timeout per call, small page sizes.
 *
 * Rate-limit note: discovery enriches candidates ~6 at a time with ≤2 calls
 * each (profile + recent posts). On the free API tier that will mostly 429 →
 * null slices (candidates still score from the other sources); Basic tier or
 * above is needed for real coverage.
 */

import { env } from "@/lib/env"

const API = "https://api.x.com/2"
const TIMEOUT_MS = 9_000

export function isXConfigured(): boolean {
  return Boolean(env.X_BEARER_TOKEN)
}

async function getJson(path: string, params: Record<string, string>): Promise<unknown | null> {
  const token = env.X_BEARER_TOKEN
  if (!token) return null
  const url = new URL(`${API}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export interface XUser {
  id: string
  username: string
  name: string
  description: string | null
  verified: boolean
  followers: number
  following: number
  tweet_count: number
  created_at: string | null
  location: string | null
}

export async function getUserByUsername(username: string): Promise<XUser | null> {
  const clean = username.replace(/^@/, "").trim()
  if (!clean) return null
  const j = (await getJson(`/users/by/username/${encodeURIComponent(clean)}`, {
    "user.fields": "public_metrics,verified,verified_type,description,created_at,location",
  })) as { data?: Record<string, unknown> } | null
  const d = j?.data
  if (!d || typeof d.id !== "string") return null
  const metrics = (d.public_metrics ?? {}) as Record<string, number>
  return {
    id: d.id,
    username: String(d.username ?? clean),
    name: String(d.name ?? clean),
    description: typeof d.description === "string" ? d.description : null,
    verified: Boolean(d.verified) || d.verified_type === "blue" || d.verified_type === "business",
    followers: Number(metrics.followers_count) || 0,
    following: Number(metrics.following_count) || 0,
    tweet_count: Number(metrics.tweet_count) || 0,
    created_at: typeof d.created_at === "string" ? d.created_at : null,
    location: typeof d.location === "string" ? d.location : null,
  }
}

export interface XPost {
  id: string
  text: string
  created_at: string | null
  likes: number
  reposts: number
  replies: number
  lang: string | null
}

function mapPosts(j: unknown): XPost[] {
  const data = (j as { data?: Array<Record<string, unknown>> } | null)?.data
  if (!Array.isArray(data)) return []
  return data.map((t) => {
    const m = (t.public_metrics ?? {}) as Record<string, number>
    return {
      id: String(t.id ?? ""),
      text: String(t.text ?? ""),
      created_at: typeof t.created_at === "string" ? t.created_at : null,
      likes: Number(m.like_count) || 0,
      reposts: Number(m.retweet_count) || 0,
      replies: Number(m.reply_count) || 0,
      lang: typeof t.lang === "string" ? t.lang : null,
    }
  })
}

/** A user's own recent original posts (no retweets/replies). */
export async function getUserRecentPosts(userId: string, max = 10): Promise<XPost[]> {
  const j = await getJson(`/users/${encodeURIComponent(userId)}/tweets`, {
    max_results: String(Math.min(Math.max(max, 5), 100)),
    exclude: "retweets,replies",
    "tweet.fields": "created_at,public_metrics,lang",
  })
  return mapPosts(j)
}

/** Full-text recent search (last ~7 days) — used by preparation research. */
export async function searchRecentPosts(query: string, max = 10): Promise<XPost[]> {
  if (!query.trim()) return []
  const j = await getJson(`/tweets/search/recent`, {
    query: `${query.trim()} -is:retweet`,
    max_results: String(Math.min(Math.max(max, 10), 100)),
    "tweet.fields": "created_at,public_metrics,lang",
  })
  return mapPosts(j)
}
