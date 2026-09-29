/**
 * Guest Discovery v2 — does the resolved Wikidata entity match the STORY?
 *
 * The resolver matches a name (plus the proposal's role/country hint). Once
 * the story check has verified who this person is, that evidence is a far
 * better witness than the hint. 2026-09-29, run 1c57b1b9: «بدر المطيري», a
 * man jailed for years over a name mix-up, resolved to Q135410401 — a
 * footballer born 2003 — and the card borrowed the footballer's sitelinks
 * and an OpenAlex «3544 اقتباس» searched by his English label.
 *
 * Rule (deterministic, fail-open): with a VERIFIED story, the entity's own
 * occupation words (Wikidata occupations + description, nationality words
 * out) must appear somewhere in what we know about our person — the verified
 * quotes, the story summary, ±NAME_WINDOW_CHARS around each mention of him
 * in the live sources, or the
 * proposal's own role/why/claim. None do → the QID is dropped. The
 * classifier's `wikidata_match: false` drops it too. Neither can ADD trust.
 * Pure — no I/O.
 */

import { foldVerbatim } from "@/lib/studio/verbatim"
import { normalizeArabicVariants } from "@/lib/khat-map/core/policy"
import { isGeoWord, nameVariants } from "./story-evidence"
import type { EnrichmentSignals, ProposedName, StoryCheck, WikiFacts } from "./types"

/** Words too generic to identify an occupation. Folded. */
const STOP = new Set(["لعدد", "عدد", "التي", "الذي", "والتي", "كان", "كانت", "وهو", "وهي", "عضو", "احد", "اشهر"])

function fold(s: string): string {
  return foldVerbatim(normalizeArabicVariants(s ?? ""))
}

/** A token's bare forms: itself, minus و/ف, minus ب/ل/ك, minus ال. */
function bare(tok: string): string[] {
  const out = new Set([tok])
  let t = tok
  if (t.length > 3 && /^[وف]/.test(t)) out.add((t = t.slice(1)))
  if (t.length > 3 && /^[بلك]/.test(t)) out.add((t = t.slice(1)))
  for (const x of [...out]) if (x.length > 4 && x.startsWith("ال")) out.add(x.slice(2))
  return [...out]
}

/**
 * What the entity IS, as matchable words: occupation labels + description,
 * nationality words and ≤3-letter forms out («لاعب كرة قدم كويتي» → «لاعب»).
 */
export function entityOccupationTokens(w: WikiFacts): string[] {
  const text = [...(w.occupations ?? []), w.description ?? ""].join(" ")
  const out = new Set<string>()
  for (const tok of fold(text).split(" ")) {
    // «Q937857» is labelsFor's fallback for an unlabelled occupation — not a word.
    if (!tok || isGeoWord(tok) || /^q\d+$/.test(tok)) continue
    // Every bare form of 4+ letters: «ومحلل» → «محلل»; «لاعب» stays «لاعب»
    // (its «ل» is a root letter — «اعب» is too short to keep).
    const forms = bare(tok)
    if (forms.some((f) => STOP.has(f))) continue
    for (const f of forms) if (f.length >= 4) out.add(f)
  }
  return [...out]
}

/** Characters kept on each side of a name mention (noura QA, 2026-09-29). */
export const NAME_WINDOW_CHARS = 300

/**
 * Only the text AROUND each mention of the person: a long page that names
 * him once and talks about a footballer 2,000 characters later says nothing
 * about his occupation. Folded text; empty when he is not named.
 */
function nameWindows(text: string, variants: string[]): string[] {
  const f = fold(text)
  const out: string[] = []
  for (const v of variants) {
    let i = f.indexOf(v)
    while (i >= 0) {
      out.push(f.slice(Math.max(0, i - NAME_WINDOW_CHARS), i + v.length + NAME_WINDOW_CHARS))
      i = f.indexOf(v, i + v.length)
    }
  }
  return out
}

export type IdentityDropReason = "occupation_absent" | "classifier_mismatch"

/**
 * Why a resolved entity must be dropped for this candidate, or null. Only a
 * verified story can drop on occupation (without one we know nothing better
 * than the resolver); the classifier's explicit `false` always can.
 */
export function identityDropReason(
  wiki: WikiFacts,
  check: StoryCheck,
  proposed: ProposedName,
): IdentityDropReason | null {
  if (!wiki.resolved) return null
  if (check.attrs.wikidata_match === false && check.attrs.same_person) return "classifier_mismatch"
  const a = check.assessment
  if (a.status !== "verified" || a.evidence.length === 0) return null
  const want = entityOccupationTokens(wiki)
  if (want.length === 0) return null // nothing the story could contradict
  const variants = nameVariants([proposed.name, proposed.name_en])
  const hay = [
    a.summary ?? "",
    ...a.evidence.map((e) => e.quote),
    ...check.sources.filter((s) => s.verified).flatMap((s) => nameWindows(`${s.title} ${s.text}`, variants)),
    proposed.role ?? "",
    proposed.why ?? "",
    proposed.story_claim ?? "",
  ].join(" ")
  const have = new Set(fold(hay).split(" ").flatMap(bare))
  // Only words in a script the evidence is written in can be looked for: an
  // entity whose occupation label came back in English only ("researcher")
  // cannot be judged against Arabic quotes — that is not a contradiction.
  // Known limit (fail-open): such an entity is kept unless the classifier's
  // wikidata_match says false.
  const arabic = /\p{Script=Arabic}/u
  const hasAr = [...have].some((h) => arabic.test(h))
  const hasLatin = [...have].some((h) => /[a-z]/.test(h))
  const judgeable = want.filter((t) => (arabic.test(t) ? hasAr : hasLatin))
  if (judgeable.length === 0) return null
  const seen = judgeable.some((t) => have.has(t) || [...have].some((h) => h.startsWith(t)))
  return seen ? null : "occupation_absent"
}

/**
 * The entity as the card may keep it after a drop: unresolved, with an
 * audit note. Nothing of the stranger survives.
 */
export function droppedEntity(wiki: WikiFacts, reason: IdentityDropReason): WikiFacts {
  return {
    resolved: false,
    identity_dropped: { qid: wiki.qid ?? null, description: wiki.description ?? null, reason },
  }
}

/**
 * Signals that were looked up THROUGH the entity (its labels, its handles)
 * are the stranger's: OpenAlex and Google Books search by the entity's
 * label, X / Instagram / the YouTube channel come from its Wikidata handles.
 * Name-searched signals (news, talks, podcasts) stay.
 */
export function stripEntitySignals(s: EnrichmentSignals, wiki: WikiFacts): EnrichmentSignals {
  const out: EnrichmentSignals = { ...s, scholar: null, books: null, x: null, instagram: null }
  if (s.youtube && wiki.social?.youtube_channel && s.youtube.channel_url === wiki.social.youtube_channel) {
    out.youtube = { ...s.youtube, channel_url: null, channel_title: null }
  }
  return out
}
