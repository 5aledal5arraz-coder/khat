/**
 * Story transcripts — the readable body of a story page. SERVER ONLY.
 *
 * Produced by `scripts/build-story-transcript.ts` and read from disk. THIS IS
 * DELIBERATELY NOT THE DATABASE YET. The pilot exists to answer one question —
 * does a KHAT episode read well as a page — and a file keeps that question
 * separate from a migration. When the shape is settled the loader moves to
 * `studio_analysis_records` (kind: "transcript"), and only this module changes.
 *
 * Read at request time, not imported: a 1.2 MB JSON per episode has no business
 * in the client bundle, and 41 of them have no business in the server one
 * either.
 *
 * The types and the pure helpers live in `./story` because the reader is a
 * client component — see the note there.
 */
import "server-only"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { StoryTranscript } from "./story"

export type { StoryTranscript, StoryParagraph, StoryChapter } from "./story"
export { formatStoryTime, groupByChapter } from "./story"

/**
 * The transcript for a YouTube video id, or null when none was built.
 *
 * Null is a normal answer, not an error: most episodes have no transcript yet,
 * and the page must 404 rather than render an empty article.
 */
export interface StoryQuote {
  /** Verbatim — proved against the transcript before the file was written. */
  text: string
  start: number
  speaker: string
  why: string
}

/**
 * The verbatim pull-quotes for an episode, or null when none were extracted.
 *
 * Produced by `scripts/extract-story-quotes.ts`, which selects sentences out of
 * the transcript and refuses to save anything it cannot find there again. That
 * refusal is the whole point: the quotes this replaces were written FOR the
 * guests rather than by them — «تجربة الأسر علمتني قيمة الحياة والحرية» appears
 * nowhere in صلاح الغزالي's 19,683 words.
 */
export async function getStoryQuotes(videoId: string): Promise<StoryQuote[] | null> {
  if (!/^[\w-]{11}$/.test(videoId)) return null
  try {
    const raw = await readFile(
      join(process.cwd(), "content", "stories", `${videoId}.quotes.json`),
      "utf8",
    )
    const doc = JSON.parse(raw) as { quotes?: StoryQuote[] }
    return Array.isArray(doc.quotes) && doc.quotes.length > 0 ? doc.quotes : null
  } catch {
    return null
  }
}

export async function getStoryTranscript(videoId: string): Promise<StoryTranscript | null> {
  // The id comes from a URL. Anything but a YouTube id is a traversal attempt.
  if (!/^[\w-]{11}$/.test(videoId)) return null
  try {
    const raw = await readFile(
      join(process.cwd(), "content", "stories", `${videoId}.json`),
      "utf8",
    )
    const doc = JSON.parse(raw) as StoryTranscript
    return Array.isArray(doc.paragraphs) && doc.paragraphs.length > 0 ? doc : null
  } catch {
    return null
  }
}
