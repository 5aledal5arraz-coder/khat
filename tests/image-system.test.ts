/**
 * The image system: one episode frame, one guest portrait, one empty state.
 *
 * TWO KINDS OF TEST LIVE HERE, and the second kind is the point.
 *
 * The behaviour tests below prove the source ladder and the clip filter. But
 * the faults this wave fixed were not wrong return values — they were the same
 * picture drawn four different ways in four files, and a fallback that did not
 * exist anywhere. No unit test can fail for that. So the second half walks the
 * source tree and asserts on what the components CONTAIN.
 *
 * Tree guards are only worth their runtime if they can fail, so each one is
 * written to be sharp in both directions: it names the exact string that used
 * to be there, and `it("the walk actually reads files")` fails if the walk
 * itself ever stops visiting anything — the failure mode that turns a guard
 * into decoration. (`.next/`, `.claude/worktrees/` and `node_modules` are
 * skipped explicitly; a `git grep` here would have read all three.)
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

import { episodeThumbSources } from "@/lib/episodes/thumbnail"
import { isClip, mainFeed, CLIPS_CATEGORY_SLUG } from "@/lib/episodes/clips"
import type { Episode } from "@/types/database"

const ROOT = process.cwd()

function ep(over: Partial<Episode> = {}): Episode {
  return {
    id: "e1",
    title: "حلقة",
    slug: "حلقة",
    description: null,
    summary: null,
    key_takeaways: null,
    youtube_url: "https://www.youtube.com/watch?v=oNyFz82BVzY",
    duration_minutes: 60,
    release_date: "2025-01-01",
    episode_number: null,
    season: null,
    mood: null,
    thumbnail_url: null,
    category_id: null,
    created_at: "2025-01-01T00:00:00.000Z",
    ...over,
  } as Episode
}

// ─── The source ladder ───────────────────────────────────────────────────────

describe("episodeThumbSources", () => {
  it("prefers the stored thumbnail_url over a rebuilt YouTube URL", () => {
    // The whole point of the column: an editor can override the frame.
    // `components/episodes/episode-card.tsx` ignored it and rebuilt the URL.
    const sources = episodeThumbSources(
      ep({ thumbnail_url: "https://cdn.khat/custom.jpg" }),
    )
    expect(sources[0]).toBe("https://cdn.khat/custom.jpg")
  })

  it("falls back maxresdefault → hqdefault", () => {
    // Measured against the CDN: jNQXAC9IVRw returns 404 for maxres and 200 for
    // hq, so this ladder is the difference between a frame and a broken image.
    expect(episodeThumbSources(ep())).toEqual([
      "https://i.ytimg.com/vi/oNyFz82BVzY/maxresdefault.jpg",
      "https://i.ytimg.com/vi/oNyFz82BVzY/hqdefault.jpg",
    ])
  })

  it("does not list the stored maxres URL twice", () => {
    // All 41 published rows store exactly the URL the rebuild produces, so
    // without the dedupe every card would retry an identical failing source.
    const stored = "https://i.ytimg.com/vi/oNyFz82BVzY/maxresdefault.jpg"
    const sources = episodeThumbSources(ep({ thumbnail_url: stored }))
    expect(sources).toEqual([
      stored,
      "https://i.ytimg.com/vi/oNyFz82BVzY/hqdefault.jpg",
    ])
  })

  it("keeps a custom thumbnail AND the YouTube ladder behind it", () => {
    const sources = episodeThumbSources(
      ep({ thumbnail_url: "https://cdn.khat/custom.jpg" }),
    )
    expect(sources).toHaveLength(3)
  })

  it("returns nothing when there is no usable source", () => {
    // → the shared «ط» panel, not a broken <img>.
    expect(episodeThumbSources(ep({ youtube_url: "https://example.com/x" }))).toEqual([])
  })
})

// ─── Clips out of the main feed ──────────────────────────────────────────────

const conversation = ep({
  id: "c1",
  category: { id: "cat-1", name: "الموسم الاول", slug: "الموسم-الاول" },
} as Partial<Episode>)
const clip = ep({
  id: "k1",
  category: { id: "cat-2", name: "مقاطع خط", slug: CLIPS_CATEGORY_SLUG },
} as Partial<Episode>)

describe("mainFeed", () => {
  it("recognises a clip by its category slug", () => {
    expect(isClip(clip)).toBe(true)
    expect(isClip(conversation)).toBe(false)
  })

  it("drops clips from the default feed", () => {
    expect(mainFeed([clip, conversation, clip]).map((e) => e.id)).toEqual(["c1"])
  })

  it("never returns the caller's array, because callers sort in place", () => {
    // `/episodes` does `mainFeed(list).sort(...)` on the unstable_cache array
    // shared by every request on this server.
    const list = [conversation]
    expect(mainFeed(list)).not.toBe(list)
  })

  it("says so — loudly — when the list was fetched without categories", () => {
    // The silent-failure shape this codebase keeps hitting: with `category`
    // unresolved, filtering by it removes nothing and looks exactly like
    // "there are no clips". It must warn and pass the list through.
    const warnings: unknown[][] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => warnings.push(args)
    try {
      const raw = [ep({ id: "r1" }), ep({ id: "r2" })]
      expect(mainFeed(raw)).toHaveLength(2)
      expect(warnings).toHaveLength(1)
      expect(String(warnings[0][0])).toContain("withCategories")
    } finally {
      console.warn = original
    }
  })

  it("is silent and correct on an empty list", () => {
    expect(mainFeed([])).toEqual([])
  })
})

// ─── What the source tree may and may not contain ────────────────────────────

const SKIP = new Set([
  "node_modules",
  ".next",
  ".git",
  ".claude", // holds worktrees — copies of this repo, complete with the old code
  "drizzle",
  "public",
  "coverage",
])

/**
 * Source with every comment removed.
 *
 * THIS IS THE WHOLE DIFFERENCE between a guard and a tripwire. Each rule below
 * names the exact string it forbids — `grayscale`, `guestInitials`,
 * `museum-frame` — and the files that removed those things now EXPLAIN why they
 * removed them, in a comment, using the word. A raw substring match therefore
 * failed on `components/media/episode-thumb.tsx` for containing the sentence
 * that says it does not desaturate. Same shape as the brand guard's `code()`:
 * assert on what compiles, not on what a reader reads.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block + JSX comments
    .replace(/^[ \t]*\/\/.*$/gm, " ") // whole-line //
    .replace(/([^:"'`\\])\/\/[^\n"'`]*$/gm, "$1") // trailing // (not a URL)
}

/** Every `.ts`/`.tsx` file we ship, as `[relative path, comment-free source]`. */
function sourceFiles(): [string, string][] {
  const out: [string, string][] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP.has(entry)) continue
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue
      out.push([path.relative(ROOT, full), code(readFileSync(full, "utf8"))])
    }
  }
  walk(ROOT)
  return out
}

/** Public site only — `app/admin` is a separate surface with its own rules. */
function publicFiles(): [string, string][] {
  return sourceFiles().filter(
    ([rel]) =>
      (rel.startsWith("app/") || rel.startsWith("components/") || rel.startsWith("lib/")) &&
      !rel.startsWith("app/admin/") &&
      !rel.startsWith("components/media-kit/"),
  )
}

describe("the tree guards below can actually fail", () => {
  it("the walk actually reads files", () => {
    // Without this, a broken SKIP set or a renamed folder turns every guard in
    // this block into a test that passes on zero input.
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(300)
    expect(publicFiles().length).toBeGreaterThan(100)
  })

  it("reads the very files these guards are about", () => {
    const names = sourceFiles().map(([rel]) => rel)
    expect(names).toContain("components/media/episode-thumb.tsx")
    expect(names).toContain("components/media/guest-portrait.tsx")
    expect(names).toContain("components/episodes/episode-poster-card.tsx")
  })
})

describe("no initials anywhere", () => {
  it("the helper is gone from the whole tree", () => {
    // It produced «اا» for «الدكتور الحارث المزيدي», live on the site: Arabic
    // family names start with «ال», so the second initial is «ا» for most of
    // them. Restyling it was never the fix — the mechanism is wrong here.
    const hits = sourceFiles()
      .filter(([rel]) => rel !== "tests/image-system.test.ts")
      .filter(([, src]) => src.includes("guestInitials"))
      .map(([rel]) => rel)
    expect(hits).toEqual([])
  })

  it("no component was left rendering a two-letter name fragment", () => {
    const hits = publicFiles()
      .filter(([, src]) => /\.slice\(0,\s*2\)\.join\(""\)/.test(src))
      .map(([rel]) => rel)
    expect(hits).toEqual([])
  })

  it("the old avatar component is not back", () => {
    const hits = sourceFiles()
      .filter(([rel]) => rel !== "tests/image-system.test.ts")
      .filter(([, src]) => src.includes("guests/guest-avatar"))
      .map(([rel]) => rel)
    expect(hits).toEqual([])
  })
})

describe("one saturation policy: full colour", () => {
  it("nothing on the public site desaturates a thumbnail", () => {
    // `grayscale group-hover:grayscale-0` erased the only colour the archive
    // has (the same indigo carries 35 of 41 posters) — and only on the pages
    // that used the other card, so one episode was grey here and coloured
    // there.
    const hits = publicFiles()
      .filter(([rel]) => rel !== "tests/image-system.test.ts")
      .filter(([, src]) => /\bgrayscale\b/.test(src))
      .map(([rel]) => rel)
    expect(hits).toEqual([])
  })

  it("the retired gold frame is gone from the stylesheet", () => {
    // Comments stripped for the same reason as the tree walk: the note that
    // records WHY `.museum-frame` went names the class and the gold it used.
    const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      " ",
    )
    expect(css).not.toMatch(/\.museum-frame/)
    expect(css).not.toContain("rgba(240, 201, 84")
  })
})

describe("one component draws an episode frame", () => {
  it("no public file builds a YouTube thumbnail URL by hand", () => {
    // Four did. They disagreed on host, on quality, on whether `thumbnail_url`
    // was honoured, and on what happened when the frame did not exist.
    const allowed = new Set([
      // The resolver itself — the one place the template lives.
      "lib/episodes/thumbnail.ts",
      // Static seed content: five hardcoded URLs that are the DEFAULT homepage
      // when the DB has no featured rows. Not derived from an episode row, so
      // there is nothing for the resolver to resolve.
      "lib/content/museum-data.ts",
    ])
    const hits = publicFiles()
      .filter(([rel]) => !allowed.has(rel))
      .filter(([, src]) => /(img\.youtube\.com|i\.ytimg\.com)\/vi\//.test(src))
      .map(([rel]) => rel)
    expect(hits).toEqual([])
  })

  it("every EpisodeThumb call site states its rendered size", () => {
    // `fill` without `sizes` requests a 100vw source for a third-of-a-row card.
    // The prop is required by the type; this catches the call sites, and would
    // fail the moment someone gives it a default to silence the compiler.
    const callSites = publicFiles()
      .filter(([rel]) => rel !== "components/media/episode-thumb.tsx")
      .filter(([, src]) => src.includes("<EpisodeThumb"))
    expect(callSites.length).toBeGreaterThanOrEqual(4)
    for (const [rel, src] of callSites) {
      for (const call of src.split("<EpisodeThumb").slice(1)) {
        expect(call.slice(0, call.indexOf("/>")), rel).toContain("sizes=")
      }
    }
  })
})

describe("one corner on every 16:9 frame", () => {
  /**
   * Measured before this wave: the box that CLIPS an episode or video frame had
   * four different radii depending on which file drew it —
   *   0px   `.museum-frame`, on /guests/[slug], /topics/[slug], recommendations
   *   8px   `rounded-lg`, the inline teaser's mini poster
   *   12px  `rounded-xl`, the episode player, the guest's testimonial video,
   *         and the quote page's card (inherited from the shared `Card`)
   *   16px  `rounded-2xl`, the poster card, the home featured card, the teaser
   * — plus `rounded-full` on the guest avatar, which is now a rounded square.
   * They are all `rounded-2xl` now, and this fails if one drifts back.
   */
  /**
   * Each needle names the element that actually CLIPS the frame — the one
   * carrying `overflow-hidden`. For the two card surfaces that is the card
   * itself, not the inner `aspect-video` box: the image is flush to the card's
   * edge, so the card's corner is the corner a reader sees.
   */
  const FRAME_BOXES: [file: string, needle: string][] = [
    ["components/episodes/episode-poster-card.tsx", "group flex flex-col overflow-hidden"],
    ["app/quotes/[id]/page.tsx", "group overflow-hidden"],
    ["components/episodes/youtube-embed.tsx", "relative w-full overflow-hidden"],
    ["components/episodes/youtube-embed.tsx", "relative aspect-video w-full overflow-hidden"],
    ["components/episodes/guest-intro-section.tsx", "relative aspect-video max-w-md"],
    ["components/teaser/teaser-inline.tsx", "relative aspect-video w-28"],
    ["components/teaser/teaser-section.tsx", "relative aspect-video overflow-hidden"],
    ["app/page.tsx", "relative aspect-video overflow-hidden"],
  ]

  it.each(FRAME_BOXES)("%s clips its frame at rounded-2xl", (file, needle) => {
    const src = readFileSync(path.join(ROOT, file), "utf8")
    const at = src.indexOf(needle)
    expect(at, `"${needle}" not found — the guard is pointing at nothing`).toBeGreaterThan(-1)
    // The class list this box carries, i.e. up to the end of its className.
    const box = src.slice(at, src.indexOf('"', at))
    expect(box, file).toContain("rounded-2xl")
  })

  it("the loading skeletons settle into the same corner", () => {
    // A skeleton is a promise about the shape that is coming. Both of these
    // were `rounded-xl` against a `rounded-2xl` card, so every frame on the
    // site changed corner 4px the moment the data landed — the same fault as
    // the 64px circle that settled into an 80px rounded square on /guests.
    for (const file of ["app/loading.tsx", "app/episodes/loading.tsx"]) {
      const src = readFileSync(path.join(ROOT, file), "utf8")
      for (const cls of src.match(/class(?:Name)?="[^"]*aspect-video[^"]*"/g) ?? []) {
        expect(cls, file).not.toMatch(/rounded-(?:sm|md|lg|xl|3xl|full)\b/)
      }
    }
  })

  it("no frame box is left on a different rung", () => {
    for (const [file, needle] of FRAME_BOXES) {
      const src = readFileSync(path.join(ROOT, file), "utf8")
      const box = src.slice(src.indexOf(needle))
      const classList = box.slice(0, box.indexOf('"'))
      expect(classList, file).not.toMatch(/rounded-(?:sm|md|lg|xl|3xl|full)\b/)
    }
  })
})

describe("nothing is drawn over a thumbnail", () => {
  it("the episode card frame holds the image and nothing else", () => {
    // Our 41 posters have the episode title BURNED INTO the artwork, with a
    // third of the frame for the face and two thirds for type. A duration
    // chip, a gradient or a «شاهد الآن» pill lands on words we cannot move.
    const src = readFileSync(
      path.join(ROOT, "components/episodes/episode-poster-card.tsx"),
      "utf8",
    )
    const frame = src.slice(src.indexOf("relative aspect-video"))
    const body = frame.slice(0, frame.indexOf("</div>"))
    expect(body).toContain("<EpisodeThumb")
    expect(body).not.toContain("absolute")
    expect(body).not.toContain("gradient")
  })
})
