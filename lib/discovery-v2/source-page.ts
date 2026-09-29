/**
 * Guest Discovery v2 — read the SOURCE PAGE itself, and decide from it who is
 * speaking.
 *
 * WHY (measured by rashid, 2026-09-29): every web source's `text` is Gemini's
 * grounding summary — the answer segments it attributed to a URL
 * (grounded-evidence.ts: `groundingSupports[].segment.text`). That is Gemini's
 * prose, not the page: often identical across URLs, carrying Markdown, in the
 * third person («تحدث براك المشعان عن…»). The verbatim guard proved a quote was
 * in THAT text, so 0 of 9 guard-passing quotes were on the live pages, and
 * «رواها بنفسه» passed for جاسم المطوع though the video is a third party
 * retelling his story.
 *
 * This module fetches the page (plain HTTP, zero AI cost) and reads what the
 * page itself states:
 *   - YouTube: title + channel + description (Data API `videos` snippet, 1
 *     quota unit, when YOUTUBE_API_KEY is set; otherwise the keyless oEmbed —
 *     title + channel only);
 *   - any other page: title, byline, description and body paragraphs, from a
 *     bounded (time + bytes) GET to a PUBLIC address only (the URLs come from
 *     a web search: every hop is checked against private / metadata ranges).
 *
 * `pageSpeaker` is the deterministic proof that HE is the one telling it —
 * the only way `self_told` becomes true (story-classify.ts). A page that
 * could not be read proves nothing: never true, never «absent».
 */

import dns from "node:dns"
import http from "node:http"
import https from "node:https"
import { isIP, type LookupFunction } from "node:net"
import type { Readable } from "node:stream"
import zlib from "node:zlib"
import { env } from "@/lib/env"
import { decodeHtmlEntities } from "@/lib/studio/utils"
import { buildVerbatimHaystack, foldVerbatim, isVerbatimIn } from "@/lib/studio/verbatim"
import { mentionsName } from "./story-evidence"
import type { SelfToldBasis, SourcePage, StorySource } from "./types"

/** One page read — redirects, headers and body included. */
export const PAGE_FETCH_TIMEOUT_MS = 8_000
/** Below this there is no point starting a read. */
export const PAGE_FETCH_MIN_MS = 1_500
/** Body bytes read at most; the head (title / meta / JSON-LD) comes first. */
export const PAGE_MAX_BYTES = 1_500_000
/** Readable text kept per page. */
export const PAGE_MAX_TEXT = 40_000
/**
 * A non-YouTube page with less readable text than this (folded chars) is too
 * thin to conclude that it does NOT name someone — a JS-rendered shell, a
 * login wall. It can still PROVE a name (the headline carries it).
 */
export const PAGE_MIN_READABLE_CHARS = 400
const MAX_REDIRECTS = 4
const UA = "Mozilla/5.0 (compatible; KhatPodcast-SourceCheck/1.0; +https://khatpodcast.com)"

// ─── Pure: YouTube ───────────────────────────────────────────────────────────

export function youtubeVideoId(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "")
  const ok = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null)
  if (host === "youtu.be") return ok(u.pathname.split("/")[1])
  if (host !== "youtube.com") return null
  if (u.pathname === "/watch") return ok(u.searchParams.get("v"))
  const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/)
  return ok(m?.[1])
}

// ─── Pure: HTML → SourcePage ────────────────────────────────────────────────
//
// Every scan here is LINEAR (indexOf, no backtracking regex over the page):
// the HTML is hostile, parsing is synchronous, and an abort cannot stop a
// regex — `<script\b[\s\S]*?<\/\1>` over 80k unclosed «<script » took 93s
// and would freeze the worker (yousef, 2026-09-29).

/** HTML parsed at most — a page's head and article body sit well within it. */
export const PAGE_PARSE_MAX_CHARS = 300_000
/** Tags of one kind read at most per page. */
const MAX_TAGS = 400
const MAX_PARAGRAPHS = 2_000
/** One attribute list read at most. */
const MAX_TAG_CHARS = 4_000
export const PAGE_TITLE_MAX = 300
export const PAGE_AUTHOR_MAX = 120
/** A `self_told` cue — stored in the DB and shown on the card. */
export const PAGE_CUE_MAX = 240

const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)
/** ASCII-only lowercase: same length as the input, so indices line up. */
const asciiLower = (s: string) => s.replace(/[A-Z]+/g, (m) => m.toLowerCase())

/** Remove tags linearly — an unclosed «<» drops the rest (it is inside a tag). */
function stripTags(s: string): string {
  let out = ""
  let i = 0
  while (i < s.length) {
    const lt = s.indexOf("<", i)
    if (lt < 0) {
      out += s.slice(i)
      break
    }
    out += s.slice(i, lt)
    const gt = s.indexOf(">", lt + 1)
    if (gt < 0) break
    out += " "
    i = gt + 1
  }
  return out
}

function clean(s: string, max = PAGE_MAX_TEXT): string {
  return decodeHtmlEntities(stripTags(s.slice(0, max * 2)))
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, max)
}

/** Next «<tag» that is that tag («<p», not «<param»), or -1. */
function tagStart(lower: string, tag: string, from: number): number {
  let i = from
  for (;;) {
    i = lower.indexOf(`<${tag}`, i)
    if (i < 0) return -1
    const next = lower[i + tag.length + 1]
    if (next === undefined || !/[a-z0-9-]/.test(next)) return i
    i += tag.length + 1
  }
}

/** Each closed `<tag …>inner</tag>`, in order; an unclosed one ends the scan. */
function blocks(html: string, tag: string, max = MAX_TAGS): Array<{ open: string; inner: string }> {
  const lower = asciiLower(html)
  const out: Array<{ open: string; inner: string }> = []
  let pos = 0
  while (out.length < max) {
    const start = tagStart(lower, tag, pos)
    if (start < 0) break
    const gt = lower.indexOf(">", start)
    if (gt < 0) break
    const close = lower.indexOf(`</${tag}`, gt + 1)
    if (close < 0) break
    out.push({ open: html.slice(start, Math.min(gt + 1, start + MAX_TAG_CHARS)), inner: html.slice(gt + 1, close) })
    pos = close + tag.length + 2
  }
  return out
}

/** Drop every `<tag>…</tag>` block (an unclosed one takes the rest with it). */
function dropBlocks(html: string, tag: string): string {
  const lower = asciiLower(html)
  let out = ""
  let pos = 0
  for (;;) {
    const start = tagStart(lower, tag, pos)
    if (start < 0) {
      out += html.slice(pos)
      break
    }
    out += `${html.slice(pos, start)} `
    const close = lower.indexOf(`</${tag}`, start + 1)
    if (close < 0) break
    const gt = lower.indexOf(">", close)
    if (gt < 0) break
    pos = gt + 1
  }
  return out
}

/** `name="value"` pairs of one tag, by a linear scan (no regex backtracking). */
function attributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  let i = 0
  while (i < tag.length) {
    const eq = tag.indexOf("=", i)
    if (eq < 0) break
    let k = eq
    while (k > 0 && /[a-zA-Z:_-]/.test(tag[k - 1]) && eq - k < 64) k--
    const name = tag.slice(k, eq).toLowerCase()
    let v = eq + 1
    while (v < tag.length && (tag[v] === " " || tag[v] === "\t" || tag[v] === "\n")) v++
    const q = tag[v]
    if (q !== '"' && q !== "'") {
      i = eq + 1
      continue
    }
    const endQ = tag.indexOf(q, v + 1)
    if (endQ < 0) break
    if (name && !attrs.has(name)) attrs.set(name, tag.slice(v + 1, endQ))
    i = endQ + 1
  }
  return attrs
}

function metaTags(html: string): Map<string, string> {
  const lower = asciiLower(html)
  const out = new Map<string, string>()
  let pos = 0
  for (let n = 0; n < MAX_TAGS; n++) {
    const start = tagStart(lower, "meta", pos)
    if (start < 0) break
    const gt = lower.indexOf(">", start)
    if (gt < 0) break
    const attrs = attributes(html.slice(start, Math.min(gt + 1, start + MAX_TAG_CHARS)))
    const key = (attrs.get("property") ?? attrs.get("name") ?? "").toLowerCase()
    const content = attrs.get("content")
    if (key && content && !out.has(key)) out.set(key, clean(content, 2_000))
    pos = gt + 1
  }
  return out
}

function ldAuthor(a: unknown): string | null {
  if (typeof a === "string") return a.trim() || null
  if (Array.isArray(a)) {
    const names = a.slice(0, 5).map(ldAuthor).filter((x): x is string => !!x)
    return names.length ? names.join("، ") : null
  }
  if (a && typeof a === "object" && typeof (a as { name?: unknown }).name === "string") {
    return ((a as { name: string }).name).trim() || null
  }
  return null
}

function jsonLd(html: string): { body: string | null; author: string | null; headline: string | null } {
  let body: string | null = null
  let author: string | null = null
  let headline: string | null = null
  for (const s of blocks(html, "script")) {
    if (!asciiLower(s.open).includes("ld+json")) continue
    let data: unknown
    try {
      data = JSON.parse(s.inner)
    } catch {
      continue
    }
    const items: unknown[] = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { "@graph"?: unknown })["@graph"])
        ? ((data as { "@graph": unknown[] })["@graph"])
        : [data]
    for (const it of items.slice(0, 50)) {
      if (!it || typeof it !== "object") continue
      const o = it as Record<string, unknown>
      if (!body && typeof o.articleBody === "string" && o.articleBody.trim()) body = clean(o.articleBody)
      if (!author) author = ldAuthor(o.author)
      if (!headline && typeof o.headline === "string") headline = clean(o.headline, 2_000)
    }
  }
  return { body, author, headline }
}

/** Title, byline and readable text of an HTML page. Pure, linear, capped. */
export function parseHtmlPage(rawHtml: string): SourcePage {
  const html = rawHtml.slice(0, PAGE_PARSE_MAX_CHARS)
  const meta = metaTags(html)
  const ld = jsonLd(html)
  const titleTag = blocks(html, "title", 1)[0]?.inner
  const title = meta.get("og:title") || ld.headline || (titleTag ? clean(titleTag, 2_000) : "")
  const metaAuthor = meta.get("author") || meta.get("article:author") || null
  const author = (metaAuthor && !/^https?:/i.test(metaAuthor) ? metaAuthor : null) || ld.author
  const description = meta.get("og:description") || meta.get("description") || ""
  let body = ld.body
  if (!body) {
    let stripped = html
    for (const t of ["script", "style", "noscript", "svg", "template"]) stripped = dropBlocks(stripped, t)
    body = blocks(stripped, "p", MAX_PARAGRAPHS)
      .map((b) => clean(b.inner, 5_000))
      .filter((p) => p.length >= 20)
      .join("\n")
  }
  const text = [description, body].filter(Boolean).join("\n").slice(0, PAGE_MAX_TEXT)
  return {
    title: cap(title, PAGE_TITLE_MAX),
    author: author ? cap(author, PAGE_AUTHOR_MAX) : null,
    text,
    via: "html",
  }
}

// ─── Pure: what the page says ────────────────────────────────────────────────

export function pageAllText(page: SourcePage): string {
  return [page.title, page.author ?? "", page.text].join("\n")
}

/** The page names this person (title, channel/byline, or text). */
export function pageNamesPerson(page: SourcePage, variants: string[]): boolean {
  return mentionsName(pageAllText(page), variants)
}

/**
 * Enough of the page was read to conclude it does NOT name someone. The Data
 * API's title + channel + full description is; oEmbed (title + channel only)
 * is not — the description may name him — and neither is a thin HTML shell.
 */
export function pageReadable(page: SourcePage): boolean {
  if (page.via === "youtube_api") return true
  if (page.via === "youtube_oembed") return false
  return foldVerbatim(`${page.title} ${page.text}`).length >= PAGE_MIN_READABLE_CHARS
}

/** The quote is a verbatim span of the page itself. */
export function quoteOnPage(quote: string, page: SourcePage | null | undefined): boolean {
  if (!page) return false
  return isVerbatimIn(quote, buildVerbatimHaystack(pageAllText(page)))
}

/** Split into the page's own sentences / title segments (original text). */
function segments(s: string): string[] {
  return s
    .split(/[\n\r]+|[.!?؟؛|•]+|\s[-–—]\s/)
    .map((x) => x.trim())
    .filter(Boolean)
}

// Folded forms (foldVerbatim: ة→ه, أ/إ/آ→ا, ؤ→و, ى→ي).
/** Words that present someone as the guest; may sit ≤3 words before his name. */
const HOST_WORDS = new Set([
  "ضيف", "ضيفنا", "ضيفه", "الضيف", "ضيوف", "نستضيف", "يستضيف", "تستضيف", "استضافه",
  "استضاف", "استضفنا", "حوار", "حوارنا", "لقاء", "لقاونا", "مقابله",
])
/**
 * Interview / podcast context. «مع فلان» counts only where one of these is on
 * the page (a title) or in the same sentence (description text): «مع فهد
 * العتيبي في رحلته الأخيرة» on a documentary channel is not an interview
 * (noura, 2026-09-29). «برنامج» is deliberately absent — documentaries are
 * programmes too.
 */
const EPISODE_WORDS = new Set([
  "حلقه", "الحلقه", "حلقتنا", "بودكاست", "البودكاست", "podcast", "episode", "حوار", "حوارنا", "لقاء",
  "مقابله", "ضيف", "ضيفنا", "الضيف", "نستضيف", "يستضيف",
])
/** A name right after these is someone's RELATIVE or friend, not him («ابن فلان يروي…»). */
const KIN_WORDS = new Set([
  "ابن", "ابنه", "بنت", "نجل", "كريمه", "ابو", "ام", "اخ", "اخو", "اخوه", "اخت", "شقيق", "شقيقه", "زوج", "زوجه",
  "ارمله", "حفيد", "حفيده", "والد", "والده", "جد", "جده", "عم", "عمه", "خال", "خاله", "صديق", "صديقه", "رفيق",
  "رفيقه", "زميل", "زميله",
])
/** «فهد العتيبي في بودكاست سوالف» — the word after «في». */
const VENUE_WORDS = new Set(["بودكاست", "البودكاست", "برنامج", "لقاء", "حوار", "حلقه"])
/** Speech verbs. Before his name only directly (≤1 word); after it, ≤4 words. */
const SPEECH_VERBS = new Set([
  "قال", "يقول", "روي", "يروي", "يرويان", "حكي", "يحكي", "تحدث", "يتحدث", "سرد", "يسرد",
  "كشف", "يكشف", "استعرض", "يستعرض", "يشاركنا", "تكلم", "يتكلم",
  // feminine forms — a woman guest tells it too
  "قالت", "تقول", "روت", "تروي", "حكت", "تحكي", "تحدثت", "تتحدث", "سردت", "تسرد", "كشفت", "تكشف", "تشاركنا",
])
/** A name right after these is being TALKED ABOUT («قصة فلان», «عن فلان»). */
const ABOUT_WORDS = new Set(["عن", "قصه", "قصص", "حكايه", "سيره", "عنه"])
/** First-person words that make a «فلان: …» headline his own words. */
const FIRST_PERSON = new Set([
  "انا", "كنت", "عشت", "خسرت", "قررت", "تعلمت", "بدات", "اصبت", "فقدت", "تركت", "دخلت", "خرجت", "نجحت", "فشلت",
  "فشلي", "نجاحي", "مرضي", "ادماني", "سجني", "افلاسي", "ديوني", "ابي", "امي", "والدي", "عمري", "طريقي", "حلمي",
])

function isFirstPersonToken(t: string): boolean {
  if (FIRST_PERSON.has(t)) return true
  // حياتي، قصتي، تجربتي، إعاقتي… — not «التي» / an «ال…تي» adjective.
  return t.length >= 4 && t.endsWith("تي") && !t.startsWith("ال")
}

function findVariant(tokens: string[], variants: string[]): Array<{ at: number; len: number }> {
  const hits: Array<{ at: number; len: number }> = []
  for (const v of variants) {
    const vt = v.split(" ")
    for (let i = 0; i + vt.length <= tokens.length; i++) {
      if (vt.every((w, k) => tokens[i + k] === w)) hits.push({ at: i, len: vt.length })
    }
  }
  return hits
}

/** The name at `at` is someone's relative / friend («ابن جاسم المطوع», «صديق الراحل فهد…»). */
function kinBefore(tokens: string[], at: number): boolean {
  return [at - 1, at - 2].some((k) => k >= 0 && KIN_WORDS.has(tokens[k]))
}

/** The name occurs in `text` NOT as someone's relative («ابن فلان» is not فلان). */
function namesHimself(text: string, variants: string[]): boolean {
  const tokens = foldVerbatim(text).split(" ").filter(Boolean)
  return findVariant(tokens, variants).some(({ at }) => !kinBefore(tokens, at))
}

/**
 * One segment (a title part or a sentence) presents him as the speaker/guest.
 * `pageInterview` — the page has an interview/podcast cue somewhere (titles
 * only; a description sentence needs its own).
 */
function guestCue(segment: string, variants: string[], isTitle: boolean, pageInterview = false): boolean {
  const tokens = foldVerbatim(segment).split(" ").filter(Boolean)
  const episodeContext = (isTitle && pageInterview) || tokens.some((t) => EPISODE_WORDS.has(t))
  for (const { at, len } of findVariant(tokens, variants)) {
    if (at > 0 && ABOUT_WORDS.has(tokens[at - 1])) continue // «قصة فلان» / «عن فلان»
    if (kinBefore(tokens, at)) continue // «ابن فلان يروي…», «حفيد فلان يحكي…»
    if (tokens[at + len] === "في" && VENUE_WORDS.has(tokens[at + len + 1] ?? "")) return true // «فلان في بودكاست سوالف»
    for (let j = at - 1; j >= Math.max(0, at - 4); j--) {
      const gap = tokens.slice(j + 1, at)
      if (gap.some((t) => ABOUT_WORDS.has(t))) break
      const t = tokens[j]
      if (HOST_WORDS.has(t)) return true
      if (t === "مع" && episodeContext) return true
      if (SPEECH_VERBS.has(t) && gap.length <= 1) return true
    }
    for (let j = at + len; j < Math.min(tokens.length, at + len + 5); j++) {
      const t = tokens[j]
      if (ABOUT_WORDS.has(t)) break
      if (SPEECH_VERBS.has(t)) return true
    }
  }
  return false
}

/** «فراس الفارسي: حادث مروري غير مسيرة حياتي» — he is quoted, first person. */
function quotedHeadline(segment: string, variants: string[]): boolean {
  const i = segment.indexOf(":")
  if (i <= 0) return false
  const left = foldVerbatim(segment.slice(0, i)).split(" ").filter(Boolean)
  const right = foldVerbatim(segment.slice(i + 1)).split(" ").filter(Boolean)
  const endsWithName = variants.some((v) => {
    const vt = v.split(" ")
    const at = left.length - vt.length
    return at >= 0 && at <= 2 && vt.every((w, k) => left[at + k] === w) && !kinBefore(left, at)
  })
  return endsWithName && right.some(isFirstPersonToken)
}

/**
 * The channel / byline is his: it carries his NAME (a full-name variant).
 * A first name alone («ضاري») is not proof — half of Kuwait shares it
 * (yousef, 2026-09-29).
 */
function ownAuthor(page: SourcePage, variants: string[]): boolean {
  return !!page.author && namesHimself(page.author, variants)
}

/** «#12 …», «الحلقة 12 …», «EP 12 …» at the start of a title segment. */
const EPISODE_PREFIX = /^\s*(?:#\s*[0-9٠-٩]+|(?:ال)?حلق[ةه]\s*(?:رقم\s*)?[0-9٠-٩]+|ep\.?\s*[0-9]+)\s*[:\-–—]?\s*/i

/** A title segment that names the episode / podcast itself. */
function episodeSegment(seg: string): boolean {
  if (EPISODE_PREFIX.test(seg) || /#\s*[0-9٠-٩]+/.test(seg)) return true
  return foldVerbatim(seg).split(" ").some((t) => EPISODE_WORDS.has(t))
}

/** Some interview / podcast cue anywhere on the page. */
function pageHasInterviewCue(page: SourcePage): boolean {
  const all = `${page.title}\n${page.author ?? ""}\n${page.text.slice(0, 5_000)}`
  return /#\s*[0-9٠-٩]+/.test(page.title) || foldVerbatim(all).split(" ").some((t) => EPISODE_WORDS.has(t))
}

/**
 * The common Kuwaiti title shapes where his bare name IS a segment:
 * «بودكاست سوالف | فهد العتيبي», «فهد العتيبي | بودكاست سوالف»,
 * «الحلقة 12 - فهد العتيبي», «#12 فهد العتيبي - …».
 */
function bareNameEpisodeTitle(segs: string[], variants: string[]): boolean {
  return segs.some((raw, i) => {
    const prefix = raw.match(EPISODE_PREFIX)
    const bare = foldVerbatim(prefix ? raw.slice(prefix[0].length) : raw)
    if (!variants.includes(bare)) return false
    if (prefix) return true
    return [segs[i - 1], segs[i + 1]].some((n) => n !== undefined && episodeSegment(n))
  })
}

export interface SpeakerFinding {
  basis: Exclude<SelfToldBasis, "classifier">
  /** Text that exists on the page and shows it. */
  cue: string
}

/**
 * Does the page itself show that THIS person is the one telling it? Needs
 * the page to name him (title / channel / text) AND one of: his own channel
 * or byline; a title or episode sentence presenting him as the guest («ضيف
 * الحلقة», «نستضيف», «مع فلان», «فلان يحكي»); a «فلان: …» first-person
 * headline, or a first-person title with his name as its own segment. A
 * third party retelling his story («قصة فلان», «عن فلان», or a description
 * that only narrates him) is NOT a speaker. Pure.
 */
export function pageSpeaker(page: SourcePage, variants: string[]): SpeakerFinding | null {
  const found = findSpeaker(page, variants)
  return found ? { ...found, cue: cap(found.cue.trim(), PAGE_CUE_MAX) } : null
}

function findSpeaker(page: SourcePage, variants: string[]): SpeakerFinding | null {
  if (!variants.length || !pageNamesPerson(page, variants)) return null
  if (ownAuthor(page, variants)) {
    return { basis: page.via === "html" ? "byline" : "own_channel", cue: page.author ?? "" }
  }
  const titleSegs = segments(page.title)
  const interview = pageHasInterviewCue(page)
  if (titleSegs.some((s) => guestCue(s, variants, true, interview))) return { basis: "guest", cue: page.title }
  if (bareNameEpisodeTitle(titleSegs, variants)) return { basis: "guest", cue: page.title }
  for (const s of page.title.split(/[\n|]+/)) {
    if (quotedHeadline(s, variants)) return { basis: "quoted", cue: s.trim() }
  }
  const titleTokens = foldVerbatim(page.title).split(" ")
  if (
    titleTokens.some(isFirstPersonToken) &&
    titleSegs.some((s) => variants.includes(foldVerbatim(s)))
  ) {
    return { basis: "quoted", cue: page.title }
  }
  for (const s of segments(page.text).slice(0, 400)) {
    if (guestCue(s, variants, false)) return { basis: "guest", cue: s.slice(0, 240) }
  }
  for (const s of page.text.split(/[\n.!?؟]+/).slice(0, 400)) {
    if (quotedHeadline(s, variants)) return { basis: "quoted", cue: s.trim().slice(0, 240) }
  }
  return null
}

/**
 * A bounded excerpt of the page for the model to quote from: the sentences
 * that name him first (when `variants` is given), then the opening. Real page
 * text only.
 */
export function pageExcerpt(page: SourcePage, variants: string[] | null, maxChars = 1_500): string {
  const sents = page.text.split(/(?<=[.!?؟\n])\s*/).map((s) => s.trim()).filter(Boolean)
  const picked: string[] = []
  let used = 0
  const take = (s: string) => {
    if (used >= maxChars || picked.includes(s)) return
    const cut = s.slice(0, maxChars - used)
    picked.push(cut)
    used += cut.length + 1
  }
  if (variants?.length) for (const s of sents) if (mentionsName(s, variants)) take(s)
  for (const s of sents) take(s)
  return picked.join(" ")
}

// ─── Impure: fetching ───────────────────────────────────────────────────────

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

/** An IPv6 address as its 8 hextets (handles «::» and a dotted IPv4 tail), or null. */
function ipv6Hextets(ip: string): number[] | null {
  let s = ip.toLowerCase()
  const zone = s.indexOf("%")
  if (zone >= 0) s = s.slice(0, zone)
  const last = s.lastIndexOf(":")
  const tail = s.slice(last + 1)
  if (tail.includes(".")) {
    if (isIP(tail) !== 4) return null
    const [a, b, c, d] = tail.split(".").map(Number)
    s = `${s.slice(0, last + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = s.split("::")
  if (halves.length > 2) return null
  const part = (x: string) => (x ? x.split(":") : [])
  const head = part(halves[0])
  const rest = halves.length === 2 ? part(halves[1]) : []
  const fill = 8 - head.length - rest.length
  if (halves.length === 1 ? head.length !== 8 : fill < 0) return null
  const all = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...rest]
  const nums = all.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN))
  return nums.length === 8 && nums.every((n) => Number.isInteger(n)) ? nums : null
}

const v4Of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`

/**
 * Loopback, private, link-local (incl. the cloud metadata address), CGNAT,
 * multicast, ULA — and every IPv6 spelling that carries a private IPv4:
 * mapped (::ffff:7f00:1 — what `new URL` makes of [::ffff:127.0.0.1]),
 * IPv4-compatible (::7f00:1), NAT64 (64:ff9b::/96) and 6to4 (2002::/16).
 * Teredo, NAT64 local-use and documentation ranges are refused outright.
 */
export function isPrivateAddress(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "")
  const v = isIP(ip.split("%")[0])
  if (v === 4) return isPrivateV4(ip)
  if (v !== 6) return true
  const h = ipv6Hextets(ip)
  if (!h) return true
  const zero = (from: number, to: number) => h.slice(from, to).every((x) => x === 0)
  if (zero(0, 5) && h[5] === 0xffff) return isPrivateV4(v4Of(h[6], h[7])) // mapped
  if (zero(0, 6)) return isPrivateV4(v4Of(h[6], h[7])) // compatible, ::, ::1
  if (h[0] === 0x64 && h[1] === 0xff9b) return zero(2, 6) ? isPrivateV4(v4Of(h[6], h[7])) : true // NAT64
  if (h[0] === 0x2002) return isPrivateV4(v4Of(h[1], h[2])) // 6to4
  if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0xdb8)) return true // Teredo, documentation
  if (h[0] === 0x100 && zero(1, 4)) return true // discard-only
  return (h[0] & 0xfe00) === 0xfc00 || (h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0 || (h[0] & 0xff00) === 0xff00
}

/** Shape rules checked before any request; the ADDRESS is checked at connect time. */
function assertPublicUrl(u: URL): void {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme")
  if (u.username || u.password) throw new Error("credentials in url")
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("port")
  const host = u.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || /\.(local|internal|localhost)$/i.test(host)) throw new Error("local host")
  // An IP literal is connected to without a lookup — check it here.
  if (isIP(host) && isPrivateAddress(host)) throw new Error("private address")
}

class PrivateAddressError extends Error {
  code = "EPRIVATE"
}

/**
 * The DNS lookup the socket itself uses: resolves, then refuses the
 * connection if ANY address is private. Checking in the connect path (not
 * before it) closes the rebinding window — the name cannot resolve public
 * for the check and private for the connect.
 */
export const pinnedLookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
  dns.lookup(hostname, { all: true, family: options?.family ?? 0 }, (err, addresses) => {
    if (err) return callback(err)
    const list = addresses as dns.LookupAddress[]
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(new PrivateAddressError(`private address for ${hostname}`))
    }
    if (options?.all) return callback(null, list)
    return callback(null, list[0].address, list[0].family)
  })
}) as unknown as LookupFunction

export interface PageResponse {
  status: number
  location: string | null
  contentType: string
  /** Read only for a 2xx HTML/XML page; empty otherwise. Decompressed, capped. */
  body: Uint8Array
}

/**
 * One GET with the pinned lookup, no redirect following, a byte cap on the
 * DECOMPRESSED body, and the caller's abort signal. Rejects on any error.
 */
export function pinnedRequest(url: URL, signal: AbortSignal, maxBytes: number): Promise<PageResponse> {
  const mod = url.protocol === "https:" ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: pinnedLookup,
        signal,
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ar,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0
        const contentType = String(res.headers["content-type"] ?? "")
        const location = typeof res.headers.location === "string" ? res.headers.location : null
        const empty = () => {
          res.destroy()
          resolve({ status, location, contentType, body: new Uint8Array() })
        }
        if (status < 200 || status >= 300 || !/html|xml/i.test(contentType)) return empty()
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase()
        const stream: Readable =
          enc === "gzip" || enc === "x-gzip"
            ? res.pipe(zlib.createGunzip())
            : enc === "deflate"
              ? res.pipe(zlib.createInflate())
              : enc === "br"
                ? res.pipe(zlib.createBrotliDecompress())
                : res
        const chunks: Buffer[] = []
        let total = 0
        let done = false
        const finish = () => {
          if (done) return
          done = true
          res.destroy()
          if (stream !== res) stream.destroy()
          resolve({ status, location, contentType, body: new Uint8Array(Buffer.concat(chunks).subarray(0, maxBytes)) })
        }
        stream.on("data", (c: Buffer) => {
          chunks.push(c)
          total += c.length
          if (total >= maxBytes) finish()
        })
        stream.on("end", finish)
        stream.on("error", (e) => (done ? undefined : ((done = true), reject(e))))
        res.on("error", (e) => (done ? undefined : ((done = true), reject(e))))
      },
    )
    req.on("error", reject)
    req.end()
  })
}

function decodeBody(bytes: Uint8Array, contentType: string): string {
  const label = contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? "utf-8"
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return new TextDecoder("utf-8").decode(bytes)
  }
}

async function getJson(url: string, signal: AbortSignal, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal })
  if (!res.ok) return null
  return res.json()
}

/** YouTube metadata — fixed Google hosts only, so plain fetch. Capped like any page. */
async function readYouTube(id: string, signal: AbortSignal): Promise<SourcePage | null> {
  const key = env.YOUTUBE_API_KEY
  if (key) {
    try {
      const j = (await getJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}`, signal, {
        "X-goog-api-key": key,
        Referer: "https://khatpodcast.com",
      })) as { items?: Array<{ snippet?: { title?: string; description?: string; channelTitle?: string } }> } | null
      const sn = j?.items?.[0]?.snippet
      if (sn?.title) {
        return {
          title: cap(sn.title, PAGE_TITLE_MAX),
          author: sn.channelTitle ? cap(sn.channelTitle, PAGE_AUTHOR_MAX) : null,
          text: (sn.description ?? "").slice(0, PAGE_MAX_TEXT),
          via: "youtube_api",
        }
      }
    } catch {
      // fall through to oEmbed
    }
  }
  try {
    const watch = `https://www.youtube.com/watch?v=${id}`
    const j = (await getJson(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
      signal,
    )) as { title?: string; author_name?: string } | null
    if (!j?.title) return null
    return {
      title: cap(j.title, PAGE_TITLE_MAX),
      author: j.author_name ? cap(j.author_name, PAGE_AUTHOR_MAX) : null,
      text: "",
      via: "youtube_oembed",
    }
  } catch {
    return null
  }
}

async function readHtml(url: string, signal: AbortSignal, request: typeof pinnedRequest): Promise<SourcePage | null> {
  let current = new URL(url)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertPublicUrl(current) // every hop — a redirect is just another URL
    const res = await request(current, signal, PAGE_MAX_BYTES)
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) return null
      current = new URL(res.location, current)
      continue
    }
    if (res.status < 200 || res.status >= 300 || !/html|xml/i.test(res.contentType)) return null
    const page = parseHtmlPage(decodeBody(res.body, res.contentType))
    return page.title || page.text ? page : null
  }
  return null
}

/**
 * Read one source page. Never throws: `null` = could not be read (timeout,
 * non-HTML, blocked, private address, dead) — which proves nothing either way.
 * `deps.request` is for tests.
 */
export async function fetchSourcePage(
  url: string,
  timeoutMs = PAGE_FETCH_TIMEOUT_MS,
  deps: { request?: typeof pinnedRequest } = {},
): Promise<SourcePage | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(0, timeoutMs))
  try {
    const yt = youtubeVideoId(url)
    return yt ? await readYouTube(yt, ctrl.signal) : await readHtml(url, ctrl.signal, deps.request ?? pinnedRequest)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Page reads in flight at once, per call. */
export const PAGE_FETCH_CONCURRENCY = 5

/**
 * Attach the page to every live web source that has not been read yet —
 * at most PAGE_FETCH_CONCURRENCY at a time, all bounded by `deadlineAt` (and
 * PAGE_FETCH_TIMEOUT_MS each). A source left unread (no time) keeps `page`
 * absent; a failed read gets `null`. Never throws.
 */
export async function attachSourcePages(
  sources: StorySource[],
  opts: { deadlineAt: number; fetchPage?: typeof fetchSourcePage },
): Promise<StorySource[]> {
  const fetchPage = opts.fetchPage ?? fetchSourcePage
  const urls = [...new Set(sources.filter((s) => s.kind === "web" && s.verified && s.page === undefined).map((s) => s.url))]
  const read = new Map<string, SourcePage | null>()
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++]
      const left = opts.deadlineAt - Date.now()
      if (left < PAGE_FETCH_MIN_MS) continue
      read.set(url, await fetchPage(url, Math.min(PAGE_FETCH_TIMEOUT_MS, left)).catch(() => null))
    }
  }
  await Promise.all(Array.from({ length: Math.min(PAGE_FETCH_CONCURRENCY, urls.length) }, worker))
  return sources.map((s) => (read.has(s.url) ? { ...s, page: read.get(s.url) ?? null } : s))
}
