"use client"

import { useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePlayer } from "./episode-player-context"
import {
  formatStoryTime,
  foldWithMap,
  fold,
  type StoryChapter,
  type StoryParagraph,
} from "@/lib/stories/story"

/**
 * The conversation as words, on the episode page itself.
 *
 * MERGED HERE RATHER THAN LEFT ON ITS OWN URL, on Khaled's call. The pilot ran
 * at /stories/[slug]; two pages for one episode split the links, the sharing and
 * whatever Search Console eventually reports, and the visitor has to be told the
 * second one exists. One address holds the video, the index and the text.
 *
 * IT DOES NOT OWN A PLAYER. The page already has one, and `usePlayer().seekTo`
 * now starts it when a timestamp is clicked before anyone has pressed play —
 * that fix is in `episode-player-context.tsx` and is what made the merge safe.
 *
 * Everything below the search field is the same reading surface the pilot
 * proved out: paragraphs with speakers, a timestamp per paragraph, and Arabic
 * search that folds hamza and ta-marbuta so «الاسر» finds «الأسر».
 */

interface Props {
  paragraphs: StoryParagraph[]
  chapters: StoryChapter[]
  hostName: string
  /** Shown once, above the text — the words are machine-recognised. */
  wordCount: number
}

export function EpisodeTranscriptSection({ paragraphs, chapters, hostName, wordCount }: Props) {
  const { seekTo } = usePlayer()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)

  const folded = useMemo(() => paragraphs.map((p) => fold(p.text)), [paragraphs])
  const q = query.trim()
  const matches = useMemo(() => {
    if (q.length < 2) return null
    const needle = fold(q)
    return paragraphs.filter((_, i) => folded[i].includes(needle))
  }, [q, paragraphs, folded])

  // Searching has to reveal the text even when it is collapsed, or the field
  // returns a count against a section the reader cannot see.
  const showing = open || matches !== null

  const groups = useMemo(() => {
    const sorted = [...chapters].sort((a, b) => a.start - b.start)
    const out: { chapter: StoryChapter | null; items: StoryParagraph[] }[] = []
    const before = sorted.length ? paragraphs.filter((p) => p.start < sorted[0].start) : []
    if (before.length) out.push({ chapter: null, items: before })
    sorted.forEach((ch, i) => {
      const next = sorted[i + 1]
      const items = paragraphs.filter(
        (p) => p.start >= ch.start && (!next || p.start < next.start),
      )
      if (items.length) out.push({ chapter: ch, items })
    })
    if (!out.length) out.push({ chapter: null, items: paragraphs })
    return out
  }, [paragraphs, chapters])

  return (
    <section id="sec-transcript" className="scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lead font-semibold">نص الحلقة</h2>
        <span className="text-micro text-muted-foreground">
          {wordCount.toLocaleString("en-US")} كلمة
        </span>
      </div>

      {/* SEARCH IS THE REASON THIS IS USABLE AT ALL. Measured on the pilot, the
          text is 66,984px on a 375px phone — 82.5 screens. One query takes it
          to 7,808. A reference you cannot ask a question of is not a reference. */}
      <label className="relative mt-4 block">
        <Search className="pointer-events-none absolute inset-y-0 my-auto h-4 w-4 text-muted-foreground start-3" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث في نص الحلقة…"
          aria-label="ابحث في نص الحلقة"
          // 16px floor or iOS zooms the page on focus — 78% of this audience
          // is on a phone. `--ui-field` is the max() that guarantees it.
          className="w-full rounded-xl border border-border bg-card py-2 text-field text-foreground placeholder:text-muted-foreground/50 ps-9 pe-9 focus:border-primary focus:outline-none md:text-control"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="امسح البحث"
            className="absolute inset-y-0 my-auto flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground end-2"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </label>

      {matches && (
        <p className="mt-2 text-micro text-muted-foreground">
          {matches.length === 0 ? `لا شيء يطابق «${q}»` : `${matches.length} نتيجة`}
        </p>
      )}

      {!showing && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 w-full rounded-xl border border-border bg-card/40 px-4 py-3 text-caption font-semibold text-primary transition-colors hover:bg-secondary"
        >
          اعرض النص كاملاً
        </button>
      )}

      {showing && (
        <>
          <p className="mt-4 rounded-xl border border-border bg-secondary/60 px-4 py-3 text-micro leading-relaxed text-muted-foreground">
            هذا النص مُفرَّغ آلياً من صوت الحلقة ومُرقَّم بمساعدة الذكاء الاصطناعي — الكلام كما
            قيل، دون إعادة صياغة. قد تجد أخطاء في التعرّف على بعض الكلمات، والفيديو هو
            المرجع. اضغط أي توقيت لتسمع الكلام بصوت صاحبه.
          </p>

          <div className="mt-6">
            {matches !== null
              ? matches.map((p, i) => (
                  <Line key={`m-${p.start}-${i}`} p={p} isHost={p.speaker === hostName} onSeek={seekTo} needle={q} />
                ))
              : groups.map((g, gi) => (
                  <div key={g.chapter ? g.chapter.start : `open-${gi}`} className="mb-8">
                    {g.chapter && (
                      <h3 className="mb-4 border-b border-border pb-2 text-body font-bold text-foreground">
                        {g.chapter.title}
                      </h3>
                    )}
                    {g.items.map((p, i) => (
                      <Line key={`${p.start}-${i}`} p={p} isHost={p.speaker === hostName} onSeek={seekTo} needle="" />
                    ))}
                  </div>
                ))}
          </div>

          {matches === null && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-xl border border-border bg-card/40 px-4 py-3 text-caption font-semibold text-muted-foreground transition-colors hover:bg-secondary"
            >
              أخفِ النص
            </button>
          )}
        </>
      )}
    </section>
  )
}

function Line({
  p,
  isHost,
  onSeek,
  needle,
}: {
  p: StoryParagraph
  isHost: boolean
  onSeek: (s: number) => void
  needle: string
}) {
  // Marking runs on the folded string but is applied to the original through
  // the offset map, so a search for «الاسر» highlights «الأسر» as spoken.
  const parts = useMemo(() => {
    if (!needle) return null
    const { folded, map } = foldWithMap(p.text)
    const n = fold(needle)
    if (!n) return null
    const out: { text: string; hit: boolean }[] = []
    let cursor = 0
    let from = 0
    for (;;) {
      const at = folded.indexOf(n, from)
      if (at === -1) break
      const s = map[at]
      const e = map[at + n.length]
      if (s > cursor) out.push({ text: p.text.slice(cursor, s), hit: false })
      out.push({ text: p.text.slice(s, e), hit: true })
      cursor = e
      from = at + n.length
    }
    if (!out.length) return null
    if (cursor < p.text.length) out.push({ text: p.text.slice(cursor), hit: false })
    return out
  }, [p.text, needle])

  return (
    <div className="mb-5">
      <div className="mb-1 flex items-baseline gap-2">
        <button
          type="button"
          onClick={() => onSeek(p.start)}
          aria-label={`شغّل من ${formatStoryTime(p.start)}`}
          className="font-mono text-micro tabular-nums text-muted-foreground/60 transition-colors hover:text-accent"
        >
          {formatStoryTime(p.start)}
        </button>
        <span className={cn("text-micro font-bold", isHost ? "text-muted-foreground" : "text-accent")}>
          {p.speaker}
        </span>
      </div>
      <p
        className={cn(
          "text-pretty text-body leading-prose",
          isHost ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {parts
          ? parts.map((s, i) =>
              s.hit ? (
                <mark key={i} className="rounded-sm bg-accent/20 px-0.5 text-foreground">
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )
          : p.text}
      </p>
    </div>
  )
}
