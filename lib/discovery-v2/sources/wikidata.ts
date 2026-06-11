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

import type { V2Filters, WikiFacts } from "../types"

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
 * Resolve a proposed name to authoritative facts. Tries Arabic then
 * English search; picks the first candidate that is a human (P31=Q5).
 *
 * Latency shape: the independent network calls run concurrently —
 * (ar + en search) in parallel, then ONE batched entity fetch, then
 * (occupation/citizenship labels + Wikipedia summary) in parallel. This
 * is identical in results to the previous fully-serial version, just far
 * faster on the wall clock.
 */
export async function resolvePerson(
  name: string,
  filters?: V2Filters,
): Promise<WikiFacts> {
  const empty: WikiFacts = { resolved: false }
  if (!name || name.trim().length < 2) return empty

  // 1. Candidate QIDs — Arabic + English searches run in parallel
  //    (independent). Arabic results kept first (most guests are Arab
  //    figures), so the human-pick order below is unchanged.
  const [arQids, enQids] = await Promise.all([
    searchEntity(name, "ar"),
    searchEntity(name, "en"),
  ])
  const uniqQids = [...new Set([...arQids, ...enQids])].slice(0, 6)
  if (uniqQids.length === 0) return empty

  // 2. One batched fetch for all candidates, then pick the first confirmed
  //    human in search-rank order.
  const entities = await fetchEntities(uniqQids)
  const qid =
    uniqQids.find((id) =>
      claimValueIds(entities[id]?.claims ?? {}, "P31").includes("Q5"),
    ) ?? null
  if (!qid) return empty
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
