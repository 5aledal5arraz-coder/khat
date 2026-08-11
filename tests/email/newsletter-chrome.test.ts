/**
 * The newsletter's own furniture: the eyebrow that came apart, and the four
 * icons that were never icons.
 *
 * Khaled's screenshot of the welcome mail showed «ن ش ر ة  خ ط» — Arabic set
 * with `letter-spacing`, which suppresses the cursive joining and turns a word
 * into loose characters. It also showed a black circle, a play triangle and a
 * music note standing in for Instagram, YouTube and TikTok.
 */
import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { EMAIL_SOCIAL_LINKS, newsletterWelcomeHtml } from "@/lib/email/templates"

const SRC = readFileSync(join("lib", "email", "templates.ts"), "utf8")

describe("Arabic is never letter-spaced", () => {
  it("allows letter-spacing ONLY on explicitly LTR runs", () => {
    // The rule, stated so it can be checked: spacing is legitimate on the
    // reference code (`direction:ltr`, alphanumeric) and on nothing else. In
    // Arabic it does not "loosen" the word, it disconnects it.
    const offenders = SRC.split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /letter-spacing/.test(line))
      .filter(({ line }) => !/direction:\s*ltr/.test(line))
      .map(({ n, line }) => `${n}: ${line.trim().slice(0, 90)}`)

    expect(offenders, `letter-spacing on non-LTR text:\n${offenders.join("\n")}`).toEqual([])
  })

  it("still finds the LTR reference codes, so the rule is not vacuous", () => {
    const allowed = SRC.split("\n").filter(
      (l) => /letter-spacing/.test(l) && /direction:\s*ltr/.test(l),
    )
    expect(allowed.length).toBeGreaterThanOrEqual(4)
  })
})

describe("footer social icons", () => {
  it("links the handles Khaled actually maintains", () => {
    // The hardcoded set drifted to `instagram.com/khatpodcast` and
    // `x.com/khatpodcast`. Both answer 200 behind a login wall, so only an
    // assertion on the exact handle can catch it.
    const byKey = Object.fromEntries(EMAIL_SOCIAL_LINKS.map((s) => [s.key, s.url]))
    expect(byKey.instagram).toBe("https://www.instagram.com/Khat.Podcast")
    expect(byKey.x).toBe("https://x.com/Khat_Podcast")
    expect(byKey.youtube).toBe("https://www.youtube.com/@KhatPodcast")
    expect(byKey.tiktok).toBe("https://www.tiktok.com/@khatpodcast")
  })

  it("has artwork on disk for every link it renders", () => {
    for (const { key, label } of EMAIL_SOCIAL_LINKS) {
      const file = join("public", "brand", "social", `${key}.png`)
      expect(existsSync(file), `missing icon for ${label} → ${file}`).toBe(true)
    }
  })

  it("renders images, not Unicode stand-ins", () => {
    const html = newsletterWelcomeHtml("https://khatpodcast.com/unsub?token=t")

    for (const { key, label } of EMAIL_SOCIAL_LINKS) {
      expect(html).toContain(`/brand/social/${key}.png`)
      // Blocked-images inboxes must degrade to the platform name.
      expect(html).toContain(`alt="${label}"`)
    }

    // The exact glyphs that shipped. Any of them back = the bug is back.
    for (const glyph of ["&#9679;", "&#9654;", "&#9836;", "&#120143;"]) {
      expect(html, `${glyph} is a stand-in, not a logo`).not.toContain(glyph)
    }
  })

  it("uses the caller's live links when given them", () => {
    const html = newsletterWelcomeHtml("https://khatpodcast.com/unsub?token=t", [
      { key: "youtube", label: "YouTube", url: "https://example.com/live-handle" },
    ])
    expect(html).toContain("https://example.com/live-handle")
    // Only what was passed — the fallback must not be appended to it.
    expect(html).not.toContain("Khat.Podcast")
  })
})
