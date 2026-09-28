/**
 * D5 — X (Twitter) as a real discovery SOURCE: list-graph harvest.
 *
 * The method measured on 2026-08-07 (memory: x-api-and-guest-discovery):
 * keyword search qualified 8.4% of accounts; curated LIST members qualified
 * 32%, and ranking by list density (listed_count / followers) — never by
 * follower count — surfaced the right people. So:
 *
 *   seed lists (lived-experience hubs) → one page of members each
 *     → keep individuals only (not organisations), Kuwait signal in bio /
 *       location, a bio that touches the topic, politics filtered OUT
 *       (policy lexicon + political titles)
 *     → rank by list density → at most X_MAX_NAMES proposals
 *
 * A bio proves nothing about a lived story — these names go through the same
 * story check as everyone else. Per-run caps keep spend bounded; a 402
 * (wallet empty) or 429 (rate limit) stops further calls this run and the
 * run continues without X. Key-gated on X_BEARER_TOKEN; never throws.
 */

import { getListMembers, isXConfigured, type XListMember } from "@/lib/x/client"
import { lexiconPolicyHits } from "@/lib/khat-map/core/policy"
import { foldVerbatim } from "@/lib/studio/verbatim"
import type { ProposedName, V2Geography, WitnessProfile } from "../types"

export interface XSeedList {
  id: string
  label: string
}

/**
 * Lived-experience hubs from the 2026-08-07 harvest (lists.json in
 * ~/Desktop/khat-backups/x-harvest-20260807): education, writing, volunteers,
 * researchers, business/SME, "interesting Kuwaitis". Politics / geopolitics
 * lists from that harvest are deliberately NOT here. Family-counselling and
 * heritage hubs are still missing — add their list ids via
 * DISCOVERY_X_SEED_LISTS (comma-separated ids) without a code change.
 */
export const DEFAULT_X_SEED_LISTS: readonly XSeedList[] = [
  { id: "1439565236760100868", label: "interesting kuwaitis" },
  { id: "1024397812493111296", label: "Education" },
  { id: "1291170743200428037", label: "المعلم و المعلمة الكويت" },
  { id: "831970277055684611", label: "تعليم 1" },
  { id: "79676332", label: "أدب و كتابة" },
  { id: "55815415", label: "كتّاب" },
  { id: "1573702792656683017", label: "Volunteers -individuals-" },
  { id: "1307913659142864898", label: "Kwt Researchers" },
  { id: "1273809240839389184", label: "بورصة الكويت" },
]

/** Lists read per run (sampled from the seeds). Each read is ONE X call. */
export const X_MAX_LISTS_PER_RUN = 3
/** Members per list read (one page). */
export const X_MEMBERS_PER_LIST = 100
/** Names X may add to one run. */
export const X_MAX_NAMES = 4

export function xSeedLists(): XSeedList[] {
  const raw = (process.env.DISCOVERY_X_SEED_LISTS ?? "").trim()
  if (!raw) return [...DEFAULT_X_SEED_LISTS]
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map((id) => ({ id, label: `list ${id}` }))
}

// Accounts that are not a person. WHOLE name tokens only (QA 2026-09-28: a
// substring test dropped القناعي «قنا», الجامع «جامع», المجلي «مجل», العلي,
// الشركاوي, المركزي — 6 of 7 real names), plus a bio that says it is an
// official account.
const ORG_NAME_TOKENS = new Set([
  "شركه", "جريده", "مجله", "وزاره", "جامعه", "قناه", "مركز", "اخبار", "مؤسسه",
  "جمعيه", "نادي", "مكتب", "company", "news", "official", "bank", "group",
  "magazine", "center", "centre", "university", "ministry", "ltd", "inc",
])
const ORG_BIO = /(الحساب الرسمي|حساب رسمي|official account|official page)/i

function looksLikeOrg(name: string, bio: string): boolean {
  const toks = `${foldVerbatim(name)} ${name.toLowerCase()}`
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => (t.length > 4 && t.startsWith("ال") ? t.slice(2) : t))
  return toks.some((t) => ORG_NAME_TOKENS.has(t)) || ORG_BIO.test(bio) || ORG_BIO.test(foldVerbatim(bio))
}
// Folded forms. Bare «نائب» is NOT here — «نائب المدير» is a corporate bio.
const POLITICAL_TITLES = /(عضو مجلس الامه|نايب سابق|نايب في مجلس|مرشح|وزير|سفير|ناشط سياسي|\bmp\b|minister|ambassador|candidate)/i

/** Folded topic words (≥ 3 letters, stopwords out) from the topic + witness search terms. */
export function topicTerms(topic: string, profiles: WitnessProfile[] = []): string[] {
  const STOP = new Set(["في", "من", "على", "الى", "عن", "مع", "بين", "بعد", "قبل", "كيف", "لماذا", "حين", "التي", "الذي", "هذا", "هذه"])
  const words = [topic, ...profiles.flatMap((p) => p.search_terms)]
    .flatMap((t) => foldVerbatim(t).split(" "))
    // «والأبناء» → «الأبناء» → «أبناء». Only و+ال: a bare و may be the word
    // itself («الوحدة» → «وحدة»).
    .map((t) => (t.length > 4 && t.startsWith("وال") ? t.slice(1) : t))
    .map((t) => (t.length > 4 && t.startsWith("ال") ? t.slice(2) : t))
    .filter((t) => t.length >= 3 && !STOP.has(t))
  return [...new Set(words)]
}

/**
 * Keep members worth a story check, best first. Pure (unit-tested).
 */
export function selectXCandidates(
  members: Array<XListMember & { via: string }>,
  terms: string[],
  geo: V2Geography[],
  exclude: (name: string) => boolean,
  max = X_MAX_NAMES,
): ProposedName[] {
  const kuwaitOnly = geo.length === 1 && geo[0] === "kuwait"
  const seen = new Set<string>()
  const kept = members.filter((m) => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    const name = m.name.trim()
    const bio = (m.description ?? "").trim()
    // An individual: a two-word name without digits, and a real bio.
    if (/\d/.test(name) || foldVerbatim(name).split(" ").filter(Boolean).length < 2) return false
    if (bio.length < 20 || looksLikeOrg(name, bio)) return false
    const foldedBio = foldVerbatim(bio)
    if (POLITICAL_TITLES.test(foldedBio) || POLITICAL_TITLES.test(bio.toLowerCase())) return false
    if (lexiconPolicyHits(`${name} ${bio}`).length > 0) return false
    const place = foldVerbatim(`${bio} ${m.location ?? ""}`)
    if (kuwaitOnly && !/كويت|kuwait/.test(place)) return false
    const hay = ` ${foldedBio} `
    if (!terms.some((t) => hay.includes(` ${t}`) || hay.includes(` ال${t}`))) return false
    if (exclude(name)) return false
    return true
  })
  kept.sort((a, b) => b.listed_count / Math.max(b.followers, 50) - a.listed_count / Math.max(a.followers, 50))
  return kept.slice(0, max).map((m) => ({
    name: m.name.trim(),
    name_en: null,
    role: (m.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    country: null,
    why: `عضو قائمة X «${m.via}» ونبذته تمسّ الموضوع — لم تُفحص قصته بعد`,
    story_claim: null,
    story_type: null,
    gender: null,
    origin: "x_list" as const,
    public_account_ref: m.username ? `https://x.com/${m.username}` : null,
  }))
}

export interface XHarvestResult {
  names: ProposedName[]
  /** X API calls spent this run. */
  calls: number
  users_read: number
  /** Set when X refused (402 wallet empty / 429 rate limit) — the run went on without it. */
  degraded: string | null
  /** calls × X_EST_USD_PER_CALL when that env is set; null = price not configured. */
  est_cost_usd: number | null
}

export async function harvestXListNames(opts: {
  topic: string
  profiles: WitnessProfile[]
  geography: V2Geography[]
  exclude: (name: string) => boolean
  rng?: () => number
}): Promise<XHarvestResult> {
  const out: XHarvestResult = { names: [], calls: 0, users_read: 0, degraded: null, est_cost_usd: null }
  if (!isXConfigured()) return out
  const rng = opts.rng ?? Math.random
  const seeds = xSeedLists()
  for (let i = seeds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[seeds[i], seeds[j]] = [seeds[j], seeds[i]]
  }
  const members: Array<XListMember & { via: string }> = []
  for (const seed of seeds.slice(0, X_MAX_LISTS_PER_RUN)) {
    const page = await getListMembers(seed.id, X_MEMBERS_PER_LIST)
    out.calls++
    if (page.status === 402 || page.status === 429) {
      out.degraded = String(page.status)
      console.warn(`[discovery-v2/x] list ${seed.id} → HTTP ${page.status}; X skipped for the rest of this run`)
      break
    }
    out.users_read += page.members.length
    for (const m of page.members) members.push({ ...m, via: seed.label })
  }
  const price = Number(process.env.X_EST_USD_PER_CALL)
  out.est_cost_usd = Number.isFinite(price) && price > 0 ? Number((out.calls * price).toFixed(4)) : null
  out.names = selectXCandidates(members, topicTerms(opts.topic, opts.profiles), opts.geography, opts.exclude)
  console.info(
    `[discovery-v2/x] ${out.calls} call(s), ${out.users_read} users read, ${out.names.length} kept` +
      (out.est_cost_usd != null ? `, ≈$${out.est_cost_usd}` : ""),
  )
  return out
}
