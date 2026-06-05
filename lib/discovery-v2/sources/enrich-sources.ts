/**
 * v2 enrichment sources. Each returns one slice of EnrichmentSignals and
 * NEVER throws (returns null / zeros on failure) so one slow/keyless
 * source can't break a run. All are real, authoritative sources:
 *
 *   - OpenAlex      (free, no key) — scholarly footprint
 *   - Google Books  (free)         — authored books
 *   - GDELT         (free, no key) — recent global press
 *   - YouTube       (YOUTUBE_API_KEY) — the person's own channel/talks
 *   - Listen Notes  (LISTEN_NOTES_API_KEY) — prior podcast appearances
 */

import type { EnrichmentSignals } from "../types"

const UA = "KhatPodcast-GuestDiscovery/1.0 (https://khatpodcast.com)"

async function getJson(url: string, headers: Record<string, string> = {}, timeoutMs = 9000): Promise<any | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

const nameTokens = (s: string) =>
  s.toLowerCase().replace(/[.,؛،"'()\-_/]/g, " ").split(/\s+/).filter((t) => t.length >= 2)

// ─── OpenAlex ────────────────────────────────────────────────────────
export async function openAlex(nameEn: string): Promise<EnrichmentSignals["scholar"]> {
  if (!nameEn) return null
  const j = await getJson(
    `https://api.openalex.org/authors?search=${encodeURIComponent(nameEn)}&per-page=1&mailto=noreply@khatpodcast.com`,
  )
  const a = j?.results?.[0]
  if (!a) return null
  return {
    works: Number(a.works_count) || 0,
    cited_by: Number(a.cited_by_count) || 0,
    institution: a.last_known_institutions?.[0]?.display_name ?? a.last_known_institution?.display_name ?? null,
  }
}

// ─── Google Books ────────────────────────────────────────────────────
export async function googleBooks(nameEn: string, nameAr: string): Promise<EnrichmentSignals["books"]> {
  const q = nameEn || nameAr
  if (!q) return null
  const key = process.env.GOOGLE_BOOKS_KEY ? `&key=${process.env.GOOGLE_BOOKS_KEY}` : ""
  const j = await getJson(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`inauthor:"${q}"`)}&maxResults=3&country=US${key}`,
  )
  const count = Number(j?.totalItems) || 0
  if (count <= 0) return { count: 0 }
  return { count, top_title: j?.items?.[0]?.volumeInfo?.title ?? null }
}

// ─── GDELT news (recent press) ───────────────────────────────────────
export async function gdeltNews(name: string, nameEn: string | null): Promise<EnrichmentSignals["news"]> {
  const q = `"${nameEn || name}"`
  const j = await getJson(
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=ArtList&maxrecords=10&timespan=12months&format=json&sort=DateDesc`,
    {},
    8000,
  )
  const arts = j?.articles ?? []
  if (!Array.isArray(arts) || arts.length === 0) return { recent_mentions: 0 }
  return { recent_mentions: arts.length, latest_url: arts[0]?.url ?? null, latest_title: arts[0]?.title ?? null }
}

// ─── YouTube — the person's OWN channel + a talk ─────────────────────
export async function youtubePerson(name: string, nameEn: string | null): Promise<EnrichmentSignals["youtube"]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
  const q = nameEn || name
  const tokens = nameTokens(q)
  // 1) channel that looks like this person
  const ch = await getJson(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=3&q=${encodeURIComponent(q)}&key=${key}`,
  )
  let channel_url: string | null = null
  let channel_title: string | null = null
  for (const it of ch?.items ?? []) {
    const title = (it?.snippet?.channelTitle ?? it?.snippet?.title ?? "").toLowerCase()
    const cid = it?.snippet?.channelId ?? it?.id?.channelId
    if (cid && tokens.length && tokens.every((t) => title.includes(t))) {
      channel_url = `https://youtube.com/channel/${cid}`
      channel_title = it?.snippet?.channelTitle ?? it?.snippet?.title ?? null
      break
    }
  }
  // 2) a talk/interview featuring them
  const vid = await getJson(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(`${q} مقابلة`)}&key=${key}`,
  )
  const v = vid?.items?.[0]
  const talk_url = v?.id?.videoId ? `https://www.youtube.com/watch?v=${v.id.videoId}` : null
  if (!channel_url && !talk_url) return null
  return { channel_url, channel_title, talk_url, subscriber_hint: null }
}

// ─── Listen Notes — prior podcast appearances (guestability) ─────────
// Uses the production API when LISTEN_NOTES_API_KEY is set; otherwise
// falls back to Listen Notes' free sandbox (listen-api-test) so the
// integration is exercised end-to-end with MOCK data. Add a real key to
// get live, per-person results — no code change needed.
export async function podcastAppearances(name: string, nameEn: string | null): Promise<EnrichmentSignals["podcast"]> {
  const realKey = process.env.LISTEN_NOTES_API_KEY
  const testMode = !realKey || realKey.toLowerCase() === "test"
  const base = testMode ? "https://listen-api-test.listennotes.com" : "https://listen-api.listennotes.com"
  const apiKey = testMode ? "test" : realKey!
  const q = nameEn || name
  const j = await getJson(
    `${base}/api/v2/search?q=${encodeURIComponent(q)}&type=episode&only_in=title,description&page_size=10`,
    { "X-ListenAPI-Key": apiKey },
  )
  if (!j) return { appearances: 0, configured: !testMode, test: testMode }
  const results = j?.results ?? []
  return {
    appearances: Array.isArray(results) ? results.length : 0,
    latest_url: results?.[0]?.link ?? results?.[0]?.audio ?? null,
    configured: !testMode,
    test: testMode,
  }
}
