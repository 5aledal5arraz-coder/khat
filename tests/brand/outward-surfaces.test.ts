/**
 * The logo guard, widened to every surface that leaves the building.
 *
 * `logo-art.test.ts` proves the shipped assets ARE the artwork, and that no
 * rebuild survives in `components/brand`. That scope was too narrow and it cost
 * us: the CSS lookalike was still alive in `lib/email/templates.ts`, on the
 * campaign send path, so it reached every newsletter subscriber — a wider
 * external audience than any of the surfaces that had been cleaned.
 *
 * So this file does not look at a directory. It walks every module that can put
 * a logo in front of someone outside the team — email, generated images, print
 * documents, structured data, the media kit — and asserts on what they emit.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

import { KHAT_INDIGO, KHAT_ORANGE, KHAT_IVORY } from "@/components/brand/khat-logo-art"
import { newsletterHtml, newsletterWelcomeHtml } from "@/lib/email/templates"

const ROOT = process.cwd()

/**
 * The four colours the deleted CSS lookalike invented. None is in either KHAT
 * palette. Finding any of them in code is the signature of a rebuilt logo.
 */
const INVENTED = ["#3a2d70", "#ee6a2c", "#45367f", "#2f2560", "#5a47a8"]

/**
 * The retired identity's gold, and the one question the earlier sweep never
 * asked. The media kit was searched for the wordmark's ORDER and not for its
 * PALETTE, so `#c9a84c` survived in 20 places across three files — the
 * partner-facing surface — while every other surface was cleaned.
 *
 * The answer is not "delete the gold". CLAUDE.md records the media kit's
 * black/gold palette as deliberately separate from the site tokens, and it is
 * the art direction of a document, not a logo colour: rules, folios, section
 * numerals, eyebrows, stat figures, the gate's button. That stays.
 *
 * What does not stay is gold setting the brand NAME. `PODCAST KHAT` typeset in
 * the retired identity's colour, next to the new mark, is a wordmark
 * substitute — the exact thing this wave removed everywhere else, wearing the
 * palette that was supposed to have been retired with it. The cover, the
 * password gate and the closing signature all did that, on screen and in the
 * PDF; all four are the artwork now.
 */
const RETIRED_GOLD = "#c9a84c"

/**
 * The one place the name may still be set as type, and why.
 *
 * A running foot repeated beside a page number, at 10px, in a print document.
 * No lockup fits (MIN_HEIGHT 40 against a 10px band) and it is document
 * furniture rather than a logo placement. Written down and checked, so the
 * exception cannot quietly spread — same shape as MIN_HEIGHT_EXEMPT in the
 * icon builder.
 */
const TYPESET_NAME_EXEMPT = /class="page-footer-brand"/

/**
 * The retired identities: the gold wordmark (`/logo.png`, `/logo-wide.jpg`) and
 * the periwinkle chat badge (`/logo-small.jpg`).
 *
 * Anchored so `/partners/logo.png` — a placeholder for a SPONSOR's logo in the
 * partnerships admin form, nothing to do with ours — does not match.
 */
const RETIRED_ASSETS = [
  /(?<![\w/-])\/logo\.png/,
  /(?<![\w/-])\/logo-small\.jpg/,
  /(?<![\w/-])\/logo-wide\.jpg/,
  /(?<![\w/-])\/apple-touch-icon\.png/,
]

/**
 * Every file that can render a logo to someone outside the team. Kept explicit
 * rather than globbed: a new outward surface should have to be added here
 * deliberately, and the last test in this file fails if one appears that is not
 * on the list.
 */
const OUTWARD_SURFACES = [
  "lib/email/templates.ts",
  "lib/pdf/proposal-pdf.ts",
  "lib/ai/content.ts",
  "components/quotes/quote-image-templates.tsx",
  "components/media-kit/media-kit-view.tsx",
  "app/admin/media-kit/page.tsx",
  "app/media-kit/[slug]/page.tsx",
  "app/page.tsx",
  "app/manifest.ts",
  "scripts/generate-og-image.ts",
  "scripts/build-brand-icons.ts",
]

/** Strip comments — a comment explaining what was removed is not a rebuild. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|\*).*$/gm, "")
}

const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8")

describe("no outward-facing surface rebuilds or misbrands the logo", () => {
  it.each(OUTWARD_SURFACES)("%s carries none of the invented colours", (rel) => {
    const src = code(read(rel)).toLowerCase()
    for (const hex of INVENTED) {
      expect(src, `${rel} still paints ${hex}`).not.toContain(hex)
    }
  })

  it.each(OUTWARD_SURFACES)("%s serves no retired logo asset", (rel) => {
    // apple-touch-icon.png is legitimately WRITTEN by the icon builder; what
    // must never happen is a surface pointing at one of these as its logo.
    if (rel.startsWith("scripts/build-brand-icons")) return
    const src = code(read(rel))
    for (const asset of RETIRED_ASSETS) {
      expect(src, `${rel} still points at ${asset}`).not.toMatch(asset)
    }
  })

  it("never paints the brand name in the retired gold", () => {
    // Not "no gold anywhere" — the media kit's document palette is sanctioned.
    // The rule is that gold may not BE the wordmark. Checked per element, so a
    // gold divider two lines from the name does not trip it and a gold name
    // does.
    const offenders: string[] = []
    for (const rel of OUTWARD_SURFACES) {
      const src = code(read(rel))
      // Each element-ish chunk: an opening tag plus the text up to the next tag.
      for (const [, chunk] of src.matchAll(/(<[a-zA-Z][^<]*)/g)) {
        if (!chunk.toLowerCase().includes(RETIRED_GOLD)) continue
        if (/PODCAST\s+KHAT|بودكاست\s+خط/.test(chunk)) {
          offenders.push(`${rel}: ${chunk.trim().slice(0, 120)}`)
        }
      }
    }
    expect(offenders, "brand name typeset in the retired gold").toEqual([])
  })

  it("sets the brand name as type only where the artwork cannot go", () => {
    // Everything else must be a <KhatLogo> / khatLogoMarkup() call. The cover,
    // the password gate and the closing signature were all typeset wordmarks;
    // the only survivor is the declared running-footer exemption.
    const offenders: string[] = []
    for (const rel of OUTWARD_SURFACES) {
      const src = code(read(rel))
      for (const [, chunk] of src.matchAll(/(<[a-zA-Z][^<]*)/g)) {
        if (!/>\s*PODCAST\s+KHAT\s*$|>\s*PODCAST\s+KHAT\s/.test(chunk)) continue
        if (TYPESET_NAME_EXEMPT.test(chunk)) continue
        offenders.push(`${rel}: ${chunk.trim().slice(0, 120)}`)
      }
    }
    expect(offenders, "brand name typeset outside the declared exemption").toEqual([])
  })

  it("keeps the wordmark in the order the artwork uses: PODCAST KHAT", () => {
    // Every shipped SVG reads `PODCAST KHAT`. The media kit had it reversed in
    // 14 places, including the footer of every PDF page, under a cover that had
    // it the right way round.
    const offenders: string[] = []
    for (const rel of OUTWARD_SURFACES) {
      const src = read(rel)
      if (/KHAT\s+PODCAST/.test(src)) offenders.push(rel)
    }
    expect(offenders, "reversed wordmark").toEqual([])
  })
})

describe("the newsletter sends the real artwork", () => {
  // This is the exact call `lib/newsletter/sender.ts` makes per recipient.
  const campaign = newsletterHtml("<p>نص تجريبي</p>", "https://khatpodcast.com/unsub?token=x")
  const welcome = newsletterWelcomeHtml("https://khatpodcast.com/unsub?token=x")

  it.each([
    ["campaign", campaign],
    ["welcome", welcome],
  ])("%s email embeds the generated lockup raster, at an absolute URL", (_name, html) => {
    const img = html.match(/<img[^>]+email-lockup\.png[^>]*>/)
    expect(img, "no lockup <img> in the email").not.toBeNull()
    expect(img![0]).toMatch(/src="https?:\/\/[^"]+\/brand\/email-lockup\.png"/)
    // Blocked-images fallback: the reader must get the name, not a broken icon.
    expect(img![0]).toContain('alt="بودكاست خط"')
    // Fixed box so the layout does not jump before the image loads.
    expect(img![0]).toMatch(/width="\d+"/)
    expect(img![0]).toMatch(/height="\d+"/)
  })

  it.each([
    ["campaign", campaign],
    ["welcome", welcome],
  ])("%s email contains no rebuilt mark and no invented colour", (_name, html) => {
    for (const hex of INVENTED) {
      expect(html.toLowerCase(), `email paints ${hex}`).not.toContain(hex)
    }
    // The lookalike's tell: the bare string خط set in a UI font inside a
    // rounded, filled box. The real mark is a drawing; no font contains it.
    expect(html).not.toMatch(/border-radius:1[0-9]px[^"]*"[^>]*>\s*<span[^>]*>\s*خط/)
    expect(html, "gradients do not render in Outlook").not.toContain("linear-gradient")
  })

  it.each([
    ["campaign", campaign],
    ["welcome", welcome],
  ])("%s email paints brand chrome in the identity's own colours", (_name, html) => {
    expect(html.toLowerCase()).toContain(KHAT_INDIGO)
    expect(html.toLowerCase()).toContain(KHAT_ORANGE)
  })

  it("ships the raster the emails point at", () => {
    const png = path.join(ROOT, "public", "brand", "email-lockup.png")
    expect(statSync(png).size).toBeGreaterThan(0)
    // PNG magic — a 404 page or an HTML error saved here would still "exist".
    expect(readFileSync(png).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  })
})

describe("the icon set is one treatment with a declared exemption", () => {
  const iconSvg = read("app/icon.svg")

  it("puts every icon surface on the indigo tile with the ivory mark", () => {
    expect(iconSvg).toContain(`fill="${KHAT_INDIGO}"`) // the tile
    expect(iconSvg).toContain(`fill="${KHAT_IVORY}"`) // the mark
    expect(iconSvg, "tab icon is back on transparency").toContain("<rect")
  })

  // The exemption itself, and whether the guard around it actually throws, are
  // checked by CALLING it in tests/brand/icon-policy.test.ts. This file used to
  // assert that the source contains the string "assertMinHeightPolicy", which
  // passes just as happily if the function is never called — the same class of
  // hollow check as a comment promising a build gate that does not exist.

  it("gives the maskable icon its own asset", () => {
    const manifest = read("app/manifest.ts")
    expect(manifest).toContain("icon-maskable-512.png")
    // The bug this replaced: icon-512 listed twice, once as maskable.
    const maskableBlock = manifest.slice(manifest.indexOf('purpose: "maskable"') - 400)
    expect(maskableBlock).not.toMatch(/src: "\/brand\/icon-512\.png"[\s\S]{0,200}maskable/)
  })
})

describe("the list of outward surfaces is not silently out of date", () => {
  it("finds no unlisted file that renders a brand mark", () => {
    // Walk the source tree for anything referencing the artwork or a retired
    // logo asset, and require it to be either a brand module, a test, or on the
    // OUTWARD_SURFACES list. This is the check that would have caught
    // lib/email/templates.ts.
    const SKIP = new Set(["node_modules", ".next", ".git", ".claude", "public", "drizzle"])
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (SKIP.has(entry)) continue
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue
        const rel = path.relative(ROOT, full)
        if (rel.startsWith("components/brand") || rel.startsWith("tests/")) continue
        if (OUTWARD_SURFACES.includes(rel)) continue
        const src = code(readFileSync(full, "utf8"))
        if (RETIRED_ASSETS.some((a) => a.test(src))) hits.push(rel)
        if (INVENTED.some((h) => src.toLowerCase().includes(h))) hits.push(rel)
      }
    }
    walk(ROOT)
    expect([...new Set(hits)], "unlisted surface referencing a logo").toEqual([])
  })
})
