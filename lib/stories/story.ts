/**
 * The story transcript's SHAPE and its pure helpers — no filesystem, no
 * database, importable from a client component.
 *
 * This file exists because the first version did not. `story-reader.tsx` is a
 * client component and it needs the types and `formatStoryTime`; when those
 * lived beside the `node:fs/promises` loader, Turbopack followed the import
 * and tried to bundle `fs` for the browser. The page rendered as a black
 * screen with a 500 behind it. Anything the reader touches belongs here;
 * anything that reads a file belongs in `transcripts.ts`.
 */

export interface StoryParagraph {
  /** Seconds into the video, from the caption cue — never estimated. */
  start: number
  speaker: string
  text: string
}

export interface StoryChapter {
  title: string
  start: number
}

export interface StoryTranscript {
  videoId: string
  episodeSlug: string
  episodeTitle: string
  guestName: string
  captionTrack: string
  generatedAt: string
  model: string
  cueCount: number
  wordCount: number
  paragraphs: StoryParagraph[]
  chapters: StoryChapter[]
}

/**
 * Arabic search has to be normalised or it does not work.
 *
 * A reader looking for «الأسر» types it with or without the hamza; the speech
 * recogniser wrote «الاسر». `أ إ آ` fold to `ا`, `ة` to `ه`, `ى` to `ي`, and
 * tashkeel and tatweel are dropped — the transcript carries almost none but the
 * QUERY may, because Arabic keyboards put tashkeel one long-press away. Without
 * this, searching a 19,683-word page silently returns nothing and reads as "the
 * word isn't in the episode".
 *
 * Lives here, not in a component, because both reading surfaces need it and two
 * copies would drift.
 */
const DROPPED = /[ً-ْٰـ]/

function foldChar(ch: string): string {
  if (DROPPED.test(ch)) return ""
  if ("إأآٱ".includes(ch)) return "ا"
  if (ch === "ة") return "ه"
  if (ch === "ى") return "ي"
  return ch.toLowerCase()
}

export function fold(s: string): string {
  let out = ""
  for (const ch of s) out += foldChar(ch)
  return out
}

/**
 * Folded text plus, for every folded character, where it came from.
 *
 * Folding DELETES characters, so an offset in the folded string is not an
 * offset in the original. Highlighting by the folded index without this map
 * lands on the wrong letters the moment a word carries one tashkeel mark —
 * measured, 6 of 10 hits for «الأسر» could not be marked at all under an
 * earlier length-equality bail-out.
 */
export function foldWithMap(s: string): { folded: string; map: number[] } {
  let folded = ""
  const map: number[] = []
  let i = 0
  for (const ch of s) {
    const f = foldChar(ch)
    for (let k = 0; k < f.length; k++) {
      folded += f[k]
      map.push(i)
    }
    i += ch.length
  }
  map.push(s.length)
  return { folded, map }
}

/** `H:MM:SS` above the hour, `M:SS` below — the form YouTube itself prints. */
export function formatStoryTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`
}

/**
 * Paragraphs grouped under the chapter they fall in.
 *
 * A chapter with no paragraphs is dropped, and anything before the first
 * chapter's start is carried in a leading group with no title — the cold open
 * is content, and silently discarding it would lose the first words of the
 * episode (which on 015 are the strongest words in it).
 */
export function groupByChapter(
  paragraphs: StoryParagraph[],
  chapters: StoryChapter[],
): { chapter: StoryChapter | null; paragraphs: StoryParagraph[] }[] {
  const sorted = [...chapters].sort((a, b) => a.start - b.start)
  const groups: { chapter: StoryChapter | null; paragraphs: StoryParagraph[] }[] = []

  const before = sorted.length > 0 ? paragraphs.filter((p) => p.start < sorted[0].start) : []
  if (before.length > 0) groups.push({ chapter: null, paragraphs: before })

  for (const [i, ch] of sorted.entries()) {
    const next = sorted[i + 1]
    const inChapter = paragraphs.filter(
      (p) => p.start >= ch.start && (next === undefined || p.start < next.start),
    )
    if (inChapter.length > 0) groups.push({ chapter: ch, paragraphs: inChapter })
  }

  // No chapters at all (or none that matched) — one untitled group, never an
  // empty page.
  if (groups.length === 0) groups.push({ chapter: null, paragraphs })
  return groups
}
