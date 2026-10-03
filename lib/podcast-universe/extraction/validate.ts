/**
 * Deterministic validation of Luna's output (B6). Pure.
 *
 * No Luna result is persisted blindly (D6: "AI says X → DB marks X verified"
 * is forbidden). For every guest:
 *   • episode_id is one we sent;
 *   • evidence_text is an EXACT substring of that episode's title or
 *     description (the original metadata, not a normalized copy), starting
 *     and ending on word boundaries;
 *   • display_name appears within evidence_text as whole words.
 * Otherwise the guest is rejected and the reason logged.
 * nationality_claim.evidence_text and gender_evidence_text must also be exact
 * substrings; a claim that fails is DROPPED (the guest survives without it),
 * because a bad claim must not cost us a correctly-evidenced guest.
 */
import {
  PODCAST_CONTENT_KINDS,
  type PodcastContentKind,
  type PodcastEvidenceField,
  type PodcastGenderMarker,
} from "@/lib/db/schema/podcast-universe"
import { admissibleGenderEvidence, admissibleNationalityClaim } from "../evidence"
import { containsAsWords, containsNormalized, normalizeNameKey, normalizeText } from "../normalize"

/**
 * Given names that legitimately start with «و» — a glued «و» on these is part
 * of the name, not a conjunction («خالد وليد العتيبي» is one man). Normalized.
 */
const WAW_NAMES = new Set([
  "وليد", "وائل", "وفاء", "وضحي", "وضحى", "وداد", "وعد", "وسام", "وجدان", "وهيب", "وحيد", "وليم", "وديع",
  "وصفي", "وفيق", "وجيه", "وسمي", "ولاء", "وهب", "وصال", "وطفاء", "ورد", "وردة", "وسيم", "ونس", "وهاب",
  "وجدي", "وديعة", "وفيقة", "وئام", "ودود", "وافي", "وارد", "واصل", "واثق", "وليدة", "وهبة",
])

/** Common Arabic given names (normalized: alef folded, ى→ي, ة kept). */
const GIVEN_NAMES = new Set([
  "محمد", "احمد", "علي", "حسن", "حسين", "خالد", "سعود", "سعد", "سعيد", "فهد", "فيصل", "ناصر", "سالم", "سلمان",
  "سليمان", "يوسف", "ابراهيم", "اسماعيل", "عمر", "عثمان", "مشاري", "مبارك", "بدر", "جاسم", "حمد", "حمود", "راشد",
  "صالح", "طارق", "عادل", "عامر", "ماجد", "مازن", "منصور", "نايف", "نواف", "هاني", "هشام", "وليد", "ياسر", "يعقوب",
  "زياد", "سامي", "طلال", "عيسي", "موسي", "مصطفي", "محمود", "مساعد", "مشعل", "متعب", "تركي", "بندر", "سلطان",
  "فاطمة", "مريم", "نورة", "سارة", "عائشة", "هند", "لطيفة", "منيرة", "دانة", "شيخة", "اسماء", "ريم", "نوف", "حصة",
  "جاسر", "ضاري", "حامد", "فارس", "صقر", "حمزة", "انس", "باسل", "رائد", "شهاب", "صهيب",
])

/**
 * Addendum 2 (c): a display_name must be ONE person. «خالد وسعود بن مبارك»
 * names two — rejected, so the episode is re-extracted rather than stored as
 * a merged identity. Returns the offending token, or null.
 */
export function joinsTwoPeople(displayName: string): string | null {
  // Conjunctions only — a comma is not one («عبدالله العلي، بوخالد» is a man and his kunya).
  if (/&|\s(and|و)\s/i.test(` ${displayName} `)) return "conjunction"
  const tokens = normalizeText(displayName).split(" ").filter(Boolean)
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t.startsWith("و") || WAW_NAMES.has(t)) continue
    // Only a glued «و» + a recognisable ARABIC GIVEN NAME is a conjunction
    // («وسعود», «وعبدالله»). Transliterated surnames that merely start with
    // «و» — «ستيفان وايزر», «سايلس والتن» — are one person.
    const rest = t.slice(1)
    if (rest.startsWith("عبد") || GIVEN_NAMES.has(rest)) return t
  }
  return null
}

export interface SourceEpisode {
  id: string
  title: string
  description: string | null
  /** The channel's `host_names` (Addendum 2 c) — excluded deterministically. */
  hostNames?: string[]
}

export interface ValidGuest {
  display_name: string
  role_text: string | null
  is_primary_guest: boolean
  evidence_field: PodcastEvidenceField
  evidence_text: string
  nationality_claim_code: string | null
  nationality_claim_text: string | null
  gender_signal: PodcastGenderMarker
  gender_evidence_text: string | null
  confidence: number
}

export interface ValidEpisodeResult {
  episode_id: string
  content_kind: PodcastContentKind
  topic_hint: string | null
  guests: ValidGuest[]
}

export interface ValidationIssue {
  episode_id: string | null
  /**
   * host_excluded is NOT a failure: a listed host is simply not a guest, so an
   * episode whose only "guest" was its host is no_guest, not failed.
   */
  severity: "guest_rejected" | "claim_dropped" | "episode_rejected" | "host_excluded"
  reason: string
  display_name?: string
}

export interface ValidationReport {
  results: Map<string, ValidEpisodeResult>
  /** Sent episodes the model returned no (usable) result for. */
  missing: string[]
  issues: ValidationIssue[]
  /** True when the payload itself was not the contract shape (schema failure). */
  schemaFailure: boolean
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null
}

/** Where `evidence` occurs verbatim, or null. Prefers the field the model named. */
export function locateEvidence(
  ep: SourceEpisode,
  evidence: string,
  claimed: unknown,
): PodcastEvidenceField | null {
  const inTitle = containsAsWords(ep.title, evidence, { proclitic: true })
  const inDesc = containsAsWords(ep.description ?? "", evidence, { proclitic: true })
  if (claimed === "description" && inDesc) return "description"
  if (claimed === "title" && inTitle) return "title"
  if (inTitle) return "title"
  if (inDesc) return "description"
  return null
}

/** Exact substring of the title or description, on word boundaries («علي» ⊄ «تعليم»). */
function isExactSubstring(ep: SourceEpisode, text: string): boolean {
  return containsAsWords(ep.title, text, { proclitic: true }) || containsAsWords(ep.description ?? "", text, { proclitic: true })
}

export function validateExtraction(parsed: unknown, sent: SourceEpisode[]): ValidationReport {
  const byId = new Map(sent.map((e) => [e.id, e]))
  const report: ValidationReport = { results: new Map(), missing: [], issues: [], schemaFailure: false }
  const episodes = (parsed as { episodes?: unknown })?.episodes
  if (!Array.isArray(episodes)) {
    report.schemaFailure = true
    report.missing = sent.map((e) => e.id)
    report.issues.push({ episode_id: null, severity: "episode_rejected", reason: "output has no episodes array" })
    return report
  }

  for (const raw of episodes) {
    const r = raw as Record<string, unknown>
    const id = str(r?.episode_id)
    const ep = id ? byId.get(id) : undefined
    if (!id || !ep) {
      report.issues.push({ episode_id: id, severity: "episode_rejected", reason: "unknown episode_id" })
      continue
    }
    if (report.results.has(id)) {
      report.issues.push({ episode_id: id, severity: "episode_rejected", reason: "duplicate result for episode" })
      continue
    }
    const kind = str(r.content_kind)
    if (!kind || !(PODCAST_CONTENT_KINDS as readonly string[]).includes(kind)) {
      report.issues.push({ episode_id: id, severity: "episode_rejected", reason: `invalid content_kind "${kind ?? ""}"` })
      continue
    }
    if (!Array.isArray(r.guests)) {
      report.issues.push({ episode_id: id, severity: "episode_rejected", reason: "guests is not an array" })
      continue
    }

    const guests: ValidGuest[] = []
    const seenNames = new Set<string>()
    const hostKeys = new Set((ep.hostNames ?? []).map((h) => normalizeNameKey(h)).filter(Boolean))
    // Every OTHER person named for this episode (other guests + hosts): a
    // nationality adjective with one of them in between is not this guest's.
    const allNames = [
      ...(r.guests as Array<Record<string, unknown>>).map((g) => str(g?.display_name)?.trim()).filter((x): x is string => !!x),
      ...(ep.hostNames ?? []),
    ]
    for (const g of r.guests as Array<Record<string, unknown>>) {
      const name = str(g?.display_name)?.trim() ?? null
      const evidence = str(g?.evidence_text)
      if (!name || !evidence) {
        report.issues.push({ episode_id: id, severity: "guest_rejected", reason: "missing display_name or evidence_text", display_name: name ?? undefined })
        continue
      }
      const field = locateEvidence(ep, evidence, g.evidence_field)
      if (!field) {
        report.issues.push({ episode_id: id, severity: "guest_rejected", reason: "evidence_text is not an exact substring of title/description", display_name: name })
        continue
      }
      const join = joinsTwoPeople(name)
      if (join) {
        report.issues.push({ episode_id: id, severity: "guest_rejected", reason: `display_name joins two people (${join}) — re-extract`, display_name: name })
        continue
      }
      if (!containsAsWords(evidence, name, { proclitic: true }) && !containsNormalized(evidence, name)) {
        report.issues.push({ episode_id: id, severity: "guest_rejected", reason: "display_name does not appear within evidence_text", display_name: name })
        continue
      }
      if (seenNames.has(name)) continue
      seenNames.add(name)
      if (hostKeys.has(normalizeNameKey(name))) {
        report.issues.push({ episode_id: id, severity: "host_excluded", reason: "listed host of this channel (host_names)", display_name: name })
        continue
      }

      // Nationality claim — exact substring + admissible, else dropped.
      let natCode: string | null = null
      let natText: string | null = null
      const claim = g.nationality_claim as Record<string, unknown> | null | undefined
      if (claim && typeof claim === "object") {
        const ctext = str(claim.evidence_text)
        if (!ctext || !isExactSubstring(ep, ctext)) {
          report.issues.push({ episode_id: id, severity: "claim_dropped", reason: "nationality evidence is not an exact substring", display_name: name })
        } else {
          const adm = admissibleNationalityClaim({
            code: str(claim.country_code),
            evidence: ctext,
            displayName: name,
            otherNames: allNames.filter((n) => n !== name),
          })
          if (adm.ok) {
            natCode = adm.code
            natText = ctext
          } else {
            report.issues.push({ episode_id: id, severity: "claim_dropped", reason: `nationality: ${adm.reason}`, display_name: name })
          }
        }
      }

      // Gender — exact substring + more than the name, else unknown.
      let gender: PodcastGenderMarker = "unknown"
      let genderText: string | null = null
      const sig = g.gender_signal === "male" || g.gender_signal === "female" ? g.gender_signal : "unknown"
      if (sig !== "unknown") {
        const gtext = str(g.gender_evidence_text)
        if (!gtext || !isExactSubstring(ep, gtext)) {
          report.issues.push({ episode_id: id, severity: "claim_dropped", reason: "gender evidence is not an exact substring", display_name: name })
        } else if (!admissibleGenderEvidence({ signal: sig, evidence: gtext, displayName: name, guestEvidence: evidence })) {
          report.issues.push({ episode_id: id, severity: "claim_dropped", reason: "gender evidence is not a gendered description attached to the guest", display_name: name })
        } else {
          gender = sig
          genderText = gtext
        }
      }

      const conf = typeof g.confidence === "number" && Number.isFinite(g.confidence) ? Math.min(1, Math.max(0, g.confidence)) : 0
      guests.push({
        display_name: name,
        role_text: str(g.role_text),
        is_primary_guest: g.is_primary_guest === true,
        evidence_field: field,
        evidence_text: evidence,
        nationality_claim_code: natCode,
        nationality_claim_text: natText,
        gender_signal: gender,
        gender_evidence_text: genderText,
        confidence: conf,
      })
    }
    report.results.set(id, {
      episode_id: id,
      content_kind: kind as PodcastContentKind,
      topic_hint: str(r.topic_hint),
      guests,
    })
  }
  report.missing = sent.filter((e) => !report.results.has(e.id)).map((e) => e.id)
  return report
}
