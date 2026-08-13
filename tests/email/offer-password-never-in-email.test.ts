/**
 * The offer mail carries the LINK. It never carries the key to it.
 *
 * ── WHY THIS IS A TEST AND NOT A CODE REVIEW ───────────────────────────────
 * The offer page has two gates: a secret token in the URL and an optional
 * password. Putting both in one email collapses them into one — whoever reaches
 * that inbox, by forward, shared mailbox, or a breach three years from now, has
 * the link and the way through it in the same scroll. The password travels on
 * another channel; the mail only says that it will.
 *
 * The first line of defence is the signature: `partnershipOfferHtml` takes
 * `passwordProtected: boolean` and has no parameter that could hold a secret.
 * That is worth stating, but a signature is not a guarantee — the value is
 * reachable on `offer.password_hash` at every call site, so it can always be
 * spliced in later. Hence the assertions below, and hence they are aimed at
 * SHAPES (anything bcrypt-looking) rather than at one string, because the next
 * leak will not be the string this test happened to name.
 *
 * ── EACH DETECTOR IS PROVED TO SEE ─────────────────────────────────────────
 * An absence assertion is the easiest kind to go blind: it passes on an empty
 * string, on a renamed function, on a template that stopped rendering. So each
 * one is re-run against the SAME html with the thing spliced in, and must fire;
 * and each render is separately checked for having produced a real message.
 */
import { describe, it, expect } from "vitest"
import { partnershipOfferHtml } from "@/lib/email/templates"

const COMPANY = "شركة المستقبل"
const CONTACT = "سالم العلي"
const URL = "https://khatpodcast.com/offer/offer-deadbeefdeadbeef"

const PLAINTEXT = "correct-horse-battery-staple"
const BCRYPT_HASH = "$2a$12$abcdefghijklmnopqrstuvQWERTYUIOPasdfghjklZXCVBNMqwerty"

/** Anything with the shape of a bcrypt digest — `$2a$`, `$2b$`, `$2y$`. */
const looksHashed = (html: string) => /\$2[aby]\$\d{2}\$/.test(html)

const render = (passwordProtected: boolean) =>
  partnershipOfferHtml({ companyName: COMPANY, contactName: CONTACT, offerUrl: URL, passwordProtected })

/** The message rendered at all — without this every absence below is vacuous. */
function assertRealMessage(html: string) {
  expect(html).toContain(URL)
  expect(html).toContain(COMPANY)
  expect(html).toContain(CONTACT)
  expect(html.length).toBeGreaterThan(500)
}

describe("the password-gated offer mail", () => {
  it("names the gate but carries nothing that looks like a secret", () => {
    const html = render(true)
    assertRealMessage(html)
    expect(looksHashed(html)).toBe(false)
    expect(html).not.toContain(PLAINTEXT)
    expect(html).not.toContain(BCRYPT_HASH)
  })

  it("SIGHT: the same detectors fire on the same html with a secret spliced in", () => {
    const html = render(true)
    // Mutation, one secret at a time. If any of these came back false the
    // assertions above were proving nothing.
    expect(looksHashed(html + BCRYPT_HASH)).toBe(true)
    expect(looksHashed(html.replace("</body>", `<p>$2b$10$xxxxxxxxxxxxxxxxxxxxxx</p></body>`))).toBe(true)
    expect((html + PLAINTEXT).includes(PLAINTEXT)).toBe(true)
  })

  it("tells the reader the password comes separately", () => {
    const html = render(true)
    expect(html).toContain("رسالة منفصلة")
    expect(html).toContain("كلمة المرور")
  })

  it("says no such thing when there is no gate — the mail does not lie", () => {
    const html = render(false)
    assertRealMessage(html)
    expect(html).not.toContain("رسالة منفصلة")
    expect(html).not.toContain("كلمة المرور")
    expect(looksHashed(html)).toBe(false)
  })

  it("ignores any extra field a future caller tries to hand it", () => {
    // The signature has no slot for a secret; this proves the template also
    // does not stringify whatever it is given. `password` and `password_hash`
    // are the two names that exist on the offer row.
    const html = partnershipOfferHtml({
      companyName: COMPANY,
      contactName: CONTACT,
      offerUrl: URL,
      passwordProtected: true,
      password: PLAINTEXT,
      password_hash: BCRYPT_HASH,
    } as unknown as Parameters<typeof partnershipOfferHtml>[0])

    assertRealMessage(html)
    expect(html).not.toContain(PLAINTEXT)
    expect(looksHashed(html)).toBe(false)
  })
})

describe("the mail is built out of the shared email chrome, not a new one", () => {
  it("uses the brand type stack and the RTL document both layouts share", () => {
    const html = render(true)
    expect(html).toContain(`dir="rtl"`)
    expect(html).toContain("Manifa V2")
    // The CTA is the shared bulletproof button, pointed at the offer.
    expect(html).toContain("افتح العرض")
    expect(html).toContain(`href="${URL}"`)
  })
})
