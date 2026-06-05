/**
 * Phase Beta — NetworkSource.
 *
 * The cheapest, highest-precision discovery channel: people that
 * confirmed guests have ALREADY mentioned by name in their evidence.
 *
 * When a candidate is promoted (or even when their LLM verification
 * runs), the evidence_summary captures notable_quotes / topics — and
 * those notable quotes often name OTHER humans the guest worked with,
 * was taught by, or refers to. Those names are:
 *
 *   - Near-certainly real people (the guest spoke about them)
 *   - Editorially adjacent (in the guest's intellectual orbit)
 *   - Cost-free to surface (no API call needed)
 *
 * NetworkSource scans existing promoted_guest_id rows in the same
 * season's discovery_runs, extracts names from notable_quotes +
 * evidence URLs, deduplicates against already-surfaced candidates,
 * and emits them as new SearchCandidates. The classifier then
 * decides; the verifier triangulates.
 *
 * No external network call; all data lives in our own DB.
 */

import type {
  DiscoveryArchetype,
  DiscoveryEvidenceUrl,
  DiscoveryEvidenceSummary,
} from "@/lib/db/schema/discovery"
import type {
  SearchResult,
  SearchCandidate,
  DiscoveryFilterContext,
} from "../search-agents"

export const NETWORK_SOURCE_VERSION = "beta-network-1" as const

// ─── Name extraction heuristics ──────────────────────────────────────
//
// We look for capitalised Latin name pairs ("Khalid Al-Rashidi") and
// Arabic name pairs (first + last). The hardest case is single names —
// we skip those because they generate too much noise.

const LATIN_NAME_PAIR = /\b([A-Z][a-zA-Z'\-]{1,15})\s+([A-Z][a-zA-Z'\-]{1,20})\b/g
const ARABIC_NAME_PAIR = /(?:^|\s)([؀-ۿ]{2,15})\s+(ال[؀-ۿ]{2,15}|[؀-ۿ]{2,15})(?=\s|$|[،؛.!؟])/g

// Common false positives we drop after extraction
const NAME_STOPLIST = new Set<string>([
  "the kuwait", "kuwait university", "al jazeera", "al arabiya",
  "al qabas", "al rai", "al watan", "kuwait times",
  "harvard university", "yale university", "oxford university",
  "new york", "los angeles", "saudi arabia", "united arab",
  "middle east", "north america", "south america",
  "الكويت تايمز", "القبس", "الراي", "الوطن",
  "كلية الآداب", "جامعة الكويت", "جامعة هارفارد",
  // RWA-B4 — Arabic noun-phrase pairs that ARE NOT names. The audit
  // surfaced these as candidates with ?@0.00 confidence; the
  // classifier dropped them correctly but they polluted recall and
  // wasted verify_candidate cycles. Block them at extraction time.
  "هذا الفيديو", "هذه الحلقة", "هذا البرنامج", "هذا الموسم",
  "المتحدث باسم", "الرسمي باسم", "الصالح المتحدث", "الضرر الذي",
  "الفيديو الذي", "اللذي بكى", "اللتي تحدث",
  "وزير الإعلام", "وزير الخارجية", "وزير الداخلية",
  "وزارة الإعلام", "وزارة الخارجية", "وزارة الداخلية",
  "ضيف الحلقة", "ضيفة الحلقة", "ضيوف الحلقة",
  "atv kuwait", "شخص ملهم", "في هذا",
])

// RWA-B4 — Arabic function words / determiners. If the FIRST token
// of a pair is one of these, the pair is almost certainly a noun
// phrase, not a name.
const ARABIC_FUNCTION_WORDS = new Set<string>([
  "هذا", "هذه", "ذلك", "تلك", "الذي", "التي", "اللذي", "اللتي",
  "في", "من", "إلى", "على", "عن", "مع", "بعد", "قبل",
  "ضيف", "ضيفة", "ضيوف", "حلقة", "حلقات", "موسم",
  "ال",
])

// RWA-B4 — small lexicon of common Arabic given-name PREFIXES. A
// pair is plausibly a name when EITHER token starts with one of
// these OR the second token starts with "ال" (Al-Family pattern).
const ARABIC_GIVEN_NAME_PREFIXES = [
  "أحمد", "محمد", "علي", "عبد", "حسن", "حسين", "خالد", "فهد",
  "سعد", "ناصر", "بدر", "مشاري", "سلطان", "يوسف", "إبراهيم",
  "صالح", "حمد", "جابر", "خليفة", "ياسر", "ماجد",
  "فاطمة", "عائشة", "نورة", "هيا", "ريم", "هند", "سارة", "خديجة",
  "مريم", "زينب", "أسماء", "هدى", "نادية",
]

function isLikelyArabicName(tokenA: string, tokenB: string): boolean {
  if (ARABIC_FUNCTION_WORDS.has(tokenA)) return false
  if (ARABIC_FUNCTION_WORDS.has(tokenB)) return false
  // Strong: first token is a known given name
  if (ARABIC_GIVEN_NAME_PREFIXES.some((p) => tokenA.startsWith(p))) return true
  // Strong: second token is an "Al-Family" form
  if (tokenB.startsWith("ال") && tokenB.length >= 5) return true
  // Weak: both tokens are 3+ chars, no function words — accept but
  // the classifier will sort it out
  return tokenA.length >= 3 && tokenB.length >= 3
}

export function extractNamesFromText(text: string, max: number = 8): string[] {
  if (!text) return []
  const found = new Set<string>()
  let m: RegExpExecArray | null
  // Latin pairs
  LATIN_NAME_PAIR.lastIndex = 0
  while ((m = LATIN_NAME_PAIR.exec(text)) !== null) {
    if (found.size >= max) break
    const full = `${m[1]} ${m[2]}`
    if (NAME_STOPLIST.has(full.toLowerCase())) continue
    // Skip if both tokens are common English words
    if (isCommonEnglishWord(m[1]) && isCommonEnglishWord(m[2])) continue
    found.add(full)
  }
  // Arabic pairs — tightened
  ARABIC_NAME_PAIR.lastIndex = 0
  while ((m = ARABIC_NAME_PAIR.exec(text)) !== null) {
    if (found.size >= max) break
    const a = m[1]
    const b = m[2]
    const full = `${a} ${b}`
    if (NAME_STOPLIST.has(full)) continue
    if (NAME_STOPLIST.has(full.toLowerCase())) continue
    if (!isLikelyArabicName(a, b)) continue
    found.add(full)
  }
  return [...found]
}

const COMMON_ENGLISH_WORDS = new Set<string>([
  "The", "And", "But", "With", "From", "Into", "About", "After",
  "Before", "Between", "During", "Through", "When", "Where", "Why",
  "How", "What", "Which", "Who", "Episode", "Season", "Show", "Channel",
  "Studio", "Network", "Foundation", "Institute", "Academy", "Center",
  "University", "College", "School", "Press", "Media", "News",
])
function isCommonEnglishWord(w: string): boolean {
  return COMMON_ENGLISH_WORDS.has(w)
}

// ─── Discovery surface ──────────────────────────────────────────────

export interface NetworkSourceInput {
  /**
   * Required — the season we're building the network from. NetworkSource
   * intentionally does NOT cross seasons; voice differs by season, so
   * we keep the network local.
   */
  seasonId: string
  archetype: DiscoveryArchetype
  maxResults: number
  filters?: DiscoveryFilterContext
  /**
   * Names we've already surfaced in this run / season. NetworkSource
   * skips these to avoid dup-promoting people that are already on the
   * operator's queue.
   */
  alreadySurfacedNames?: Set<string>
}

export interface NetworkSourceDeps {
  /**
   * Read recently-completed runs from the same season. The caller
   * supplies this seam so NetworkSource can be unit-tested without DB.
   */
  loadSeasonEvidence: (
    seasonId: string,
  ) => Promise<
    Array<{
      candidate_id: string
      proposed_name: string | null
      evidence_summary: DiscoveryEvidenceSummary | null
      evidence_urls: DiscoveryEvidenceUrl[]
    }>
  >
}

export async function runNetworkSource(
  input: NetworkSourceInput,
  deps: NetworkSourceDeps,
): Promise<SearchResult> {
  if (!input.seasonId) {
    return {
      source: "network",
      configured: false,
      note: "no seasonId — network source is season-scoped",
      candidates: [],
    }
  }

  let evidence: Awaited<ReturnType<NetworkSourceDeps["loadSeasonEvidence"]>>
  try {
    evidence = await deps.loadSeasonEvidence(input.seasonId)
  } catch (err) {
    return {
      source: "network",
      configured: true,
      note: `evidence load failed: ${err instanceof Error ? err.message : "unknown"}`,
      candidates: [],
    }
  }

  if (evidence.length === 0) {
    return {
      source: "network",
      configured: true,
      note: "no prior promoted candidates in this season",
      candidates: [],
    }
  }

  const alreadyNames = new Set<string>()
  for (const n of input.alreadySurfacedNames ?? []) {
    alreadyNames.add(n.toLowerCase())
  }
  for (const e of evidence) {
    if (e.proposed_name) alreadyNames.add(e.proposed_name.toLowerCase())
  }

  const candidates: SearchCandidate[] = []
  const seenInThisRun = new Set<string>()

  for (const source of evidence) {
    if (candidates.length >= input.maxResults) break
    // Mine notable_quotes and topics for names
    const haystacks: string[] = []
    for (const q of source.evidence_summary?.notable_quotes ?? []) {
      if (typeof q === "string") haystacks.push(q)
    }
    for (const t of source.evidence_summary?.topics ?? []) {
      if (typeof t === "string") haystacks.push(t)
    }
    // Also mine evidence URL titles + snippets — they often contain
    // co-host names ("with Khalid Al-Rashidi").
    for (const e of source.evidence_urls ?? []) {
      if (e.title) haystacks.push(e.title)
      if (e.snippet) haystacks.push(e.snippet)
    }

    for (const text of haystacks) {
      if (candidates.length >= input.maxResults) break
      const names = extractNamesFromText(text, 4)
      for (const name of names) {
        if (candidates.length >= input.maxResults) break
        const key = name.toLowerCase()
        if (seenInThisRun.has(key)) continue
        if (alreadyNames.has(key)) continue
        seenInThisRun.add(key)
        candidates.push({
          proposed_name: name,
          proposed_role: "network reference",
          proposed_country:
            input.filters?.nationality === "kuwaiti" ? "Kuwait" : null,
          evidence_urls: [
            {
              platform: "network",
              url: `/admin/discovery/candidates/${source.candidate_id}`,
              title: `Referenced by: ${source.proposed_name ?? "(prior candidate)"}`,
              snippet: text.slice(0, 280),
              fetched_at: new Date().toISOString(),
            },
          ],
          platform_signals: {
            network: {
              sub_source: "guest_of_guest",
              referenced_by_candidate_id: source.candidate_id,
              referenced_by_name: source.proposed_name,
            },
          },
        })
      }
    }
  }

  return {
    source: "network",
    configured: true,
    note:
      candidates.length === 0
        ? "no fresh names extracted from prior guests"
        : undefined,
    candidates,
  }
}
