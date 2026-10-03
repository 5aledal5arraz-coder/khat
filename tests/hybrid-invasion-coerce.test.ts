/**
 * `invasion` means the 1990 Iraqi invasion of Kuwait ONLY (2026-09-28).
 *
 * The hybrid prompt listed the enum unglossed and the model used it for
 * figurative "invasions"; to-preparation then maps the type to the invasion
 * content_focus of the whole preparation. The prompt now glosses it, and
 * coerceCandidate keeps `invasion` only when the topic's own text says so.
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/ai-router", () => ({ runAiTask: vi.fn() }))
vi.mock("@/lib/db", () => ({ db: {} }))

import { coerceCandidate, coerceEpisodeType } from "@/lib/hybrid-topics/generate"
import { buildHybridTopicsPrompt, HYBRID_TOPICS_PROMPT_VERSION } from "@/lib/ai/prompts/hybrid-topics"

describe("invasion — literal only", () => {
  it("kept when the text names the invasion (غزو / الاحتلال / 1990)", () => {
    expect(coerceEpisodeType("invasion", "ذاكرة الغزو في بيوت الكويت")).toBe("invasion")
    expect(coerceEpisodeType("invasion", "سبعة أشهر تحت الاحتلال")).toBe("invasion")
    expect(coerceEpisodeType("invasion", "صيف 1990")).toBe("invasion")
  })

  it("coerced to intellectual when nothing in the topic is about it", () => {
    expect(coerceEpisodeType("invasion", "المال يتذكّر ما نسيته العائلة")).toBe("intellectual")
  })

  it("other types and unknowns keep their existing behaviour", () => {
    expect(coerceEpisodeType("economic", "المال")).toBe("economic")
    expect(coerceEpisodeType("nonsense", "x")).toBe("intellectual")
  })

  it("coerceCandidate reads the topic's own fields", () => {
    const base = { title: "المال يتذكّر ما نسيته العائلة", suggested_episode_type: "invasion" }
    expect(coerceCandidate(base).suggested_episode_type).toBe("intellectual")
    expect(
      coerceCandidate({ ...base, conflict_angle: "ثروات ضاعت ليلة الغزو" }).suggested_episode_type,
    ).toBe("invasion")
  })

  it("the prompt glosses the enum; the audience rule is the constitution's (v4)", () => {
    const built = buildHybridTopicsPrompt({
      language: "ar",
      count: 5,
      allowKuwaitBias: false,
      originalTopics: [],
      marketClusters: [],
      workedReport: {
        generated_at: "2026-09-28T00:00:00.000Z",
        strong_topic_domains: [],
        weak_topic_domains: [],
        top_episodes: [],
        weak_episodes: [],
        strong_episode_types: [],
        weak_episode_types: [],
        strong_guests: [],
        recommendations: [],
      },
      tasteHints: [],
      excludedTitles: [],
      lenses: [],
    } as never)
    expect(built.system).toContain("`invasion` means the 1990 Iraqi invasion of Kuwait ONLY")
    // 2026-09-28: the pan-Arab ban on Kuwaiti references gave way to the
    // constitution's audience rule — pan-Arab titles, Kuwaiti-rooted stories.
    expect(HYBRID_TOPICS_PROMPT_VERSION).toBe("hybrid-topics-v5-constitution")
    expect(built.system).toContain("every title is understood by any Arab")
    expect(built.system).toContain("may be Kuwaiti-rooted")
    expect(built.system).not.toContain("Do NOT use Kuwait-specific framing")
  })
})

/**
 * Batch 3 D5a (2026-09-29): «controversial» is not a Khat goal under the
 * constitution, yet the hybrid prompt still offered it and ab7d12c1 «كان
 * حسابنا المشترك أكثر حميمية منا» came back typed controversial. The enum
 * stays in the schema for old rows; new topics never carry it.
 */
describe("controversial — never emitted by the hybrid generator", () => {
  it("the real ab7d12c1 topic is coerced to the closest allowed type", () => {
    const c = coerceCandidate({
      title: "كان حسابنا المشترك أكثر حميمية منا",
      suggested_episode_type: "controversial",
      suggested_topic_domain: "relationships",
    })
    expect(c.suggested_episode_type).not.toBe("controversial")
    expect(c.suggested_episode_type).toBe("social")
  })

  it("maps by domain; unknown domain falls back to social", () => {
    expect(coerceEpisodeType("controversial", "x", "psychology")).toBe("psychological")
    expect(coerceEpisodeType("controversial", "x", "money_career")).toBe("economic")
    expect(coerceEpisodeType("controversial", "x", "philosophy")).toBe("intellectual")
    expect(coerceEpisodeType("controversial", "x", "none")).toBe("social")
    expect(coerceEpisodeType("controversial", "x")).toBe("social")
  })

  it("the prompt no longer offers it", () => {
    const built = buildHybridTopicsPrompt({
      language: "ar",
      count: 5,
      allowKuwaitBias: false,
      originalTopics: [],
      marketClusters: [],
      workedReport: {
        generated_at: "2026-09-29T00:00:00.000Z",
        strong_topic_domains: [],
        weak_topic_domains: [],
        top_episodes: [],
        weak_episodes: [],
        strong_episode_types: [],
        weak_episode_types: [],
        strong_guests: [],
        recommendations: [],
      },
      tasteHints: [],
      excludedTitles: [],
      lenses: [],
    } as never)
    const typeLine = built.system.split("\n").find((l) => l.includes("suggested_episode_type drawn from"))
    expect(typeLine).toBeDefined()
    expect(typeLine).not.toContain("controversial")
  })
})
