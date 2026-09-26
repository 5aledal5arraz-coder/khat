/**
 * «نسخة الضيف» — what actually crosses to the browser.
 *
 * A client component's props ARE its RSC payload: whatever `buildGuestPageProps`
 * returns is serialized into the page. So this greps (a) the serialized props
 * and (b) the rendered HTML of the real client component for every canary —
 * starting from a published_view that was TAMPERED to carry forbidden fields,
 * so the page's own re-projection is what's under test.
 *
 * Mutation proof: the same grep fires when a canary sits in an allowed field.
 */

import { describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }))

import { toGuestPrepView } from "@/lib/guest-link/view"
import { buildGuestPageProps } from "@/lib/guest-link/page-props"
import { GuestLinkClient } from "@/app/prepare/[token]/guest-link-client"
import { canaryPrep, CANARY, CANARY_VALUES } from "./fixtures"

const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901"

function publishedView(prep = canaryPrep()) {
  const { view } = toGuestPrepView({
    prep,
    schedule_at: new Date("2026-10-01T16:00:00Z"),
    show_schedule: true,
    location: { location_label: "بيت", address: "عنوان", map_url: "https://maps.apple.com/?q=x", house_photo: null },
  })
  // What a hand-edited / future-bugged row might hold.
  return {
    ...view,
    thesis: CANARY.thesis,
    host_guidance: { overall_tone: CANARY.hostTone },
    axes: view.axes.map((a) => ({ ...a, intent: CANARY.intent, purpose: CANARY.purpose })),
  }
}

function row(over: Record<string, unknown> = {}) {
  return {
    guest_display_name: "د. بدر",
    questionnaire: {
      full_name: "بدر الطريجي",
      honorific: "د.",
      kunya: "بو فهد",
      pronunciation_notes: null,
      topics_excited_about: "القيادة",
      sensitivities_to_avoid: "موضوع خاص",
      // A key the questionnaire allowlist must drop.
      internal_note: CANARY.strategy,
    },
    questionnaire_draft: null,
    questionnaire_draft_step: null,
    questionnaire_submitted_at: new Date("2026-09-25T10:00:00Z"),
    welcome_seen_at: new Date("2026-09-25T10:05:00Z"),
    published_view: publishedView(),
    published_at: new Date("2026-09-26T10:00:00Z"),
    last_opened_at: new Date("2026-09-25T11:00:00Z"),
    ...over,
  }
}

function leaks(s: string): string[] {
  return CANARY_VALUES.filter((c) => s.includes(c))
}

describe("guest page payload + HTML carry no forbidden data", () => {
  it("serialized props (RSC payload) — zero canaries", () => {
    const props = buildGuestPageProps({ token: TOKEN, row: row(), suggestions: [] })
    expect(props.view).not.toBeNull()
    expect(leaks(JSON.stringify(props))).toEqual([])
  })

  it("rendered HTML of the prep view — zero canaries, real content present", () => {
    const props = buildGuestPageProps({ token: TOKEN, row: row(), suggestions: [] })
    const html = renderToStaticMarkup(createElement(GuestLinkClient, props))
    expect(leaks(html)).toEqual([])
    expect(html).toContain("وين ممكن ياخذنا الحوار")
    expect(html).toContain("بو فهد")
    // No episode title ever — the fixture has none, and the page has no slot for one.
    expect(html).not.toContain("<title")
  })

  it("the grep can see: a canary in an allowed field shows up in both", () => {
    const prep = canaryPrep()
    prep.question_bank[3] = { ...prep.question_bank[3], text: CANARY.zone }
    const props = buildGuestPageProps({
      token: TOKEN,
      row: row({ published_view: publishedView(prep) }),
      suggestions: [],
    })
    expect(leaks(JSON.stringify(props))).toContain(CANARY.zone)
    // Samples render inside collapsed cards, so check the payload side for the
    // HTML half: the label (an allowed field) is rendered.
    const html = renderToStaticMarkup(createElement(GuestLinkClient, props))
    expect(html).toContain("البداية والتعارف")
  })

  it("بياناتك: the admin's name, and the title on its own row — never glued to the name", () => {
    const props = buildGuestPageProps({
      token: TOKEN,
      row: row({
        guest_display_name: "د. بدر الطريجي",
        questionnaire: { honorific: "خبير إداري", kunya: "بو محمد" },
      }),
      suggestions: [],
    })
    expect(props.identity).toMatchObject({ name: "د. بدر الطريجي", honorific: "خبير إداري" })
    const html = renderToStaticMarkup(createElement(GuestLinkClient, props))
    expect(html).toContain("د. بدر الطريجي")
    expect(html).toContain("اللقب / المسمى")
    expect(html).toContain("خبير إداري")
    expect(html).not.toContain("خبير إداري د. بدر")
    expect(html).not.toContain("خبير إداري بدر")
  })

  it("answers stored before the fields were removed still load — legacy keys never reach the browser", () => {
    // row() carries the old shape: full_name, a «د.» honorific, topics, avoid.
    const props = buildGuestPageProps({ token: TOKEN, row: row(), suggestions: [] })
    const json = JSON.stringify(props)
    expect(json).not.toContain("بدر الطريجي")
    expect(json).not.toContain("القيادة")
    expect(json).not.toContain("موضوع خاص")
    expect(props.identity?.name).toBe("د. بدر")
  })

  it("the avoid answer is the guest's own and never appears in the prep view", () => {
    const props = buildGuestPageProps({ token: TOKEN, row: row(), suggestions: [] })
    const html = renderToStaticMarkup(createElement(GuestLinkClient, props))
    expect(html).not.toContain("موضوع خاص")
  })
})

describe("gate — the prep is unreachable before the questionnaire", () => {
  it("not submitted ⇒ view is null even when a snapshot is published", () => {
    const props = buildGuestPageProps({
      token: TOKEN,
      row: row({ questionnaire_submitted_at: null, welcome_seen_at: null, questionnaire: null }),
      suggestions: [{ id: "x", target_label: null, body: "b", tag: "received" }],
    })
    expect(props.stage).toBe("questionnaire")
    expect(props.view).toBeNull()
    expect(props.suggestions).toEqual([])
    const json = JSON.stringify(props)
    expect(json).not.toContain("وين")
    expect(json).not.toContain("البداية والتعارف")
    expect(json).not.toContain("2026-10-01")
  })

  it("stages: questionnaire → welcome → prep", () => {
    expect(
      buildGuestPageProps({ token: TOKEN, row: row({ welcome_seen_at: null }), suggestions: [] }).stage,
    ).toBe("welcome")
    expect(buildGuestPageProps({ token: TOKEN, row: row(), suggestions: [] }).stage).toBe("prep")
  })

  it("greets by kunya once known, else by the admin's name; resumes a draft", () => {
    const before = buildGuestPageProps({
      token: TOKEN,
      row: row({
        questionnaire: null,
        questionnaire_submitted_at: null,
        welcome_seen_at: null,
        // A draft saved by the 4-step form: step clamps, the legacy key is dropped.
        questionnaire_draft: { full_name: "بدر", honorific: "خبير" },
        questionnaire_draft_step: 3,
      }),
      suggestions: [],
    })
    expect(before.greetingName).toBe("د. بدر")
    expect(before.initialStep).toBe(1)
    expect(before.initialAnswers.honorific).toBe("خبير")
    expect(before.initialAnswers).not.toHaveProperty("full_name")
    const after = buildGuestPageProps({ token: TOKEN, row: row(), suggestions: [] })
    expect(after.greetingName).toBe("بو فهد")
    expect(JSON.stringify(after)).not.toContain("internal_note")
  })

  it("«تم تحديث» only when republished after the previous visit", () => {
    expect(buildGuestPageProps({ token: TOKEN, row: row(), suggestions: [] }).updatedSinceLastVisit).toBe(true)
    expect(
      buildGuestPageProps({
        token: TOKEN,
        row: row({ last_opened_at: new Date("2026-09-27T00:00:00Z") }),
        suggestions: [],
      }).updatedSinceLastVisit,
    ).toBe(false)
  })

  it("published but not yet — «نثبّت التفاصيل ونرسل لك», never empty cards", () => {
    const props = buildGuestPageProps({ token: TOKEN, row: row({ published_view: null }), suggestions: [] })
    const html = renderToStaticMarkup(createElement(GuestLinkClient, props))
    expect(html).toContain("نثبّت التفاصيل ونرسل لك")
    expect(html).not.toContain("وين ممكن ياخذنا الحوار")
  })
})
