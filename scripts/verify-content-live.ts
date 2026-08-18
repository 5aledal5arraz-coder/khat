/**
 * Is the content on this machine actually on the site? Ask the site.
 *
 *   npx tsx scripts/verify-content-live.ts                     # against production
 *   npx tsx scripts/verify-content-live.ts --host http://localhost:3000
 *   npx tsx scripts/verify-content-live.ts --quotes            # also check quote wording
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * On 2026-08-17 I told Khaled that 242,857 words of transcript had never been
 * published, and he approved a production deploy on the strength of it. All
 * nineteen transcripts were already live. Nothing was deployed only because SSH
 * happened to be blocked.
 *
 * I reached that conclusion twice, two different ways, and both were wrong:
 *
 *   1. `git ls-tree main -- content/stories` returned nothing, so I concluded
 *      the files had never shipped. The hidden premise was "production is
 *      main". CLAUDE.md says, in the Deployment section: "No git on server —
 *      files uploaded via SCP". The deployed state is a WORKING TREE, and no
 *      git command on this machine can report on it. I had that fact in front
 *      of me and used the industry default instead.
 *
 *   2. I counted words on the fetched page with
 *          sed 's/<script[^>]*>.*<\/script>//g; s/<[^>]*>/ /g' | wc -w
 *      and got 355–1,111 per episode. The transcript is drawn by a CLIENT
 *      component, so its text travels inside the RSC payload, inside <script>
 *      — exactly what that first expression deletes. The live page is 331 KB.
 *      I was measuring the chrome and calling it the page.
 *
 * The two agreed, and I read agreement as corroboration. It was not: both were
 * downstream of the same omission — I never once asked the page whether a
 * specific sentence was on it. That test takes ten seconds and is the entire
 * content of this file.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS ENCODES
 *
 * `rendered-output-audit-method` already said "audit the rendered page, not the
 * code", and I believed I was obeying it, because I did fetch the page. The
 * refinement that was missing: FETCHING the page is not MEASURING it. A number
 * computed from a page is a new instrument, and an instrument that has never
 * been shown to detect a present thing cannot be trusted when it reports an
 * absent one.
 *
 * Hence `positiveControl` below. This script refuses to report "MISSING" until
 * it has proved, on the same fetch, that it can find something that is
 * certainly there. A checker that cannot fail loudly is the thing it is
 * checking for.
 */
import "@/lib/jobs/load-env"
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/lib/db"
import { episodes } from "@/lib/db/schema"
import { inArray } from "drizzle-orm"

const STORIES = join(process.cwd(), "content", "stories")
const DEFAULT_HOST = "https://khatpodcast.com"

interface Paragraph { text: string; start: number }
interface Story { paragraphs?: Paragraph[]; wordCount?: number }
interface Quote { text: string }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/**
 * Needles taken at fixed fractions through the transcript, not at random.
 *
 * Fixed so two runs compare, and spread so a page that renders only its opening
 * — a truncation, a collapsed section that never hydrates, a paginated body —
 * fails instead of passing on the first paragraph.
 */
function needlesFor(story: Story): string[] {
  const paras = (story.paragraphs ?? []).filter((p) => (p.text ?? "").trim().length > 40)
  if (paras.length === 0) return []
  return [0.1, 0.5, 0.9]
    .map((f) => paras[Math.min(paras.length - 1, Math.floor(paras.length * f))])
    .map((p) => p.text.trim().slice(0, 45))
}

/**
 * Arabic on a web page is not the same bytes as Arabic in a JSON file.
 *
 * HTML escapes (&quot;, &#x27;), NFC/NFD normalisation and collapsed runs of
 * whitespace all break an exact substring test while the text on the screen is
 * identical. Comparing normalised forms tests what a reader sees rather than
 * what a serialiser happened to emit.
 */
function fold(s: string): string {
  return s
    .normalize("NFC")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Prove the instrument can see, on this exact fetch, before trusting a miss.
 *
 * If the control cannot be found then the fetch failed, the slug is wrong, or
 * the folding is broken — and every "MISSING" from that page would be a lie
 * about the site rather than a fact about it. See [[guards-that-go-blind]]: a
 * check that stops being able to detect a positive goes quiet, not red.
 *
 * THE CONTROL IS THE CANONICAL URL, NOT THE TITLE. The title was the first
 * choice and it was wrong in the direction that matters: it reported "cannot
 * see" on five of nineteen production pages that I had already proved by hand
 * were fully live. The DB's `title` is not always the string the page renders —
 * episodes carry an editable override — so the control was testing a second
 * thing (do these two titles agree?) while claiming to test the first.
 *
 * `<link rel="canonical">` is emitted server-side by `generateMetadata` on
 * every episode page, and it contains the slug we asked for. Finding it proves
 * exactly the three things the control is for: the right page, rendered, and
 * matchable after folding. Nothing more, which is the point.
 */
function positiveControl(haystack: string, slug: string): boolean {
  return haystack.includes(fold(`/episodes/${encodeURIComponent(slug)}`))
}

async function main() {
  const host = (arg("host") ?? DEFAULT_HOST).replace(/\/$/, "")
  const withQuotes = process.argv.includes("--quotes")
  if (!db) throw new Error("no database — needed to resolve video ids to slugs")

  const ids = readdirSync(STORIES)
    .filter((f) => f.endsWith(".json") && !f.includes("quotes"))
    .map((f) => f.replace(/\.json$/, ""))
  if (ids.length === 0) {
    console.log("no transcripts in content/stories — nothing to verify")
    process.exit(0)
  }

  const rows = await db
    .select({ id: episodes.id, slug: episodes.slug, title: episodes.title })
    .from(episodes)
    .where(inArray(episodes.id, ids))

  console.log(`${host} — ${rows.length} episodes with a local transcript\n`)

  let live = 0
  const missing: string[] = []
  const blind: string[] = []
  const staleQuotes: string[] = []

  for (const r of rows) {
    const story = JSON.parse(readFileSync(join(STORIES, `${r.id}.json`), "utf8")) as Story
    const url = `${host}/episodes/${encodeURIComponent(r.slug)}`

    let html: string
    try {
      const res = await fetch(url, { headers: { "user-agent": "khat-verify-content" } })
      if (!res.ok) {
        blind.push(`${r.id} — HTTP ${res.status}`)
        console.log(`⚠️  ${r.id}  HTTP ${res.status}`)
        continue
      }
      html = fold(await res.text())
    } catch (e) {
      blind.push(`${r.id} — ${e instanceof Error ? e.message : String(e)}`)
      console.log(`⚠️  ${r.id}  fetch failed`)
      continue
    }

    // THE INSTRUMENT IS CHECKED BEFORE ITS READINGS ARE BELIEVED.
    if (!positiveControl(html, r.slug)) {
      blind.push(`${r.id} — positive control failed (canonical URL not on its own page)`)
      console.log(`⚠️  ${r.id}  CANNOT SEE — control failed, readings discarded`)
      continue
    }

    const needles = needlesFor(story).map(fold)
    const found = needles.filter((n) => html.includes(n))
    const ok = needles.length > 0 && found.length === needles.length

    if (ok) live++
    else missing.push(`${r.id} (${found.length}/${needles.length} sentences found)`)

    let qNote = ""
    if (withQuotes) {
      const qf = join(STORIES, `${r.id}.quotes.json`)
      if (existsSync(qf)) {
        const quotes = (JSON.parse(readFileSync(qf, "utf8")).quotes ?? []) as Quote[]
        // Only quotes whose wording differs from the transcript can be told
        // apart from it. A quote that is byte-identical to a transcript
        // sentence would "be found" either way and proves nothing about which
        // version of the quote file the server holds — so it is not counted.
        const decisive = quotes.filter((q) => !html.includes(fold(q.text).slice(0, 45)))
        if (decisive.length) {
          staleQuotes.push(`${r.id}: ${decisive.length}/${quotes.length}`)
          qNote = `   quotes not found: ${decisive.length}/${quotes.length}`
        } else {
          qNote = `   quotes: ${quotes.length}/${quotes.length} ✅`
        }
      }
    }

    console.log(
      `${ok ? "✅" : "🔴"} ${r.id}  ${String(story.wordCount ?? "?").padStart(6)} words` +
        `  ${found.length}/${needles.length} sentences${qNote}`,
    )
  }

  console.log(`\nLIVE ${live}   MISSING ${missing.length}   UNREADABLE ${blind.length}`)
  for (const m of missing) console.log(`  🔴 ${m}`)
  for (const b of blind) console.log(`  ⚠️  ${b}`)
  if (withQuotes && staleQuotes.length) {
    console.log(`\nQUOTE WORDING NOT FOUND ON PAGE (server may hold an older quote file):`)
    for (const s of staleQuotes) console.log(`  · ${s}`)
  }

  // UNREADABLE IS A FAILURE, NOT A SKIP. "I could not check" reported as
  // success is how a guard goes blind — the whole reason this file exists.
  process.exit(missing.length === 0 && blind.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
