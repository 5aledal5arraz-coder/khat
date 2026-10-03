/**
 * Luna guest-extraction prompt — `podcast-universe-guest-extract-v1` (B6).
 *
 * The system rules are the spec's, verbatim in substance. Input is metadata
 * only (Decision 10: no transcripts in M1): title in full, description
 * normalized and capped at DESCRIPTION_EXCERPT_MAX characters, keeping a
 * later line that explicitly introduces a guest.
 */
import { DESCRIPTION_EXCERPT_MAX, GUEST_EXTRACT_PROMPT_VERSION } from "../constants"

export const PROMPT_VERSION = GUEST_EXTRACT_PROMPT_VERSION

export interface ExtractionInputEpisode {
  episode_id: string
  channel_name: string
  title: string
  description_excerpt: string
  duration_seconds: number
  published_at: string
  /** The channel's known hosts (host_names) — never guests. */
  channel_hosts: string[]
}

export const SYSTEM_RULES = `You extract podcast guests from YouTube episode metadata.

Rules — follow every one:
1. You extract only what is explicitly supported by the supplied metadata.
2. Do not use outside knowledge.
3. Do not guess a guest from the subject.
4. Do not infer nationality from the channel.
5. Do not infer nationality from a name.
6. Do not assume every named person is the guest.
7. Hosts, sponsors, producers and people merely discussed are not guests. Anyone listed in channel_hosts is a host of that channel and is NEVER a guest.
8. If no identifiable guest exists, return an empty guests array.
9. Every extracted guest MUST include evidence_text copied verbatim (character for character) from the supplied title or description_excerpt, and display_name must appear inside that evidence_text exactly as written there.
10. nationality_claim is only for an explicit statement in the metadata that the guest is of that country (e.g. «رائد الأعمال الكويتي فلان», «ضيفنا من الكويت فلان»); its evidence_text must be copied verbatim AND must include the guest's name exactly as written there — copy the whole phrase from the name to the nationality word (e.g. «فارس عاشور، ممثل ويوتيوبر كويتي»), never the nationality word alone. Otherwise set nationality_claim to null.
11. gender_signal is "male" or "female" only when the metadata uses an explicit gendered description of the guest (e.g. «اللاعب», «الدكتورة»); gender_evidence_text must be copied verbatim. A name alone is never a gender signal — use "unknown" and null.
12. If there are multiple genuine guests, return each separately. ONE person per guest entry: never join two people in one display_name (e.g. never «خالد وسعود بن مبارك»); give each person their own entry, with a display_name copied exactly as that person's name appears in the text.
13. Return exactly one result for every input episode, with the same episode_id.

content_kind must be one of: guest_interview, panel, solo_host, narrated_story, documentary, other, unclear.
evidence_field is "title" or "description" — where evidence_text was copied from.
confidence is a number between 0 and 1.

Respond with JSON only, exactly this shape:
{"episodes":[{"episode_id":"uuid","content_kind":"guest_interview","guests":[{"display_name":"…","role_text":"…","is_primary_guest":true,"evidence_field":"title","evidence_text":"…","nationality_claim":{"country_code":"KW","evidence_text":"…"},"gender_signal":"male","gender_evidence_text":"…","confidence":0.96}],"topic_hint":"…"}]}`

/** Lines that introduce a guest — kept even past the excerpt cap. */
const GUEST_INTRO = /(ضيف|ضيفنا|ضيفتنا|ضيوف|مع\s|استضاف|نستضيف|يستضيف|guest|featuring|ft\.|with\s)/i

/**
 * Normalize + cap a description. Whitespace collapsed per line, URLs and
 * hashtag-only lines dropped (they are never guest evidence and burn tokens).
 * If the cap cuts off a later guest-introducing line, it is appended.
 *
 * NOTE the evidence check runs against THIS excerpt's source text: every line
 * kept here is an unaltered line of the original description (only trimmed),
 * so a verbatim copy from the excerpt is still a substring of the original.
 */
export function descriptionExcerpt(description: string | null | undefined, max = DESCRIPTION_EXCERPT_MAX): string {
  if (!description) return ""
  const lines = description
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^https?:\/\/\S+$/.test(l) && !/^(#\S+\s*)+$/.test(l))
  let out = ""
  let i = 0
  for (; i < lines.length; i++) {
    const next = out ? `${out}\n${lines[i]}` : lines[i]
    if (next.length > max) break
    out = next
  }
  if (i < lines.length && out.length < max) {
    // The first line alone is longer than the cap — keep its head.
    if (!out) out = lines[i].slice(0, max)
  }
  for (let j = i; j < lines.length; j++) {
    if (GUEST_INTRO.test(lines[j]) && lines[j].length <= 300) {
      out = `${out}\n${lines[j]}`
      break
    }
  }
  return out
}

export function buildUserMessage(episodes: ExtractionInputEpisode[]): string {
  return JSON.stringify({ episodes })
}
