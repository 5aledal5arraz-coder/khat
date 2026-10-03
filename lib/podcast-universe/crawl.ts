/**
 * Channel verification + uploads-playlist crawl (B2, B5).
 *
 *   verify      handle / UC id → channels.list → canonical id + uploads playlist
 *   initial     walk the WHOLE uploads playlist, 50 per page
 *   incremental newest first, at least INCREMENTAL_MIN_PAGES pages, stop once a
 *               page is entirely already-known AND older than the last
 *               successful crawl boundary (`shouldStopIncremental`)
 *
 * Every page is: playlistItems.list → videos.list for those ids → UPSERT →
 * ONE checkpoint write to `podcast_crawl_runs.cursor_state`. A failure or a
 * worker restart resumes from the stored pageToken; a re-walked page is
 * harmless because the UPSERT is idempotent.
 *
 * Failure states stay distinct (D8):
 *   quota cap / Google quota  → run `budget_stopped`, channel `partial`, a
 *                               continuation job at the next quota day —
 *                               never `failed`, never "fully crawled"
 *   transient (429/5xx/net)   → run `partial`, the job throws, worker retries
 *   permanent (404/403/400)   → run `failed`, NonRetryableJobError
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  podcastChannels,
  podcastCrawlRuns,
  type PodcastRunType,
} from "@/lib/db/schema/podcast-universe"
import { INCREMENTAL_MIN_PAGES, YT_PAGE_SIZE } from "./constants"
import {
  episodeRowFromVideo,
  knownVideoIds,
  markUnavailable,
  unavailableKind,
  upsertEpisodes,
  type EpisodeRow,
} from "./episodes"
import { PodcastQuotaExhaustedError, reserveQuota } from "./quota"
import {
  createYoutubeClient,
  YoutubePermanentError,
  type YoutubeClient,
  type YtPlaylistItem,
} from "./youtube"

export type ChannelRow = typeof podcastChannels.$inferSelect
export type CrawlRunRow = typeof podcastCrawlRuns.$inferSelect

export interface CrawlCursor {
  pageToken: string | null
  pages: number
  done: boolean
  /** Upload ids videos.list did not return and that were never indexed (capped). */
  unavailable_ids?: string[]
  unavailable_count?: number
  /** Items videos.list returned but we could not index honestly (capped). */
  rejected?: Array<{ id: string; reason: string }>
  stop_reason?: string
  latest?: { id: string; published_at: string } | null
  [k: string]: unknown
}

const UNAVAILABLE_LOG_CAP = 200

// ─── Pure decisions ──────────────────────────────────────────────────────

/**
 * B5 stop rule for a weekly incremental crawl. Pure.
 * Stop only when ALL hold:
 *   • at least INCREMENTAL_MIN_PAGES pages have been read (overlap);
 *   • every id on the page was already indexed BEFORE this crawl;
 *   • every item on the page is older than the last successful crawl boundary.
 * A page with no items (end of playlist) is handled by pagination, not here.
 */
export function shouldStopIncremental(input: {
  pagesRead: number
  pageIds: string[]
  knownBefore: Set<string>
  pagePublishedAt: Array<Date | null>
  boundary: Date | null
}): boolean {
  if (input.pagesRead < INCREMENTAL_MIN_PAGES) return false
  if (input.pageIds.length === 0) return false
  if (!input.boundary) return false
  if (!input.pageIds.every((id) => input.knownBefore.has(id))) return false
  return input.pagePublishedAt.every((d) => d != null && d.getTime() < input.boundary!.getTime())
}

/** The upload id of a playlist item. */
export function playlistVideoId(item: YtPlaylistItem): string | null {
  return item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? null
}

/** The video's own publish time from a playlist item (falls back to the add time). */
export function playlistPublishedAt(item: YtPlaylistItem): Date | null {
  const raw = item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

// ─── Run bookkeeping ─────────────────────────────────────────────────────

export async function createRun(channelId: string | null, runType: PodcastRunType, extra: Partial<typeof podcastCrawlRuns.$inferInsert> = {}) {
  const [row] = await db!
    .insert(podcastCrawlRuns)
    .values({ channel_id: channelId, run_type: runType, status: "queued", ...extra })
    .returning()
  return row
}

export async function loadRun(runId: string): Promise<CrawlRunRow | null> {
  const rows = await db!.select().from(podcastCrawlRuns).where(eq(podcastCrawlRuns.id, runId)).limit(1)
  return rows[0] ?? null
}

export async function loadChannel(channelId: string): Promise<ChannelRow | null> {
  const rows = await db!.select().from(podcastChannels).where(eq(podcastChannels.id, channelId)).limit(1)
  return rows[0] ?? null
}

/**
 * The run an operator's «زحف أولي» should continue: the newest unfinished
 * initial run of this channel (so a budget stop or failure resumes from its
 * checkpoint), else a fresh one.
 */
export async function resumableInitialRun(channelId: string): Promise<CrawlRunRow | null> {
  const rows = await db!
    .select()
    .from(podcastCrawlRuns)
    .where(
      and(
        eq(podcastCrawlRuns.channel_id, channelId),
        eq(podcastCrawlRuns.run_type, "initial"),
        inArray(podcastCrawlRuns.status, ["queued", "running", "partial", "budget_stopped", "failed"]),
      ),
    )
    .orderBy(desc(podcastCrawlRuns.created_at))
    .limit(1)
  return rows[0] ?? null
}

/** A crawler bound to a run: counts quota units in memory, flushed at each checkpoint. */
function boundClient(counter: { read: number; search: number }, client?: YoutubeClient): YoutubeClient {
  if (client) return client
  return createYoutubeClient({
    reserve: async (kind, units) => {
      await reserveQuota(kind, units)
      counter[kind] += units
    },
  })
}

// ─── Verify ──────────────────────────────────────────────────────────────

export interface VerifyResult {
  status: "verified" | "not_found"
  youtube_channel_id: string | null
  uploads_playlist_id: string | null
}

export async function verifyChannel(
  channelId: string,
  opts: { allowSearchFallback?: boolean; client?: YoutubeClient } = {},
): Promise<VerifyResult> {
  const channel = await loadChannel(channelId)
  if (!channel) throw new YoutubePermanentError(404, `podcast channel ${channelId} not found`)
  const counter = { read: 0, search: 0 }
  const yt = boundClient(counter, opts.client)
  const run = await createRun(channel.id, "channel_verify", { status: "running", started_at: new Date() })

  const finish = async (status: CrawlRunRow["status"], error: string | null) => {
    await db!
      .update(podcastCrawlRuns)
      .set({
        status,
        completed_at: new Date(),
        youtube_read_units: counter.read,
        youtube_search_calls: counter.search,
        error_summary: error,
      })
      .where(eq(podcastCrawlRuns.id, run.id))
  }

  try {
    // Known UC id → channels.list by id. Handle → forHandle. Never search.list
    // for a known handle (Decision 13); only an explicit fallback may.
    let item = channel.youtube_channel_id
      ? await yt.channelById(channel.youtube_channel_id)
      : channel.handle
        ? await yt.channelByHandle(channel.handle)
        : null
    if (!item && opts.allowSearchFallback && channel.handle) {
      const found = await yt.searchChannel(channel.handle)
      if (found) item = await yt.channelById(found)
    }
    if (!item) {
      await finish("failed", `channel not found on YouTube (${channel.youtube_channel_id ?? channel.handle})`)
      await db!
        .update(podcastChannels)
        .set({
          metadata: { ...channel.metadata, verify_error: "not_found", verify_checked_at: new Date().toISOString() },
          updated_at: new Date(),
        })
        .where(eq(podcastChannels.id, channel.id))
      return { status: "not_found", youtube_channel_id: null, uploads_playlist_id: null }
    }

    const uploads = item.contentDetails?.relatedPlaylists?.uploads ?? null
    const subs = item.statistics?.hiddenSubscriberCount ? null : Number(item.statistics?.subscriberCount ?? NaN)
    const videos = Number(item.statistics?.videoCount ?? NaN)
    await db!
      .update(podcastChannels)
      .set({
        youtube_channel_id: item.id,
        // YouTube's own title is the channel's name; the seed label stays in metadata.
        name: item.snippet?.title || channel.name || item.id,
        // Khaled's seed country wins; YouTube's self-declared country is kept as metadata.
        country_code: channel.country_code ?? item.snippet?.country ?? null,
        default_language: item.snippet?.defaultLanguage ?? channel.default_language,
        uploads_playlist_id: uploads,
        subscriber_count: Number.isFinite(subs) ? subs : null,
        reported_video_count: Number.isFinite(videos) ? videos : null,
        verification_status: uploads ? "verified" : "pending",
        metadata: {
          ...channel.metadata,
          seed_label: (channel.metadata as Record<string, unknown>)?.seed_label ?? channel.name,
          youtube_title: item.snippet?.title ?? null,
          youtube_custom_url: item.snippet?.customUrl ?? null,
          youtube_country: item.snippet?.country ?? null,
          verify_error: uploads ? null : "no_uploads_playlist",
          verify_checked_at: new Date().toISOString(),
        },
        updated_at: new Date(),
      })
      .where(eq(podcastChannels.id, channel.id))
    await finish(uploads ? "succeeded" : "failed", uploads ? null : "channel has no uploads playlist")
    return { status: uploads ? "verified" : "not_found", youtube_channel_id: item.id, uploads_playlist_id: uploads }
  } catch (err) {
    if (err instanceof PodcastQuotaExhaustedError) {
      await finish("budget_stopped", err.message)
    } else if (pgCode(err) === "23505") {
      // Another registry row already holds this YouTube channel id.
      const msg = "duplicate registry entry: this YouTube channel is already registered under another row"
      await finish("failed", msg)
      throw new YoutubePermanentError(409, msg)
    } else {
      await finish(err instanceof YoutubePermanentError ? "failed" : "partial", errMsg(err))
    }
    throw err
  }
}

// ─── Crawl ───────────────────────────────────────────────────────────────

export type CrawlOutcome =
  | { status: "succeeded"; pages: number; inserted: number; updated: number }
  | { status: "budget_stopped"; resetAt: Date; pages: number }
  | { status: "paused"; pages: number }
  /** Another initial/incremental crawl of this channel is running — nothing was done. */
  | { status: "busy"; runningRunId: string }

export interface CrawlDeps {
  client?: YoutubeClient
  now?: () => Date
}

/** Postgres error code, whether drizzle wrapped the pg error or not. */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | undefined
  const code = e?.code ?? e?.cause?.code
  return typeof code === "string" ? code : undefined
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Run (or resume) a crawl. `runId` names a podcast_crawl_runs row of type
 * initial | incremental whose cursor_state is the checkpoint.
 *
 * Throws on transient / permanent errors AFTER persisting the run state; the
 * caller (job handler) maps them to retry / no-retry. Quota exhaustion and an
 * operator pause are RETURNED, not thrown — they are states, not failures.
 */
export async function runCrawl(runId: string, deps: CrawlDeps = {}): Promise<CrawlOutcome> {
  const now = deps.now ?? (() => new Date())
  const run = await loadRun(runId)
  if (!run || !run.channel_id) throw new YoutubePermanentError(404, `crawl run ${runId} not found`)
  if (run.run_type !== "initial" && run.run_type !== "incremental") {
    throw new YoutubePermanentError(400, `run ${runId} is a ${run.run_type} run, not a crawl`)
  }
  const channel = await loadChannel(run.channel_id)
  if (!channel) throw new YoutubePermanentError(404, `channel ${run.channel_id} not found`)
  if (channel.verification_status !== "verified" || !channel.uploads_playlist_id) {
    throw new YoutubePermanentError(409, `channel ${channel.handle ?? channel.id} is not verified — run verify first`)
  }
  const incremental = run.run_type === "incremental"
  const boundary = channel.last_successful_crawl_at
  if (incremental && !boundary) {
    throw new YoutubePermanentError(409, "incremental crawl needs a completed initial crawl")
  }

  const counter = { read: 0, search: 0 }
  const yt = boundClient(counter, deps.client)
  // An incremental crawl always restarts from the newest page; an initial
  // crawl resumes from its checkpoint.
  const prior = (run.cursor_state ?? {}) as Partial<CrawlCursor>
  const cursor: CrawlCursor = incremental
    ? { pageToken: null, pages: 0, done: false, unavailable_count: 0, unavailable_ids: [], rejected: [], latest: null }
    : {
        pageToken: prior.pageToken ?? null,
        pages: prior.pages ?? 0,
        done: false,
        unavailable_count: prior.unavailable_count ?? 0,
        unavailable_ids: prior.unavailable_ids ?? [],
        rejected: prior.rejected ?? [],
        latest: prior.latest ?? null,
      }
  if (!incremental && prior.done) {
    // Already complete — a duplicate job; nothing to do.
    return { status: "succeeded", pages: cursor.pages, inserted: 0, updated: 0 }
  }

  const startedAt = run.started_at ?? now()
  // ONE active crawl per channel (initial AND incremental): claim the channel
  // under a channel-keyed advisory lock, so two jobs can never both see "free".
  const claim = await claimChannelCrawl(channel.id, run.id, startedAt)
  if (!claim.ok) return { status: "busy", runningRunId: claim.runningRunId }
  await db!
    .update(podcastChannels)
    .set({ crawl_status: "running", last_crawled_at: now(), updated_at: now() })
    .where(eq(podcastChannels.id, channel.id))

  // Per-run counters accumulate across resumes.
  let pagesThisJob = 0
  let inserted = 0
  let updated = 0
  let seen = 0
  const totals = { inserted: 0, updated: 0 }

  const checkpoint = async (extra: Partial<typeof podcastCrawlRuns.$inferInsert> = {}) => {
    await db!
      .update(podcastCrawlRuns)
      .set({
        cursor_state: cursor,
        playlist_pages: sql`${podcastCrawlRuns.playlist_pages} + ${pagesThisJob}`,
        video_ids_seen: sql`${podcastCrawlRuns.video_ids_seen} + ${seen}`,
        episodes_inserted: sql`${podcastCrawlRuns.episodes_inserted} + ${inserted}`,
        episodes_updated: sql`${podcastCrawlRuns.episodes_updated} + ${updated}`,
        youtube_read_units: sql`${podcastCrawlRuns.youtube_read_units} + ${counter.read}`,
        youtube_search_calls: sql`${podcastCrawlRuns.youtube_search_calls} + ${counter.search}`,
        ...extra,
      })
      .where(eq(podcastCrawlRuns.id, run.id))
    pagesThisJob = 0
    inserted = 0
    updated = 0
    seen = 0
    counter.read = 0
    counter.search = 0
  }

  const setChannel = async (patch: Partial<typeof podcastChannels.$inferInsert>) => {
    await db!.update(podcastChannels).set({ ...patch, updated_at: now() }).where(eq(podcastChannels.id, channel.id))
  }

  try {
    for (;;) {
      // Re-read the pause flag every page so «إيقاف» takes effect promptly.
      const fresh = await loadChannel(channel.id)
      if (fresh?.paused) {
        cursor.stop_reason = "paused"
        await checkpoint({ status: "partial", error_summary: "paused by operator" })
        await setChannel({ crawl_status: "partial" })
        return { status: "paused", pages: cursor.pages }
      }

      const page = await yt.playlistPage(channel.uploads_playlist_id, cursor.pageToken)
      const ids: string[] = []
      const byId = new Map<string, YtPlaylistItem>()
      for (const it of page.items) {
        const id = playlistVideoId(it)
        if (id && !byId.has(id)) {
          byId.set(id, it)
          ids.push(id)
        }
      }
      const knownBefore = await knownVideoIds(ids)

      const rows: EpisodeRow[] = []
      // Uploads videos.list does not return (private/deleted) can never be
      // indexed; for the B5 stop rule they count as known, or one permanently
      // private upload would keep every weekly sync walking past its page.
      const unindexable = new Set<string>()
      if (ids.length > 0) {
        const videos = await yt.videosByIds(ids.slice(0, YT_PAGE_SIZE))
        const returned = new Set<string>()
        const t = now()
        for (const v of videos) {
          returned.add(v.id)
          const built = episodeRowFromVideo(v, channel.id, channel.registry_type, t)
          if (built.row) rows.push(built.row)
          else if ((cursor.rejected ?? []).length < UNAVAILABLE_LOG_CAP) cursor.rejected!.push({ id: v.id, reason: built.reason })
        }
        for (const id of ids) {
          if (returned.has(id)) continue
          unindexable.add(id)
          const kind = unavailableKind(byId.get(id))
          if (knownBefore.has(id)) {
            await markUnavailable(id, kind, t)
          } else {
            cursor.unavailable_count = (cursor.unavailable_count ?? 0) + 1
            if ((cursor.unavailable_ids ?? []).length < UNAVAILABLE_LOG_CAP) cursor.unavailable_ids!.push(`${id}:${kind}`)
          }
        }
      }

      const res = await upsertEpisodes(rows)
      inserted += res.inserted
      updated += res.updated
      totals.inserted += res.inserted
      totals.updated += res.updated
      seen += ids.length
      pagesThisJob += 1
      cursor.pages += 1
      cursor.pageToken = page.nextPageToken
      for (const r of rows) {
        if (!cursor.latest || r.published_at.getTime() > new Date(cursor.latest.published_at).getTime()) {
          cursor.latest = { id: r.youtube_video_id, published_at: r.published_at.toISOString() }
        }
      }

      const stopIncremental =
        incremental &&
        shouldStopIncremental({
          pagesRead: cursor.pages,
          pageIds: ids,
          knownBefore: new Set([...knownBefore, ...unindexable]),
          pagePublishedAt: ids.map((id) => playlistPublishedAt(byId.get(id)!)),
          boundary,
        })
      if (!page.nextPageToken || stopIncremental) {
        cursor.done = true
        cursor.stop_reason = page.nextPageToken ? "incremental_overlap_reached" : "playlist_exhausted"
        await checkpoint({ status: "succeeded", completed_at: now() })
        const latest = cursor.latest
        const keepLatest =
          channel.latest_known_published_at &&
          latest &&
          channel.latest_known_published_at.getTime() >= new Date(latest.published_at).getTime()
        await setChannel({
          crawl_status: "complete",
          // The boundary is when THIS crawl started, so anything published
          // while it ran is re-examined by the next incremental crawl.
          last_successful_crawl_at: startedAt,
          ...(latest && !keepLatest
            ? { latest_known_video_id: latest.id, latest_known_published_at: new Date(latest.published_at) }
            : {}),
        })
        return { status: "succeeded", pages: cursor.pages, ...totals }
      }
      await checkpoint()
    }
  } catch (err) {
    if (err instanceof PodcastQuotaExhaustedError) {
      cursor.stop_reason = `quota:${err.kind}`
      await checkpoint({ status: "budget_stopped", error_summary: err.message })
      await setChannel({ crawl_status: "partial" })
      return { status: "budget_stopped", resetAt: err.resetAt, pages: cursor.pages }
    }
    const permanent = err instanceof YoutubePermanentError
    await checkpoint({ status: permanent ? "failed" : "partial", error_summary: errMsg(err) })
    await setChannel({ crawl_status: permanent ? "failed" : "partial" })
    throw err
  }
}

/**
 * Claim the channel for this crawl run. Under pg_advisory_xact_lock keyed on
 * the channel, refuse when ANOTHER initial/incremental run of the channel is
 * `running` AND still has a live job (pending/running) behind it. A `running`
 * row whose job is gone (worker died, job dead-lettered) is stale: it is
 * marked `partial` and the channel is taken over — a stale row must never
 * block the channel forever.
 */
export async function claimChannelCrawl(
  channelId: string,
  runId: string,
  startedAt: Date,
): Promise<{ ok: true } | { ok: false; runningRunId: string }> {
  return db!.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"podcast-crawl:" + channelId}))`)
    const others = (
      await tx.execute(sql`
        SELECT r.id,
               EXISTS (SELECT 1 FROM jobs j WHERE j.status IN ('pending', 'running')
                         AND j.type IN ('podcast.channel.initial_crawl', 'podcast.channel.incremental_crawl')
                         AND j.payload->>'runId' = r.id::text) AS live
        FROM podcast_crawl_runs r
        WHERE r.channel_id = ${channelId}::uuid AND r.run_type IN ('initial', 'incremental')
          AND r.status = 'running' AND r.id <> ${runId}::uuid`)
    ).rows as Array<{ id: string; live: boolean }>
    const live = others.find((o) => o.live)
    if (live) return { ok: false as const, runningRunId: live.id }
    for (const stale of others) {
      await tx
        .update(podcastCrawlRuns)
        .set({ status: "partial", error_summary: "stale: its job is gone — superseded by a new crawl of the channel" })
        .where(eq(podcastCrawlRuns.id, stale.id))
    }
    await tx
      .update(podcastCrawlRuns)
      .set({ status: "running", started_at: startedAt, error_summary: null })
      .where(eq(podcastCrawlRuns.id, runId))
    return { ok: true as const }
  })
}

/** Is any initial/incremental crawl of this channel running with a live job? */
export async function channelCrawlRunning(channelId: string): Promise<string | null> {
  const r = await db!.execute(sql`
    SELECT r.id FROM podcast_crawl_runs r
    WHERE r.channel_id = ${channelId}::uuid AND r.run_type IN ('initial', 'incremental') AND r.status = 'running'
      AND EXISTS (SELECT 1 FROM jobs j WHERE j.status IN ('pending', 'running') AND j.payload->>'runId' = r.id::text)
    LIMIT 1`)
  return (r.rows[0] as { id: string } | undefined)?.id ?? null
}

/** Mark a run (and its channel) failed after the worker's last attempt. */
export async function markCrawlFailed(runId: string, message: string): Promise<void> {
  const run = await loadRun(runId)
  if (!run) return
  await db!
    .update(podcastCrawlRuns)
    .set({ status: "failed", completed_at: new Date(), error_summary: message })
    .where(eq(podcastCrawlRuns.id, runId))
  if (run.channel_id) {
    await db!
      .update(podcastChannels)
      .set({ crawl_status: "failed", updated_at: new Date() })
      .where(eq(podcastChannels.id, run.channel_id))
  }
}
