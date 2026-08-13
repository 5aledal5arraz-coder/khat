/**
 * «بـشركة أفق الخليج» went out to a company before anyone read it as Arabic.
 *
 * The tatweel in `بـ` exists for one reason: an Arabic letter cannot join to a
 * Latin character or a digit, so `بFlash` breaks and `بـFlash` is right. Before
 * an ARABIC word the letters join on their own and the dash reads as a stutter.
 * The template hardcoded the tatweel, so every Arabic company name got it.
 *
 * These assert the RENDERED string, not the helper in isolation — the defect
 * was in what the partner reads, and a helper can be correct while the template
 * still interpolates around it wrongly.
 */

import { describe, it, expect } from "vitest"
import { partnershipOfferHtml } from "@/lib/email/templates"

function render(companyName: string, passwordProtected = true) {
  return partnershipOfferHtml({
    contactName: "خالد",
    companyName,
    offerUrl: "https://khatpodcast.com/offer/abc",
    passwordProtected,
  })
}

describe("the Arabic clitic before a company name", () => {
  it("joins directly to an Arabic name — no tatweel", () => {
    const html = render("شركة أفق الخليج")
    expect(html).toContain("بشركة أفق الخليج")
    // The exact string that shipped, and must never ship again.
    expect(html).not.toContain("بـشركة")
  })

  it.each(["مؤسسة النور", "الشركة الوطنية", "إعمار"])(
    "joins directly to %s",
    (name) => {
      expect(render(name)).not.toContain(`بـ${name}`)
    },
  )

  it("KEEPS the tatweel before a Latin name — the case it was invented for", () => {
    const html = render("Flash KW")
    expect(html).toContain("بـFlash KW")
  })

  it("keeps it before a digit too", () => {
    expect(render("360 Media")).toContain("بـ360 Media")
  })

  it("does not lose the name when it is wrapped in quotes or spaces", () => {
    expect(render("  شركة أفق  ")).toContain("بشركة أفق")
  })
})

describe("the password note", () => {
  it("never reads as an instruction not to reply", () => {
    const html = render("شركة أفق الخليج")
    // «لا ترد في هذا البريد» is read by an Arabic speaker as "do not reply to
    // this email" — the opposite of what we want, since the message carries a
    // Reply-To precisely so they CAN answer. The intent was "it does not appear
    // here", and the sentence has to say that unambiguously.
    expect(html).not.toContain("لا ترد")
    expect(html).toContain("ولن تجدوها في هذه الرسالة")
  })

  it("says nothing about a password when the offer has no gate", () => {
    const html = render("شركة أفق الخليج", false)
    expect(html).not.toContain("كلمة المرور")
  })
})
