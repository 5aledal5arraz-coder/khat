/**
 * The preparation studio must survive a section that arrived incomplete.
 *
 * REPRODUCED 2026-08-14. A local fixture was seeded to measure the studio's
 * layout — the screen had never been opened in a browser here, because the
 * local database had zero preparation rows. It did not render at all:
 *
 *   TypeError: Cannot read properties of undefined (reading 'map')
 *   The above error occurred in the <OverviewPanel> component.
 *
 * Every section is rendered behind `prep.knowledge_bank ? … : …`, which proves
 * the OBJECT arrived and nothing about its arrays. The objects come from a
 * model, so a truncated or partially-valid generation hands back `{}` where
 * `{ key_facts: [...] }` was expected — and one `undefined.map` inside render
 * replaced the ENTIRE studio with «حدث خطأ غير متوقع».
 *
 * That is the worst possible failure on this screen: its whole purpose is to
 * show a preparation where a section failed. Khalid's real incident had exactly
 * one failed section.
 *
 * The shapes below are deliberately hostile — every section present, every
 * inner array missing — because that is what a truncated generation looks like.
 */

import { describe, it, expect } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { PreparationStudioClient } from "@/app/admin/preparation/[id]/preparation-studio-client"
import { EDITORIAL_SECTION_KEYS } from "@/types/preparation"

/** Every section object present; every array inside it absent. */
const HOSTILE = {
  id: "t-1",
  title: "حلقة اختبار",
  guest_name: "ضيف",
  guest_description: null,
  guest_profile_link: null,
  guest_identity: null,
  short_description: null,
  episode_goal: null,
  key_questions: [],
  tone_type: "deep",
  focus_mode: "guest",
  expected_duration_min: 60,
  depth_level: 3,
  boldness_level: 3,
  content_focus: [],
  inputs_meta: null,
  research_data: {
    generated_at: new Date(0).toISOString(),
    query: "q",
    queries_used: [],
    sources: [],
    retrieval: [],
    claims: [],
    quotes: [],
    past_interviews: [],
    verified_count: 0,
    weak_count: 0,
    unverified_count: 0,
  },
  executive_summary: {},
  knowledge_bank: {},
  guest_intelligence: {},
  conversation_axes: {},
  episode_flow: {},
  question_system: {},
  host_instructions: {},
  quotes_references: {},
  viral_moments: {},
  sections_status: {
    research: { status: "ready" },
    ...Object.fromEntries(EDITORIAL_SECTION_KEYS.map((k) => [k, { status: "ready" }])),
  },
  status: "researched",
  approved_at: null,
  live_token_hash: null,
  live_state: null,
  linked_episode_id: null,
  eir_id: null,
  cards_generated_at: null,
  archived_at: null,
  deleted_at: null,
  created_by: "t",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
} as never

const render = (initial: never) =>
  renderToStaticMarkup(createElement(PreparationStudioClient, { initial }))

describe("the studio survives incomplete sections", () => {
  it("renders when every section object is empty", () => {
    // The assertion that matters is simply that this does not throw.
    const html = render(HOSTILE)
    expect(html).toContain("حلقة اختبار")
    expect(html.length).toBeGreaterThan(500)
  })

  it("renders when a section is missing entirely", () => {
    const missing = { ...(HOSTILE as object), knowledge_bank: null, viral_moments: null } as never
    expect(() => render(missing)).not.toThrow()
  })

  it("renders when a section object carries the wrong shape", () => {
    // What a half-parsed model response actually looks like: the right key,
    // the wrong type underneath.
    const wrong = {
      ...(HOSTILE as object),
      conversation_axes: { main_themes: undefined },
      episode_flow: { timeline: undefined, phases: undefined },
      question_system: { sections: undefined },
      quotes_references: { quotes: undefined },
      viral_moments: { moments: undefined },
      knowledge_bank: { key_facts: undefined, insights: undefined, angles: undefined, context: undefined },
    } as never
    expect(() => render(wrong)).not.toThrow()
  })

  it("still shows the failed-section chip on a hostile row", () => {
    const failed = {
      ...(HOSTILE as object),
      sections_status: {
        research: { status: "ready" },
        ...Object.fromEntries(EDITORIAL_SECTION_KEYS.map((k) => [k, { status: "ready" }])),
        question_system: { status: "error", error: "Provider timeout after 280000ms" },
      },
    } as never
    const html = render(failed)
    // 8 of 9 ready — the number the badge lied about on 2026-08-13.
    expect(html).toContain("8/9")
    expect(html).toContain("نظام الأسئلة")
  })
})
