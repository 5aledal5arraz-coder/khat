/**
 * P3 — Studio redesign: topic slug stability.
 *
 * topicSlug backs topic-page URLs and the topics.slug unique key, so it must
 * be deterministic, preserve Arabic, fold diacritics, and never emit empty.
 */

import { describe, expect, it } from "vitest"
import { topicSlug } from "@/lib/episodes/episode-graph"

describe("topicSlug", () => {
  it("preserves Arabic words and hyphenates spaces", () => {
    expect(topicSlug("الذكاء الاصطناعي")).toBe("الذكاء-الاصطناعي")
  })

  it("folds diacritics so variants collapse to one slug", () => {
    expect(topicSlug("الذَّكاء")).toBe(topicSlug("الذكاء"))
  })

  it("lowercases Latin and strips punctuation", () => {
    expect(topicSlug("AI & Society!")).toBe("ai-society")
  })

  it("is deterministic", () => {
    expect(topicSlug("ريادة الأعمال")).toBe(topicSlug("ريادة الأعمال"))
  })

  it("never emits an empty slug", () => {
    expect(topicSlug("   ")).toBe("topic")
    expect(topicSlug("!!!")).toBe("topic")
  })

  it("trims to a bounded length", () => {
    expect(topicSlug("ا".repeat(200)).length).toBeLessThanOrEqual(80)
  })
})
