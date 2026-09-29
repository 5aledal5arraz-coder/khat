/**
 * D5 — X (Twitter) as a real discovery SOURCE: list-graph harvest.
 *
 * The method measured on 2026-08-07 (memory: x-api-and-guest-discovery):
 * keyword search qualified 8.4% of accounts; curated LIST members qualified
 * 32%, and ranking by list density (listed_count / followers) — never by
 * follower count — surfaced the right people. So:
 *
 *   seed lists relevant to the topic (keyword tags; none → X skipped, 0 calls)
 *     → one page of members each
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
import { guestPolicyHits } from "@/lib/khat-map/core/policy"
import { foldVerbatim } from "@/lib/studio/verbatim"
import { isGeoWord } from "../story-evidence"
import type { ProposedName, V2Geography, WitnessProfile } from "../types"

export interface XSeedList {
  id: string
  label: string
  /**
   * What the list's members can witness — folded Arabic stems, drawn from the
   * constitution fields the list serves (lib/khat-map/core/constitution.ts).
   * A list is read only when a topic word starts with one of them
   * (`xListsForTopic`). Empty = never read.
   */
  keywords: string[]
}

/**
 * Lived-experience hubs from the 2026-08-07 harvest (lists.json in
 * ~/Desktop/khat-backups/x-harvest-20260807): education, writing, volunteers,
 * researchers, business/SME, "interesting Kuwaitis". Politics / geopolitics
 * lists from that harvest are deliberately NOT here. Family-counselling and
 * heritage hubs are still missing — add them via DISCOVERY_X_SEED_LISTS as
 * comma-separated `id:kw|kw|kw` entries (see xSeedLists) without a code change.
 */
// Topic keywords per list (2026-09-29, batch 3 D3): lists used to be
// shuffled at random, so a prison topic read «بورصة الكويت». Folded words /
// stems of 3+ letters, matched whole or with a grammatical suffix only
// (`keywordMatches`) — «علم» never matches «علمتني», «حرف» never «حرفيا».
const KW_EDUCATION = ["تعليم", "تعلم", "معلم", "مدرس", "مدرسه", "مدارس", "طالب", "طلاب", "تربي", "ابناء", "اطفال", "مراهق", "جيل", "اجيال", "جامع"]
const KW_WRITING = ["كتابه", "كاتب", "كتاب", "ادب", "روايه", "شعر", "شاعر", "قصه", "قصص", "مولف", "نشر"]

export const DEFAULT_X_SEED_LISTS: readonly XSeedList[] = [
  // memory_heritage — oral history, old crafts, sea, desert, customs
  { id: "1439565236760100868", label: "interesting kuwaitis", keywords: ["تراث", "ذاكره", "تاريخ", "شفهي", "حرف", "غوص", "بحر", "بحار", "نوخذه", "باديه", "عادات", "تقاليد", "سفر"] },
  // identity_society.education + family.raising_children / adolescence / generation_gap
  { id: "1024397812493111296", label: "Education", keywords: KW_EDUCATION },
  { id: "1291170743200428037", label: "المعلم و المعلمة الكويت", keywords: KW_EDUCATION },
  { id: "831970277055684611", label: "تعليم 1", keywords: KW_EDUCATION },
  // creativity_achievement.writing_literature
  { id: "79676332", label: "أدب و كتابة", keywords: KW_WRITING },
  { id: "55815415", label: "كتّاب", keywords: KW_WRITING },
  // identity_society.volunteering_charity
  { id: "1573702792656683017", label: "Volunteers -individuals-", keywords: ["تطوع", "متطوع", "خيري", "خير", "اغاثه", "عطاء", "مبادره"] },
  // creativity_achievement.invention_applied_science
  { id: "1307913659142864898", label: "Kwt Researchers", keywords: ["بحث", "باحث", "ابحاث", "علم", "علوم", "علمي", "اختراع", "مخترع", "دكتوراه", "مختبر"] },
  // work_money — saving/investing, entrepreneurship, business failure, debt
  { id: "1273809240839389184", label: "بورصة الكويت", keywords: ["بورصه", "اسهم", "استثمار", "مستثمر", "تداول", "ادخار", "ثروه", "افلاس", "ديون", "خساره", "تجاره", "تاجر", "ريادي", "رياده", "مشروع", "شركات"] },
]

/** Lists read per run (the most topic-relevant seeds). Each read is ONE X call. */
export const X_MAX_LISTS_PER_RUN = 3
/** Members per list read (one page). */
export const X_MEMBERS_PER_LIST = 100
/** Names X may add to one run. */
export const X_MAX_NAMES = 4

/**
 * DISCOVERY_X_SEED_LISTS overrides the seeds: comma-separated `id:kw|kw|kw`
 * (keywords folded Arabic stems). An id without keywords is never read — a
 * list nobody said is relevant to anything is exactly the random read D3 fixed.
 */
export function xSeedLists(): XSeedList[] {
  const raw = (process.env.DISCOVERY_X_SEED_LISTS ?? "").trim()
  if (!raw) return DEFAULT_X_SEED_LISTS.map((l) => ({ ...l }))
  return raw
    .split(",")
    .map((s) => s.trim())
    .map((s) => {
      const [id, kws = ""] = s.split(":")
      return { id: id.trim(), label: `list ${id.trim()}`, keywords: kws.split("|").map((k) => foldVerbatim(k)).filter((k) => k.length >= 3) }
    })
    .filter((l) => /^\d+$/.test(l.id))
}

/** Suffixes a keyword may carry and still be the same word («معلم» → «معلمين», «تربي» → «تربيه»). */
const KW_SUFFIXES = ["", "ه", "ي", "يه", "ات", "ون", "ين", "ان", "ها", "هم"]

/** A topic term is a keyword, or the keyword plus a grammatical suffix. Pure. */
export function keywordMatches(term: string, keyword: string): boolean {
  return keyword.length >= 3 && term.startsWith(keyword) && KW_SUFFIXES.includes(term.slice(keyword.length))
}

/**
 * The seed lists worth reading for this topic, most relevant first: a list
 * counts when a topic term (topic + witness search terms, geo words out)
 * starts with one of its keywords. None → X is skipped this run (0 calls).
 * Pure.
 */
export function xListsForTopic(seeds: readonly XSeedList[], terms: string[]): XSeedList[] {
  const scored = seeds
    .map((l, i) => ({
      l,
      i,
      hits: terms.filter((t) => l.keywords.some((k) => keywordMatches(t, k))).length,
    }))
    .filter((x) => x.hits > 0)
  scored.sort((a, b) => b.hits - a.hits || a.i - b.i)
  return scored.map((x) => x.l)
}

// Accounts that are not a person. WHOLE name tokens only (QA 2026-09-28: a
// substring test dropped القناعي «قنا», الجامع «جامع», المجلي «مجل», العلي,
// الشركاوي, المركزي — 6 of 7 real names), plus a bio that says it is an
// official account.
// 2026-09-29 (D3): «Al-Waseet Financial Business Co.» passed — "Co." kept
// its dot, and «الوسيط / للتداول / financial / business» were not here.
// foldVerbatim folds «مؤسسة» to «موسسه» (ؤ → و), so both spellings are listed.
const ORG_NAME_TOKENS = new Set([
  "شركه", "جريده", "مجله", "وزاره", "جامعه", "قناه", "مركز", "اخبار", "مؤسسه", "موسسه",
  "جمعيه", "نادي", "مكتب", "وسيط", "للتداول", "تداول", "للاستثمار", "للوساطه",
  "company", "news", "official", "bank", "group", "magazine", "center", "centre",
  "university", "ministry", "ltd", "inc", "co", "corp", "llc", "llp", "plc",
  "holding", "financial", "business", "trading", "brokerage",
])
// A bio that is a storefront: official account, a company/establishment
// opening, contact numbers, WhatsApp. Folded + raw both tested.
const ORG_BIO =
  /(الحساب الرسمي|حساب رسمي|official account|official page|واتساب|واتس اب|whatsapp|هاتف|للتواصل والطلبات|^\s*(?:شركه|شركة|مؤسسه|موسسه|مؤسسة)\s)/i
// A phone number: 7+ CONTIGUOUS digits, or an international +/00 prefix
// (spaces/dashes allowed after it). Arabic-Indic digits too. A year range
// («1985 - 2015», «خريج 2008 2012») is neither.
const PHONE = /(?:^|[^\d٠-٩])(?:(?:\+|00)[\d٠-٩][\d٠-٩\s-]{5,}[\d٠-٩]|[\d٠-٩]{7,})/

function looksLikeOrg(name: string, bio: string): boolean {
  const toks = `${foldVerbatim(name)} ${name.toLowerCase().replace(/[.,]/g, " ")}`
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => (t.length > 4 && t.startsWith("ال") ? t.slice(2) : t))
  return (
    toks.some((t) => ORG_NAME_TOKENS.has(t)) ||
    ORG_BIO.test(bio) ||
    ORG_BIO.test(foldVerbatim(bio)) ||
    PHONE.test(bio)
  )
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
    // A place is not a topic: «الكويت» from a witness profile matched every
    // Kuwaiti bio («حب الكويت يجمعنا» on a prison topic, 2026-09-29).
    .filter((t) => !isGeoWord(t))
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
    if (guestPolicyHits(`${name} ${bio}`).length > 0) return false
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
  /** Set when X was not read at all: "no_relevant_list" — no seed list touches the topic. */
  skipped: string | null
  /** calls × X_EST_USD_PER_CALL when that env is set; null = price not configured. */
  est_cost_usd: number | null
}

export async function harvestXListNames(opts: {
  topic: string
  profiles: WitnessProfile[]
  geography: V2Geography[]
  exclude: (name: string) => boolean
}): Promise<XHarvestResult> {
  const out: XHarvestResult = { names: [], calls: 0, users_read: 0, degraded: null, skipped: null, est_cost_usd: null }
  if (!isXConfigured()) return out
  const terms = topicTerms(opts.topic, opts.profiles)
  // Only lists whose members could have lived THIS topic; none → no call.
  const seeds = xListsForTopic(xSeedLists(), terms)
  if (seeds.length === 0) {
    out.skipped = "no_relevant_list"
    console.info("[discovery-v2/x] no seed list is relevant to this topic — X skipped (0 calls)")
    return out
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
  out.names = selectXCandidates(members, terms, opts.geography, opts.exclude)
  console.info(
    `[discovery-v2/x] ${out.calls} call(s), ${out.users_read} users read, ${out.names.length} kept` +
      (out.est_cost_usd != null ? `, ≈$${out.est_cost_usd}` : ""),
  )
  return out
}
