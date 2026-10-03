/**
 * Podcast Universe — YouTube Data API v3 client.
 *
 * Uses the project's existing key (`env.YOUTUBE_API_KEY`, the same one
 * lib/youtube/client.ts and the market adapter use) sent as the
 * `X-goog-api-key` header — never in a URL, never in a log line.
 *
 * Why not lib/youtube/client.ts#fetchYouTube: that helper caches through
 * `next: { revalidate: 43200 }` (a crawler must see today's data, and runs in
 * the worker where there is no Next cache) and throws one flat Error, so a
 * crawler cannot tell "quota exhausted — pause until reset" from "deleted
 * channel — never retry" from "5xx — retry". B12 needs those three apart.
 *
 * Every call reserves quota through `reserve` BEFORE it is sent (B4), and the
 * only endpoints are the 1-unit reads: channels.list, playlistItems.list,
 * videos.list. search.list exists only as `searchChannel` (fallback for an
 * unknown channel, Decision 13) and is never used to crawl.
 */
import { env } from "@/lib/env"
import { PodcastQuotaExhaustedError, nextQuotaReset, type QuotaKind } from "./quota"
import { YT_PAGE_SIZE } from "./constants"

const API_BASE = "https://www.googleapis.com/youtube/v3"

/** HTTP 429 / 5xx / network failure that survived the in-call retries — the job may retry (B12). */
export class YoutubeTransientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "YoutubeTransientError"
  }
}

/** 400 / 403-permission / 404 — retrying cannot help (B12). */
export class YoutubePermanentError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "YoutubePermanentError"
    this.status = status
  }
}

/** Google's own reason codes for an exhausted project quota. */
const GOOGLE_QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded"])
/** 403s that are really throttling — transient. */
const GOOGLE_RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"])

export type ReserveFn = (kind: QuotaKind, units: number) => Promise<void>

export interface YoutubeClientDeps {
  apiKey?: string | null
  reserve: ReserveFn
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  /** In-call retries for 429/5xx/network before surfacing a transient error. */
  maxInCallRetries?: number
}

// ─── Response shapes (only the fields we read) ───────────────────────────

export interface YtChannelItem {
  id: string
  snippet?: {
    title?: string
    customUrl?: string
    country?: string
    defaultLanguage?: string
  }
  statistics?: { subscriberCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean }
  contentDetails?: { relatedPlaylists?: { uploads?: string } }
}

export interface YtPlaylistItem {
  snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } }
  contentDetails?: { videoId?: string; videoPublishedAt?: string }
  status?: { privacyStatus?: string }
}

export interface YtVideoItem {
  id: string
  snippet?: {
    title?: string
    description?: string
    publishedAt?: string
    channelId?: string
    defaultLanguage?: string
    defaultAudioLanguage?: string
    liveBroadcastContent?: string
  }
  contentDetails?: { duration?: string }
  statistics?: { viewCount?: string }
  status?: { privacyStatus?: string; uploadStatus?: string }
}

export interface PlaylistPage {
  items: YtPlaylistItem[]
  nextPageToken: string | null
  totalResults: number | null
}

/** Reason codes from a Google error body — codes only, never message text. */
export async function errorReasons(res: Response): Promise<string[]> {
  try {
    const body = (await res.json()) as {
      error?: { errors?: Array<{ reason?: unknown }>; details?: Array<{ reason?: unknown }> }
    }
    const reasons = [
      ...(body.error?.errors ?? []).map((e) => e.reason),
      ...(body.error?.details ?? []).map((d) => d.reason),
    ].filter((r): r is string => typeof r === "string" && /^[A-Za-z_]+$/.test(r))
    return [...new Set(reasons)]
  } catch {
    return []
  }
}

export function createYoutubeClient(deps: YoutubeClientDeps) {
  const apiKey = deps.apiKey === undefined ? env.YOUTUBE_API_KEY : deps.apiKey
  const doFetch = deps.fetchImpl ?? fetch
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const maxRetries = deps.maxInCallRetries ?? 2

  async function call<T>(endpoint: string, params: Record<string, string>, kind: QuotaKind): Promise<T> {
    if (!apiKey) throw new YoutubePermanentError(0, "YOUTUBE_API_KEY not configured")
    const url = new URL(`${API_BASE}/${endpoint}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

    let lastTransient = ""
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await sleep(1000 * 3 ** (attempt - 1) + Math.floor(Math.random() * 250))
      // Reserve BEFORE sending — a retry is a new billable request.
      await deps.reserve(kind, 1)
      let res: Response
      try {
        res = await doFetch(url.toString(), {
          headers: { "X-goog-api-key": apiKey, Referer: "https://khatpodcast.com" },
          cache: "no-store",
        })
      } catch (err) {
        lastTransient = `network: ${err instanceof Error ? err.name : "fetch failed"}`
        continue
      }
      if (res.ok) return (await res.json()) as T

      const reasons = await errorReasons(res)
      const label = `YouTube ${endpoint} ${res.status}${reasons.length ? ` (${reasons.join(", ")})` : ""}`
      if (reasons.some((r) => GOOGLE_QUOTA_REASONS.has(r))) {
        throw new PodcastQuotaExhaustedError("google", nextQuotaReset(), reasons.join(","))
      }
      if (res.status === 429 || res.status >= 500 || reasons.some((r) => GOOGLE_RATE_REASONS.has(r))) {
        lastTransient = label
        continue
      }
      throw new YoutubePermanentError(res.status, label)
    }
    throw new YoutubeTransientError(lastTransient || `YouTube ${endpoint} failed`)
  }

  return {
    /** channels.list by handle (`@x` or `x`) — 1 unit. Null when no channel has it. */
    async channelByHandle(handle: string): Promise<YtChannelItem | null> {
      const clean = handle.trim().replace(/^@/, "")
      const data = await call<{ items?: YtChannelItem[] }>(
        "channels",
        { forHandle: clean, part: "snippet,statistics,contentDetails" },
        "read",
      )
      return data.items?.[0] ?? null
    },

    /** channels.list by UC… id — 1 unit. Null for an invalid/deleted id. */
    async channelById(channelId: string): Promise<YtChannelItem | null> {
      const data = await call<{ items?: YtChannelItem[] }>(
        "channels",
        { id: channelId, part: "snippet,statistics,contentDetails" },
        "read",
      )
      return data.items?.[0] ?? null
    },

    /** playlistItems.list, 50 per page — 1 unit. */
    async playlistPage(playlistId: string, pageToken: string | null): Promise<PlaylistPage> {
      const params: Record<string, string> = {
        playlistId,
        part: "snippet,contentDetails,status",
        maxResults: String(YT_PAGE_SIZE),
      }
      if (pageToken) params.pageToken = pageToken
      const data = await call<{
        items?: YtPlaylistItem[]
        nextPageToken?: string
        pageInfo?: { totalResults?: number }
      }>("playlistItems", params, "read")
      return {
        items: data.items ?? [],
        nextPageToken: data.nextPageToken ?? null,
        totalResults: data.pageInfo?.totalResults ?? null,
      }
    },

    /** videos.list for up to 50 ids — 1 unit. Missing ids = private/deleted. */
    async videosByIds(ids: string[]): Promise<YtVideoItem[]> {
      if (ids.length === 0) return []
      if (ids.length > YT_PAGE_SIZE) throw new Error(`videosByIds: at most ${YT_PAGE_SIZE} ids per call`)
      const data = await call<{ items?: YtVideoItem[] }>(
        "videos",
        { id: ids.join(","), part: "snippet,contentDetails,statistics,status", maxResults: String(YT_PAGE_SIZE) },
        "read",
      )
      return data.items ?? []
    },

    /**
     * search.list for a channel — FALLBACK ONLY (Decision 13): counted against
     * the 20-calls/day search cap, never used for a registered channel.
     */
    async searchChannel(query: string): Promise<string | null> {
      const data = await call<{ items?: Array<{ id?: { channelId?: string } }> }>(
        "search",
        { q: query, type: "channel", part: "id", maxResults: "1" },
        "search",
      )
      return data.items?.[0]?.id?.channelId ?? null
    },
  }
}

export type YoutubeClient = ReturnType<typeof createYoutubeClient>
