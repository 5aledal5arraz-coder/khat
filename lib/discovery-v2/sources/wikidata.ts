/* eslint-disable @typescript-eslint/no-explicit-any -- Wikidata/MediaWiki API
 * responses are deeply-nested, optional, untyped JSON (claims → mainsnak →
 * datavalue → value → …). Precise typing of the full entity shape isn't worth
 * the churn for a read-only external adapter that already guards every access. */
/**
 * Wikidata + Wikipedia resolver — the v2 truth anchor.
 *
 * Given a proposed name, finds the matching real human on Wikidata and
 * returns structured, authoritative facts (occupation, nationality,
 * gender, birth year, photo, official + social links, a notability
 * proxy), plus a Wikipedia summary. No API key. If the name does not
 * resolve to a real human, `resolved` is false and the caller drops it —
 * this is what makes v2 high-precision.
 *
 * Endpoints (all public, no key):
 *   - wbsearchentities  — name → candidate QIDs
 *   - Special:EntityData/<qid>.json — full entity (claims + sitelinks)
 *   - <lang>.wikipedia REST summary — extract + thumbnail
 */

import type { WikiFacts } from "../types"

/** Light context from the LLM proposal, used to disambiguate homonyms. */
export interface ResolveHint {
  role?: string | null
  country?: string | null
  name_en?: string | null
}

const UA =
  "KhatPodcast-GuestDiscovery/1.0 (https://khatpodcast.com; noreply@khatpodcast.com)"

async function getJson(url: string, timeoutMs = 9000): Promise<any | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
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

const GENDER_QID: Record<string, "male" | "female" | "other"> = {
  Q6581097: "male",
  Q6581072: "female",
}

function claimValueId(claims: any, prop: string): string | null {
  const arr = claims?.[prop]
  const id = arr?.[0]?.mainsnak?.datavalue?.value?.id
  return typeof id === "string" ? id : null
}
function claimValueIds(claims: any, prop: string): string[] {
  const arr = claims?.[prop] ?? []
  return arr
    .map((c: any) => c?.mainsnak?.datavalue?.value?.id)
    .filter((x: any): x is string => typeof x === "string")
}
function claimValueString(claims: any, prop: string): string | null {
  const arr = claims?.[prop]
  const v = arr?.[0]?.mainsnak?.datavalue?.value
  return typeof v === "string" ? v : null
}
function claimTimeYear(claims: any, prop: string): number | null {
  const t = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value?.time
  if (typeof t !== "string") return null
  const m = t.match(/([+-]\d{4})/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  return Number.isFinite(y) ? y : null
}

/** Resolve common referenced QIDs (occupations, citizenship) to labels. */
async function labelsFor(qids: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(qids)].slice(0, 25)
  if (ids.length === 0) return {}
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join(
    "|",
  )}&props=labels&languages=ar|en&format=json&origin=*`
  const j = await getJson(url)
  const out: Record<string, string> = {}
  const ents = j?.entities ?? {}
  for (const id of Object.keys(ents)) {
    const lab = ents[id]?.labels
    out[id] = lab?.ar?.value ?? lab?.en?.value ?? id
  }
  return out
}

async function searchEntity(
  name: string,
  lang: "ar" | "en",
): Promise<string[]> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
    name,
  )}&language=${lang}&uselang=${lang}&type=item&limit=5&format=json&origin=*`
  const j = await getJson(url)
  return (j?.search ?? [])
    .map((s: any) => s?.id)
    .filter((x: any): x is string => typeof x === "string")
}

async function wikipediaSummary(
  lang: "ar" | "en",
  title: string,
): Promise<{ extract?: string | null; thumb?: string | null } | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title,
  )}`
  const j = await getJson(url, 7000)
  if (!j) return null
  return {
    extract: typeof j.extract === "string" ? j.extract : null,
    thumb: j.thumbnail?.source ?? null,
  }
}

function commonsImage(file: string | null): string | null {
  if (!file) return null
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    file,
  )}?width=400`
}

/**
 * Fetch full entities (claims + sitelinks + labels + descriptions) for up
 * to 6 candidate QIDs in a SINGLE `wbgetentities` request, instead of one
 * `Special:EntityData/<qid>.json` round-trip per QID. This collapses what
 * used to be up to 6 serial network calls into one — the biggest single
 * latency win in the resolver — and is also politer to Wikidata (fewer
 * requests). Returns the `entities` map keyed by QID.
 */
async function fetchEntities(qids: string[]): Promise<Record<string, any>> {
  const ids = [...new Set(qids)].slice(0, 6)
  if (ids.length === 0) return {}
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join(
    "|",
  )}&props=claims|sitelinks|labels|descriptions&languages=ar|en&format=json&origin=*`
  const j = await getJson(url)
  return j?.entities ?? {}
}

/**
 * Resolve a Wikipedia summary, preferring Arabic and falling back to
 * English. Extracted so it can run concurrently with `labelsFor` in
 * `resolvePerson` — the two are independent.
 */
async function resolveSummary(
  arTitle: string | null,
  enTitle: string | null,
): Promise<{ summary: string | null; thumb: string | null }> {
  let summary: string | null = null
  let thumb: string | null = null
  if (arTitle) {
    const s = await wikipediaSummary("ar", arTitle)
    summary = s?.extract ?? null
    thumb = s?.thumb ?? null
  }
  if (!summary && enTitle) {
    const s = await wikipediaSummary("en", enTitle)
    summary = s?.extract ?? null
    thumb = thumb ?? s?.thumb ?? null
  }
  return { summary, thumb }
}

/**
 * Disambiguation — score one candidate entity against the proposal hint.
 *
 * Homonyms are the #1 wrong-person failure: common Arabic names resolve
 * to several humans and the old "first human wins" rule anchored every
 * downstream fact (gender, nationality, death year) to a stranger.
 * Instead, every human candidate is scored on how well its Wikidata
 * description/occupations/citizenship match what the LLM proposed.
 */
function scoreEntityAgainstHint(
  ent: any,
  hint: ResolveHint | undefined,
  searchRank: number,
): number {
  let score = 0

  // Notability prior + search-rank prior (earlier hits are likelier).
  const sitelinkCount = Object.keys(ent?.sitelinks ?? {}).length
  score += Math.min(2, Math.log10(1 + sitelinkCount))
  score += Math.max(0, 1 - searchRank * 0.2)
  // Arabic Wikipedia presence matters for an Arabic-language podcast.
  if (ent?.sitelinks?.arwiki) score += 0.5

  if (!hint) return score

  const descr = [
    ent?.descriptions?.ar?.value ?? "",
    ent?.descriptions?.en?.value ?? "",
  ]
    .join(" ")
    .toLowerCase()

  // Role tokens vs description (occupation labels arrive later; the
  // description usually carries the profession in both languages).
  if (hint.role) {
    const toks = hint.role
      .toLowerCase()
      .replace(/[.,؛،"'()\-_/]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3)
    const hits = toks.filter((t) => descr.includes(t)).length
    if (toks.length > 0) score += (hits / toks.length) * 2
  }

  // Country vs citizenship QID labels — we can't resolve labels here
  // without an extra round-trip, so match against description text,
  // which commonly embeds nationality ("كاتب كويتي", "Egyptian writer").
  if (hint.country) {
    const c = hint.country.toLowerCase()
    if (c && descr.includes(c)) score += 1.5
  }

  return score
}

/**
 * Resolve a proposed name to authoritative facts. Tries Arabic then
 * English search; scores every confirmed human (P31=Q5) against the
 * proposal hint and picks the best match. When the top two humans score
 * within 0.75 of each other the identity is flagged uncertain so scoring
 * can cap the candidate at shortlist instead of trusting a guess.
 *
 * Latency shape: the independent network calls run concurrently —
 * (ar + en search) in parallel, then ONE batched entity fetch, then
 * (occupation/citizenship labels + Wikipedia summary) in parallel.
 */
export async function resolvePerson(
  name: string,
  hint?: ResolveHint,
): Promise<WikiFacts> {
  const empty: WikiFacts = { resolved: false }
  if (!name || name.trim().length < 2) return empty

  // 1. Candidate QIDs — Arabic + English searches run in parallel
  //    (independent). Arabic results kept first (most guests are Arab
  //    figures).
  const [arQids, enQids] = await Promise.all([
    searchEntity(name, "ar"),
    searchEntity(name, "en"),
  ])
  const uniqQids = [...new Set([...arQids, ...enQids])].slice(0, 6)
  if (uniqQids.length === 0) return empty

  // 2. One batched fetch for all candidates, then disambiguate among the
  //    confirmed humans.
  const entities = await fetchEntities(uniqQids)
  const humans = uniqQids.filter((id) =>
    claimValueIds(entities[id]?.claims ?? {}, "P31").includes("Q5"),
  )
  if (humans.length === 0) return empty

  let qid = humans[0]
  let identityUncertain = false
  if (humans.length > 1) {
    const ranked = humans
      .map((id) => ({
        id,
        s: scoreEntityAgainstHint(entities[id], hint, uniqQids.indexOf(id)),
      }))
      .sort((a, b) => b.s - a.s)
    qid = ranked[0].id
    identityUncertain = ranked[0].s - ranked[1].s < 0.75
  }
  const ent = entities[qid]

  const claims = ent.claims ?? {}
  const occQids = claimValueIds(claims, "P106")
  const citQids = claimValueIds(claims, "P27")

  const genderQid = claimValueId(claims, "P21")
  const gender = genderQid ? (GENDER_QID[genderQid] ?? null) : null
  const birth = claimTimeYear(claims, "P569")
  const death = claimTimeYear(claims, "P570")
  const imageFile = claimValueString(claims, "P18")
  const official = claimValueString(claims, "P856")
  const xUser = claimValueString(claims, "P2002")
  const ig = claimValueString(claims, "P2003")
  const ytChannel = claimValueString(claims, "P2397")
  const linkedin = claimValueString(claims, "P6634")

  const sitelinks = ent.sitelinks ?? {}
  const sitelinkCount = Object.keys(sitelinks).length
  const arTitle = sitelinks?.arwiki?.title ?? null
  const enTitle = sitelinks?.enwiki?.title ?? null

  const labelAr = ent.labels?.ar?.value ?? null
  const labelEn = ent.labels?.en?.value ?? null
  const descr =
    ent.descriptions?.ar?.value ?? ent.descriptions?.en?.value ?? null

  // 3. Labels (occupation/citizenship) + Wikipedia summary run
  //    concurrently — neither depends on the other.
  const [labelMap, { summary, thumb }] = await Promise.all([
    labelsFor([...occQids, ...citQids]),
    resolveSummary(arTitle, enTitle),
  ])

  const citizenship = citQids.length ? labelMap[citQids[0]] ?? null : null

  return {
    resolved: true,
    qid,
    label: labelEn ?? labelAr ?? name,
    label_ar: labelAr,
    description: descr,
    is_human: true,
    occupations: occQids.map((q) => labelMap[q]).filter(Boolean) as string[],
    gender,
    nationality_country: citizenship,
    birth_year: birth,
    death_year: death,
    image_url: commonsImage(imageFile) ?? thumb ?? null,
    wikipedia_url: enTitle
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(enTitle)}`
      : null,
    wikipedia_ar_url: arTitle
      ? `https://ar.wikipedia.org/wiki/${encodeURIComponent(arTitle)}`
      : null,
    official_website: official,
    sitelink_count: sitelinkCount,
    identity_uncertain: identityUncertain,
    social: {
      x: xUser ? `https://x.com/${xUser}` : null,
      instagram: ig ? `https://instagram.com/${ig}` : null,
      youtube_channel: ytChannel
        ? `https://youtube.com/channel/${ytChannel}`
        : null,
      linkedin: linkedin ? `https://www.linkedin.com/in/${linkedin}` : null,
    },
    summary: summary ?? descr,
  }
}
