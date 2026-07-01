/**
 * Guest Identity Disambiguation.
 *
 * Runs BEFORE full research. The goal is not to gather facts — it's to
 * answer one question: "Which real person is the admin actually talking
 * about?" The admin provides a name, a short description, and optionally a
 * profile link. We use those to fetch 2–3 candidate people, each anchored
 * to a real source the admin can click through.
 *
 * Strategy:
 *
 *   1. If a profile link is provided, it becomes a pinned first candidate
 *      (we trust the admin's explicit pick more than any search).
 *   2. Gemini grounded search runs a single focused query — name +
 *      description — and we ask the model to extract up to 3 distinct
 *      people from the grounded results, each tied to one source chunk.
 *   3. YouTube search runs in parallel and top channel/video titles are
 *      scanned for people who match. These act as a fallback layer when
 *      Gemini misses or when the person is primarily a YouTube creator.
 *   4. We merge, dedupe by normalized name, and cap at 3 candidates.
 *
 * Refuses loudly when Gemini is unconfigured — the caller should surface
 * the error; we never return a silent empty list in that case.
 */

import { env } from "@/lib/env"
import { getGeminiClient, isGeminiConfigured } from "@/lib/ai/gemini"
import type { PreparationCandidate } from "@/types/preparation"

const GEMINI_MODEL = env.GEMINI_RETRIEVAL_MODEL || "gemini-2.5-flash"

// ─── Input ───────────────────────────────────────────────────────────────────

export interface IdentifyInput {
  guest_name: string
  guest_description: string
  guest_profile_link: string | null
}

export interface IdentifyResult {
  candidates: PreparationCandidate[]
  /** True when the Gemini call returned zero grounded chunks. */
  gemini_empty: boolean
  /** Set only when YouTube lookup also failed or was unavailable. */
  youtube_error?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, "") // strip Arabic diacritics
    .replace(/\s+/g, " ")
    .trim()
}

function safeDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

// NOTE: an earlier version of this module fetched the profile URL directly
// to extract its <title> tag. That opened a Server-Side Request Forgery
// vector — an authenticated admin could point the fetcher at internal
// services (169.254.169.254, 127.0.0.1, 10.x) and have response content
// leaked back via the candidate title. We intentionally do NOT fetch the
// URL here. The pinned candidate uses the admin-supplied name and the
// URL's domain as the display label.

// ─── Gemini candidate extraction ─────────────────────────────────────────────

interface GroundingChunkWeb {
  uri?: string
  title?: string
}
interface GroundingChunk {
  web?: GroundingChunkWeb
}
interface GroundingMetadata {
  groundingChunks?: GroundingChunk[]
}

/**
 * Ask Gemini to use Google Search and return 2–3 distinct candidate people.
 * We request a JSON array in the prompt, but we rely on grounding chunks
 * for the actual source URLs — the model's free-text is a naming hint,
 * the chunks are the authoritative list.
 */
async function geminiCandidates(
  input: IdentifyInput,
): Promise<{ candidates: PreparationCandidate[]; empty: boolean }> {
  const genAI = getGeminiClient()

  const query =
    `من هو "${input.guest_name}" — ${input.guest_description}؟ ` +
    `ابحث في Google واذكر الأشخاص المحتملين الذين يطابقون هذا الوصف. ` +
    `لكل شخص: الاسم الكامل، وصف قصير من سطر واحد (المجال، الجنسية، الدور)، ` +
    `والمصدر الرسمي أو الأكثر موثوقية. إذا كان هناك أكثر من شخص بنفس الاسم، ` +
    `اذكرهم جميعاً حتى 3 مرشحين، واشرح الفرق بينهم بوضوح.`

  const buildModel = (toolShape: "googleSearch" | "googleSearchRetrieval") => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: any[] =
      toolShape === "googleSearch"
        ? [{ googleSearch: {} }]
        : [{ googleSearchRetrieval: {} }]
    return genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools as any,
      generationConfig: { temperature: 0.2 },
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any
  try {
    result = await buildModel("googleSearch").generateContent(query)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/googleSearch|unknown field|invalid/i.test(message)) {
      result = await buildModel("googleSearchRetrieval").generateContent(query)
    } else {
      throw err
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidatesInResponse = (result?.response?.candidates ?? []) as any[]
  const groundingMetadata: GroundingMetadata | undefined =
    candidatesInResponse[0]?.groundingMetadata
  const freeText: string =
    result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || ""

  const chunks = groundingMetadata?.groundingChunks ?? []

  if (chunks.length === 0) {
    return { candidates: [], empty: true }
  }

  // Parse the free text into rough "person entries" — one per paragraph or
  // bullet. We use this only as the name/description hint; the URL is
  // always the grounding chunk URL, never something the model typed.
  const personBlocks = freeText
    .split(/\n{2,}|(?:\n\s*[-•*]\s*)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10)

  // Grounding chunks are the authoritative source list. We walk them in
  // order and pair each with a free-text block when possible.
  const out: PreparationCandidate[] = []
  const seen = new Set<string>()
  const maxCandidates = 3

  for (let i = 0; i < chunks.length && out.length < maxCandidates; i++) {
    const chunk = chunks[i]
    const uri = chunk.web?.uri
    if (!uri) continue

    // Skip duplicate URLs (Gemini sometimes returns the same chunk twice).
    const urlKey = uri.split("#")[0]
    if (seen.has(urlKey)) continue
    seen.add(urlKey)

    // Pick the block whose content best matches the source. We default to
    // the i-th block; if the block is empty, fall back to chunk title.
    const block = personBlocks[i] || personBlocks[0] || ""
    const nameMatch = block.match(/^([^\n:,.()\-–—]{2,80})/)
    const name = (nameMatch?.[1] || chunk.web?.title || safeDomain(uri) || "مرشح").trim()
    const description =
      block
        .replace(nameMatch?.[0] ?? "", "")
        .replace(/^[\s:,.\-–—()]+/, "")
        .slice(0, 220)
        .trim() || (chunk.web?.title || safeDomain(uri) || "").slice(0, 220)

    const normKey = normalizeName(name)
    if (!normKey) continue
    if (out.some((c) => normalizeName(c.name) === normKey)) continue

    out.push({
      id: `gem_${i}`,
      name,
      description: description || "لا يوجد وصف متاح",
      source_provider: "gemini_web",
      source_url: uri,
      source_title: chunk.web?.title || safeDomain(uri) || uri,
    })
  }

  return { candidates: out, empty: out.length === 0 }
}

// ─── YouTube candidate extraction ────────────────────────────────────────────

interface YTChannelSearchItem {
  id: { channelId?: string }
  snippet: {
    title: string
    description: string
    thumbnails?: { default?: { url?: string }; medium?: { url?: string } }
  }
}

/**
 * Search YouTube for channels matching the guest name. We prefer channel
 * results over videos because a channel is a person's identity anchor.
 */
async function youtubeCandidates(
  input: IdentifyInput,
): Promise<{ candidates: PreparationCandidate[]; error?: string }> {
  const key = env.YOUTUBE_API_KEY2 || env.YOUTUBE_API_KEY
  if (!key) return { candidates: [], error: "YOUTUBE_API_KEY is not configured" }

  const url = new URL("https://www.googleapis.com/youtube/v3/search")
  url.searchParams.set("part", "snippet")
  url.searchParams.set("q", `${input.guest_name} ${input.guest_description}`.trim())
  url.searchParams.set("type", "channel")
  url.searchParams.set("maxResults", "5")
  url.searchParams.set("key", key)

  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) {
      return { candidates: [], error: `YouTube search ${res.status}` }
    }
    const data = (await res.json()) as { items?: YTChannelSearchItem[] }
    const items = data.items ?? []

    const out: PreparationCandidate[] = []
    const seen = new Set<string>()

    for (const it of items) {
      const channelId = it.id.channelId
      if (!channelId) continue
      const name = it.snippet.title?.trim()
      if (!name) continue
      const key = normalizeName(name)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: `yt_${channelId}`,
        name,
        description: (it.snippet.description || "قناة يوتيوب").slice(0, 220),
        source_provider: "youtube",
        source_url: `https://www.youtube.com/channel/${channelId}`,
        source_title: name,
        avatar_url:
          it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url,
      })
      if (out.length >= 3) break
    }

    return { candidates: out }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { candidates: [], error: message }
  }
}

// ─── Main entry ──────────────────────────────────────────────────────────────

/**
 * Find 2–3 candidate people for a guest input. Returns an empty candidate
 * list when nothing is found — the caller (route handler) is responsible
 * for translating that into a user-facing error.
 */
export async function identifyGuestCandidates(
  input: IdentifyInput,
): Promise<IdentifyResult> {
  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_API_KEY is not configured")
  }

  const [gemini, youtube] = await Promise.all([
    geminiCandidates(input).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Gemini identify failed: ${message}`)
    }),
    youtubeCandidates(input),
  ])

  // Merge: Gemini candidates first (richer description), then YouTube
  // channels only if we still need more. Dedupe by normalized name across
  // providers — a person's YouTube channel often shares the name with the
  // Gemini result, and we don't want duplicates.
  const merged: PreparationCandidate[] = []
  const seen = new Set<string>()

  // Pinned candidate from explicit profile link — ranks first.
  // We do NOT fetch the URL (see SSRF note above). The display label is
  // the URL's domain, which is safe to compute from the string alone.
  if (input.guest_profile_link) {
    const url = input.guest_profile_link.trim()
    if (/^https?:\/\//i.test(url)) {
      merged.push({
        id: "pinned_profile",
        name: input.guest_name,
        description: `${input.guest_description} — رابط مُقدَّم من الأدمن`,
        source_provider: "gemini_web",
        source_url: url,
        source_title: safeDomain(url) || url,
      })
      seen.add(normalizeName(input.guest_name))
    }
  }

  for (const c of gemini.candidates) {
    const key = normalizeName(c.name)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(c)
    if (merged.length >= 3) break
  }
  if (merged.length < 3) {
    for (const c of youtube.candidates) {
      const key = normalizeName(c.name)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(c)
      if (merged.length >= 3) break
    }
  }

  return {
    candidates: merged,
    gemini_empty: gemini.empty,
    youtube_error: youtube.error,
  }
}
