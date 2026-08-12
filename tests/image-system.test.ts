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
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { episodeThumbSources } from "@/lib/episodes/thumbnail"
import { isClip, mainFeed, CLIPS_CATEGORY_SLUG } from "@/lib/episodes/clips"
import { EpisodeThumb } from "@/components/media/episode-thumb"
import { GuestPortrait } from "@/components/media/guest-portrait"
import { PlayBadge } from "@/components/media/play-badge"
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

/**
 * An expression that takes the leading character (or the leading two) off
 * something called a name or a title, inside a rendered fragment.
 *
 * Deliberately written against the OPERATION rather than against any spelling
 * of it, because the four spellings we have actually seen in this repo —
 * `.charAt(0)`, `[0]`, `.slice(0, 1)`, `.substring(0, 2)` — are the same bug
 * and the guards that named one of them missed the others.
 *
 * The leading `\{[^{}]*` keeps it to JSX expression containers, i.e. to text a
 * visitor reads; slicing a name in data logic is not what this is about.
 * NOT a `/g` regex: `.test()` on a global regex carries `lastIndex` between
 * calls and would skip files at random.
 */
const LEADING_NAME_LETTER =
  /\{[^{}]*\b\w*(?:[Nn]ame|[Tt]itle)\b(?:\.\w+)*\s*(?:\.charAt\(\s*0\s*\)|\[\s*0\s*\]|\.slice\(\s*0\s*,\s*[12]\s*\)|\.substring\(\s*0\s*,\s*[12]\s*\))/

/** Public site only — `app/admin` is a separate surface with its own rules. */
function publicFiles(): [string, string][] {
  return sourceFiles().filter(
    ([rel]) =>
      (rel.startsWith("app/") || rel.startsWith("components/") || rel.startsWith("lib/")) &&
      !rel.startsWith("app/admin/") &&
      !rel.startsWith("components/media-kit/"),
  )
}

/**
 * The directories the guards below make claims about.
 *
 * `SKIP` matches a BASENAME at any depth, so one word in it can empty several
 * of these at once: adding `"components"` removes `components/` and also
 * `app/admin/components/`, `app/admin/studio/components/` and the rest — 144
 * files — while every rule underneath goes on passing on what is left.
 */
const WALKED_ROOTS = ["app", "components", "lib", "types"] as const

/**
 * `.ts`/`.tsx` under `root`, counted WITHOUT consulting `SKIP` — the whole
 * point is to have a number the walk cannot influence. Only `node_modules` and
 * dot-directories are stepped over, and neither is a directory any guard here
 * asserts about, so nothing can hide behind that exception.
 */
function onDiskCount(root: string): number {
  let n = 0
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (/\.(ts|tsx)$/.test(entry)) n += 1
    }
  }
  walk(path.join(ROOT, root))
  return n
}

describe("the tree guards below can actually fail", () => {
  it("the walk reaches every directory these guards are about", () => {
    // NOT a size threshold. This test used to assert `files.length > 300`,
    // which is decoration: skipping `components/` outright still leaves 1298
    // files — four times the bar — so the walk went green while
    // `grayscale group-hover:grayscale-0` sat live in `episode-thumb.tsx` and
    // the saturation rule below "passed". Measured, both numbers, before this
    // was rewritten.
    //
    // What replaces it is an equality the walk cannot satisfy by accident: for
    // each root, what the walk collected must equal what is on disk. A skipped
    // folder, a rename, or a `SKIP` entry that catches more than it meant to
    // all break it, and the failure names the directory.
    const perRoot = new Map<string, number>()
    for (const [rel] of sourceFiles()) {
      const root = rel.split(path.sep)[0]
      perRoot.set(root, (perRoot.get(root) ?? 0) + 1)
    }
    for (const root of WALKED_ROOTS) {
      expect(perRoot.get(root) ?? 0, `the walk did not read all of ${root}/`).toBe(
        onDiskCount(root),
      )
    }
    // And the derived list the public-site rules run on is not empty either.
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

  it("no public surface takes a leading letter off a name, however it is spelled", () => {
    // THE CLASS, NOT THE LINE — and this is the one the wave missed.
    //
    // The three rules above each name a symbol (`guestInitials`), a call
    // (`.slice(0,2).join("")`) or a module (`guests/guest-avatar`). Deleting
    // the helper satisfied all three, so nothing looked at `app/about/page.tsx`,
    // where the identical mechanism was living inline as
    // `{member.name.charAt(0)}` inside a `rounded-full` gradient. It was a
    // dormant fault — no `teamMembers` in `static_content` today — which is
    // precisely the kind this codebase keeps shipping unseen.
    //
    // So this bans the OPERATION: taking the first character (or the first
    // two) off anything called a name or a title, anywhere a visitor can reach
    // it. In Arabic that character is «ا» for every name that opens with «ال»,
    // which is most of ours; no restyling makes it mean anything.
    //
    // `app/admin/**` is out of scope here for the same reason as every other
    // rule in this file — a separate surface with its own rules. It has two
    // live instances, in `app/admin/preparation/preparation-list-client.tsx`.
    const hits = publicFiles()
      .filter(([, src]) => LEADING_NAME_LETTER.test(src))
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
  /**
   * The two files that may desaturate, and why they are not a hole in this rule.
   *
   * The policy is about OUR imagery: episode posters, guest photographs,
   * thumbnails. A sponsor's logo is the opposite case — someone else's
   * trademark in someone else's palette — and Khaled's standing rule
   * (2026-08-05) is that no colour outside «ملف عرض الشعار» goes on this site.
   * Four foreign palettes at full saturation would make the partner band the
   * loudest thing on a page built on restraint.
   *
   * Named individually, NOT matched by a pattern like /sponsor/: a pattern
   * would quietly widen every time someone names a new file well, and this file
   * exists because a rule that stops seeing is worse than no rule.
   * `tests/sponsors/sponsor-strip.test.ts` asserts the other direction — that
   * these two DO carry the treatment, and that they carry the same one.
   */
  const DESATURATION_ALLOWED = [
    "components/sponsors/sponsor-strip.tsx",
    "components/episodes/episode-sponsor.tsx",
  ]

  it("nothing on the public site desaturates a thumbnail", () => {
    // `grayscale group-hover:grayscale-0` erased the only colour the archive
    // has (the same indigo carries 35 of 41 posters) — and only on the pages
    // that used the other card, so one episode was grey here and coloured
    // there.
    const hits = publicFiles()
      .filter(([rel]) => rel !== "tests/image-system.test.ts")
      .filter(([rel]) => !DESATURATION_ALLOWED.includes(rel))
      .filter(([, src]) => /\bgrayscale\b/.test(src))
      .map(([rel]) => rel)
    expect(hits).toEqual([])
  })

  it("the exception list names only files that exist and still use it", () => {
    // An allow-list entry for a deleted or changed file is how an exception
    // becomes a permanent blind spot. This fails the day either stops being
    // true, which is the day the entry should go.
    const byPath = new Map(publicFiles())
    for (const rel of DESATURATION_ALLOWED) {
      expect(byPath.has(rel), `${rel} is allow-listed but is not a public file`).toBe(true)
      expect(
        /\bgrayscale\b/.test(byPath.get(rel) ?? ""),
        `${rel} no longer desaturates — drop it from the list`,
      ).toBe(true)
    }
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
    ["app/(home)/page.tsx", "relative aspect-video overflow-hidden"],
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
    for (const file of ["app/(home)/loading.tsx", "app/episodes/(list)/loading.tsx"]) {
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

// ─── The two things this wave actually changed ───────────────────────────────

/**
 * Both of the wave's own constants shipped with no coverage at all, and it was
 * provable: `PlayBadge` was moved `h-14 w-14` → `h-12 w-12` and `onError` was
 * deleted from `episode-thumb.tsx`, together, and all 30 tests here passed.
 *
 * They were unreachable for opposite reasons. The badge's size is a className
 * inside a component nothing rendered — fixed below by rendering it, with
 * `react-dom/server`, which is already a dependency; no DOM environment and no
 * new package. The ladder's `onError` is an event handler, which React does
 * not put in markup at all, so it stays a source guard — narrowed to the
 * `<Image>`'s own attribute list rather than a substring on the file.
 */

/** The attribute list of the first `<tag …>` in `src`, up to the `/>`. */
function jsxAttrs(src: string, tag: string): string {
  const at = src.indexOf(`<${tag}`)
  expect(at, `<${tag} not found — this guard is pointing at nothing`).toBeGreaterThan(-1)
  return src.slice(at, src.indexOf("/>", at))
}

describe("one play control, one size", () => {
  it("renders a 56px circle", () => {
    // 56px is the settled size. Six different ones existed before this wave —
    // 64, 56, 48, 48, 44, 40 — so a drift here is not cosmetic, it is the
    // whole reason the component exists.
    const html = renderToStaticMarkup(createElement(PlayBadge))
    expect(html).toContain("h-14 w-14")
    expect(html).not.toMatch(/\bh-(?:8|10|11|12|16|20)\b/)
    // Round on purpose: a transport control is not a portrait, and the
    // rounded-square rule in `GuestPortrait` is about faces.
    expect(html).toContain("rounded-full")
  })

  it("survives every className its call sites pass it", () => {
    // The size is merged through `cn()`, so a call site passing `h-12 w-12`
    // would silently win and no guard on the component alone would notice.
    // This renders the badge with each className that is really in the tree.
    const callSites = sourceFiles().flatMap(([rel, src]) =>
      [...src.matchAll(/<PlayBadge\s+className="([^"]*)"/g)].map(
        (m) => [rel, m[1]] as const,
      ),
    )
    expect(callSites.length, "no PlayBadge call site found").toBeGreaterThanOrEqual(2)
    for (const [rel, className] of callSites) {
      const html = renderToStaticMarkup(createElement(PlayBadge, { className }))
      expect(html, `${rel} resizes the shared badge`).toContain("h-14 w-14")
    }
  })
})

describe("the fallback ladder is wired, not merely computed", () => {
  it("EpisodeThumb gives next/image an onError that advances the source", () => {
    // `episodeThumbSources` returning two rungs proves nothing on its own:
    // with this attribute gone the component still renders rung one, every
    // ladder test above still passes, and a 404 just stays broken on screen.
    //
    // QA fired `error` on the live <img> and watched maxres → hq → the «ط»
    // panel before this existed; that is the behavioural evidence. This is its
    // regression guard, and it is structural by necessity — an event handler
    // is a function prop, absent from rendered markup, and observing it needs
    // a DOM environment this suite does not have.
    const attrs = jsxAttrs(
      code(readFileSync(path.join(ROOT, "components/media/episode-thumb.tsx"), "utf8")),
      "Image",
    )
    expect(attrs, "the <Image> carries no onError").toContain("onError=")
    expect(attrs, "onError does not advance the index").toMatch(/onError=\{\(\)\s*=>\s*setIndex/)
  })

  it("GuestPortrait gives its photo the same escape to the «ط» panel", () => {
    const attrs = jsxAttrs(
      code(readFileSync(path.join(ROOT, "components/media/guest-portrait.tsx"), "utf8")),
      "Image",
    )
    expect(attrs, "the <Image> carries no onError").toContain("onError=")
    expect(attrs, "onError does not reach the empty state").toMatch(
      /onError=\{\(\)\s*=>\s*setFailed\(true\)\}/,
    )
  })

  it("draws the first rung, and the panel when there is no rung at all", () => {
    const withSource = renderToStaticMarkup(
      createElement(EpisodeThumb, {
        ep: {
          title: "حلقة",
          thumbnail_url: null,
          youtube_url: "https://www.youtube.com/watch?v=oNyFz82BVzY",
        },
        sizes: "300px",
      } as never),
    )
    expect(withSource).toContain("maxresdefault.jpg")
    expect(withSource).toContain('sizes="300px"')

    const withoutSource = renderToStaticMarkup(
      createElement(EpisodeThumb, {
        ep: { title: "حلقة", thumbnail_url: null, youtube_url: "https://example.com/x" },
        sizes: "300px",
      } as never),
    )
    expect(withoutSource).toContain("ط")
    expect(withoutSource).not.toContain("<img")
  })
})

describe("the guest portrait renders at all three sizes", () => {
  // Not one guest row in the local DB has a photo, so `page` (200px) and
  // `episode` (96px) had never been drawn — by anyone, in a browser or in a
  // test. They shipped unseen. These render each variant directly, which is
  // the only way to see them without writing to the database.
  it.each([
    ["card", "h-20 w-20", "rounded-2xl", "80px"],
    // Both were `rounded-[20px]` — an arbitrary corner outside `--radius`, so
    // the switch point could not move them. Now two rungs of the ladder, chosen
    // by box size: 3x on the 200px header, 2x on the 96px block.
    ["page", "h-[200px] w-[200px]", "rounded-3xl", "200px"],
    ["episode", "h-24 w-24", "rounded-2xl", "96px"],
  ] as const)("%s is a %s rounded square asking for %s", (variant, box, corner, sizes) => {
    const html = renderToStaticMarkup(
      createElement(GuestPortrait, {
        name: "الدكتور الحارث المزيدي",
        photoUrl: "/guests/test.jpg",
        variant,
      }),
    )
    expect(html).toContain(box)
    expect(html).toContain(corner)
    expect(html).toContain(`sizes="${sizes}"`)
    expect(html, "a circle — the one shape the identity does not own").not.toContain(
      "rounded-full",
    )
  })

  it("shows «ط» and never an initial when the photo is missing", () => {
    // «الدكتور الحارث المزيدي» is the exact name that rendered «اا» live.
    const html = renderToStaticMarkup(
      createElement(GuestPortrait, {
        name: "الدكتور الحارث المزيدي",
        photoUrl: null,
        variant: "page",
      }),
    )
    expect(html).toContain("ط")
    expect(html).not.toContain("اا")
    expect(html).not.toContain("<img")
  })
})
