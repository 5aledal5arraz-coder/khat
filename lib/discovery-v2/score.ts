/**
 * v2 step 3 — score a resolved + enriched candidate on independent
 * real-world signals, and decide accept / shortlist / reject.
 *
 * Hard rejects (correctness, not just low score):
 *   - not resolved on Wikidata  → not a verifiable real person
 *   - deceased (death year set)  → cannot be booked as a guest
 *   - attribute contradiction    → fails the strict gender/nationality filter
 */

import type {
  EnrichmentSignals,
  V2Candidate,
  V2Filters,
  V2Scores,
  WikiFacts,
  ProposedName,
} from "./types"

const clamp = (v: number) => Math.max(0, Math.min(1, v))

function notabilityScore(w: WikiFacts, s: EnrichmentSignals): number {
  const sl = w.sitelink_count ?? 0
  let n =
    sl >= 25 ? 1.0 : sl >= 10 ? 0.85 : sl >= 6 ? 0.7 : sl >= 3 ? 0.55 : sl >= 1 ? 0.35 : 0.1
  if ((s.scholar?.cited_by ?? 0) >= 5000) n += 0.15
  else if ((s.scholar?.cited_by ?? 0) >= 500) n += 0.08
  if ((s.books?.count ?? 0) >= 1) n += 0.08
  if (w.official_website) n += 0.05
  return clamp(n)
}

function topicFitScore(topic: string, w: WikiFacts, proposed: ProposedName): number {
  // The LLM proposed them FOR this topic → solid prior.
  let f = 0.62
  const hay = `${(w.occupations ?? []).join(" ")} ${w.description ?? ""} ${w.summary ?? ""} ${proposed.role ?? ""}`.toLowerCase()
  const toks = topic.toLowerCase().replace(/[.,؛،"'()\-_/]/g, " ").split(/\s+/).filter((t) => t.length >= 3)
  if (toks.length) {
    const hits = toks.filter((t) => hay.includes(t)).length
    f += Math.min(0.38, (hits / toks.length) * 0.5)
  }
  return clamp(f)
}

function guestabilityScore(w: WikiFacts, s: EnrichmentSignals): number {
  let g = 0.1
  const app = s.podcast?.appearances ?? 0
  if (app >= 3) g += 0.55
  else if (app >= 1) g += 0.35
  if (s.youtube?.talk_url) g += 0.2
  if (s.youtube?.channel_url || w.social?.youtube_channel) g += 0.15
  if (w.official_website) g += 0.1
  if (w.social?.x || w.social?.instagram) g += 0.1
  return clamp(g)
}

function recencyScore(s: EnrichmentSignals): number {
  const m = s.news?.recent_mentions ?? 0
  return m >= 6 ? 1.0 : m >= 3 ? 0.7 : m >= 1 ? 0.5 : 0.2
}

function filterMatch(
  w: WikiFacts,
  f: V2Filters,
): { score: number; contradiction: boolean; reason: string | null } {
  // Strict-on-unknown: when the operator sets a filter, a candidate whose
  // attribute can't be verified is dropped, not passed through softly.
  const isKuwaiti = w.nationality_country
    ? /kuwait|الكويت/i.test(w.nationality_country)
    : null
  if (f.gender) {
    if (!w.gender || w.gender === "other") {
      return { score: 0, contradiction: true, reason: "تعذّر التحقّق من جنس الضيف — الفلتر صارم" }
    }
    if (w.gender !== f.gender) {
      return { score: 0, contradiction: true, reason: "يخالف فلتر الجنس المطلوب" }
    }
  }
  if (f.nationality) {
    if (isKuwaiti === null) {
      return { score: 0, contradiction: true, reason: "تعذّر التحقّق من الجنسية — الفلتر صارم" }
    }
    if (f.nationality === "kuwaiti" && !isKuwaiti) {
      return { score: 0, contradiction: true, reason: "ليس كويتياً والفلتر يطلب كويتيين فقط" }
    }
    if (f.nationality === "non_kuwaiti" && isKuwaiti) {
      return { score: 0, contradiction: true, reason: "كويتي والفلتر يطلب غير الكويتيين" }
    }
  }
  return { score: 1, contradiction: false, reason: null }
}

export function scoreCandidate(
  proposed: ProposedName,
  wiki: WikiFacts,
  signals: EnrichmentSignals,
  input: { topic: string; filters?: V2Filters; taste?: "famous" | "balanced" | "hidden_gems" },
): V2Candidate {
  const filters = input.filters ?? {}
  const reasons: string[] = []

  const notability = notabilityScore(wiki, signals)
  const topic_fit = topicFitScore(input.topic, wiki, proposed)
  const guestability = guestabilityScore(wiki, signals)
  const recency = recencyScore(signals)
  const fm = filterMatch(wiki, filters)

  // Taste re-weights notability vs depth.
  const wNot = input.taste === "famous" ? 0.34 : input.taste === "hidden_gems" ? 0.14 : 0.24
  const wFit = 0.26
  const wGuest = 0.3
  const wRec = 0.1
  const wFilter = 1 - (wNot + wFit + wGuest + wRec) // remainder

  const overall = clamp(
    notability * wNot +
      topic_fit * wFit +
      guestability * wGuest +
      recency * wRec +
      fm.score * wFilter,
  )

  const scores: V2Scores = {
    notability,
    topic_fit,
    guestability,
    recency,
    filter_match: fm.score,
    overall,
  }

  // ── Decision ──
  let decision: V2Candidate["decision"]
  if (!wiki.resolved) {
    decision = "rejected"
    reasons.push("غير موجود في ويكيبيديا/ويكي‌داتا — تعذّر التحقّق")
  } else if (wiki.death_year) {
    decision = "rejected"
    reasons.push(`متوفّى (${wiki.death_year}) — غير قابل للاستضافة`)
  } else if (fm.contradiction) {
    decision = "rejected"
    reasons.push(fm.reason ?? "يخالف الفلاتر المطلوبة")
  } else if (overall >= 0.55) {
    decision = "accepted"
  } else if (overall >= 0.4) {
    decision = "shortlist"
  } else {
    decision = "rejected"
    reasons.push("إشارات ضعيفة (شهرة/قابلية استضافة/حضور حالي)")
  }

  // Homonym ambiguity: several humans share this name and disambiguation
  // wasn't decisive — never auto-accept a possibly-wrong person.
  if (decision === "accepted" && wiki.identity_uncertain) {
    decision = "shortlist"
    reasons.push("هوية غير مؤكّدة — أكثر من شخصية بنفس الاسم، تحتاج تأكيداً يدوياً")
  }

  if (decision !== "rejected") {
    if ((signals.podcast?.appearances ?? 0) > 0) reasons.push("ظهر ضيفاً في بودكاست سابقاً")
    if ((signals.scholar?.cited_by ?? 0) >= 500) reasons.push("حضور أكاديمي قويّ")
    if ((signals.news?.recent_mentions ?? 0) >= 3) reasons.push("حضور إعلامي حديث")
    if ((wiki.sitelink_count ?? 0) >= 6) reasons.push("شخصية بارزة موثّقة")
  }

  return {
    name: wiki.label_ar ?? proposed.name,
    name_en: wiki.label ?? proposed.name_en ?? null,
    role: proposed.role ?? (wiki.occupations ?? [])[0] ?? null,
    country: wiki.nationality_country ?? proposed.country ?? null,
    why: proposed.why ?? wiki.summary ?? null,
    wiki,
    signals,
    scores,
    decision,
    reasons,
  }
}
