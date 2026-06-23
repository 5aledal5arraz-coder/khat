/**
 * P0 — Studio redesign: GlobalEpisodeIntelligence deepening.
 *
 * formatIntelligenceContext is the shared "understanding" block injected into
 * every downstream generator (Growth package + Website knowledge hub). These
 * tests lock in that the new growth/production signals (controversy moments,
 * clip seeds, retention risks, sponsor windows, topic tags, guest signature
 * topics) actually surface in the formatted context — otherwise the new
 * generators would silently lose the shared analysis they're meant to reuse.
 */

import { describe, expect, it } from "vitest"
import {
  formatIntelligenceContext,
  type GlobalEpisodeIntelligence,
} from "@/lib/ai/episode-intelligence"

function intel(over: Partial<GlobalEpisodeIntelligence> = {}): GlobalEpisodeIntelligence {
  return {
    narrative_arc: { beginning: "ب", development: "ت", key_insight: "ك", conclusion: "خ" },
    turning_points: [],
    strongest_moments: [],
    core_ideas: [],
    themes: [],
    emotional_peaks: [],
    guest_profile: null,
    episode_essence: "جوهر الحلقة",
    controversy_moments: [],
    retention_risk_points: [],
    sponsor_safe_windows: [],
    clip_seed_moments: [],
    topic_tags: [],
    guest_signature_topics: [],
    ...over,
  }
}

describe("formatIntelligenceContext — deepened growth signals", () => {
  it("surfaces controversy moments when present", () => {
    const out = formatIntelligenceContext(intel({ controversy_moments: ["لحظة جدلية حادة"] }))
    expect(out).toContain("اللحظات المثيرة للجدل")
    expect(out).toContain("لحظة جدلية حادة")
  })

  it("surfaces clip seeds, retention risks, and sponsor windows", () => {
    const out = formatIntelligenceContext(
      intel({
        clip_seed_moments: ["مقطع مستقل قوي"],
        retention_risk_points: ["استطراد طويل"],
        sponsor_safe_windows: ["بعد الموضوع الأول"],
      }),
    )
    expect(out).toContain("بذور المقاطع القصيرة")
    expect(out).toContain("مقطع مستقل قوي")
    expect(out).toContain("نقاط خطر فقدان الانتباه")
    expect(out).toContain("نوافذ آمنة للإعلان")
  })

  it("renders topic tags as hashtags and guest signature topics", () => {
    const out = formatIntelligenceContext(
      intel({ topic_tags: ["الذكاء الاصطناعي"], guest_signature_topics: ["ريادة الأعمال"] }),
    )
    expect(out).toContain("#الذكاء الاصطناعي")
    expect(out).toContain("الموضوعات المميزة للضيف")
    expect(out).toContain("ريادة الأعمال")
  })

  it("omits empty sections entirely (no stray headers)", () => {
    const out = formatIntelligenceContext(intel())
    expect(out).not.toContain("اللحظات المثيرة للجدل")
    expect(out).not.toContain("بذور المقاطع القصيرة")
    expect(out).not.toContain("وسوم الموضوعات")
    // The always-present core sections still render.
    expect(out).toContain("جوهر الحلقة")
    expect(out).toContain("القوس السردي")
  })
})
