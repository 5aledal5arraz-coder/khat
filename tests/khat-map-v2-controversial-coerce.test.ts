/**
 * The season wizard (khat-map v2) no longer offers episode_type
 * «controversial» (2026-10-02, same rule as hybrid-topics v4.1). A model that
 * still returns it gets the closest allowed type by the topic's own domain —
 * the same mapping coerceEpisodeType uses — and the prompt versions moved.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ calls: [] as Array<{ promptVersion?: string }>, parsed: null as unknown }))
vi.mock("@/lib/db", () => ({ db: null }))
vi.mock("@/lib/khat-map/learning/embeddings", () => ({ embed: vi.fn() }))
// The prompt text is pinned in constitution-batch2.test.ts; here only the
// boundary normalizer and the version tags matter.
vi.mock("@/lib/khat-map/v2/prompts", () => ({
  buildBatchSystemPrompt: () => "s",
  buildBatchUserPrompt: () => "u",
  buildGuestAnalyzeSystemPrompt: () => "s",
  buildGuestAnalyzeUserPrompt: () => "u",
  buildGuestAnchoredSystemPrompt: () => "s",
  buildGuestAnchoredUserPrompt: () => "u",
}))
vi.mock("@/lib/khat-map/v2/prompts-editorial", () => ({
  buildEditorialSystemPrompt: () => "s",
  buildEditorialUserPrompt: () => "u",
}))
vi.mock("@/lib/ai-router", () => ({
  runAiTask: vi.fn(async (req: { promptVersion?: string }) => {
    h.calls.push({ promptVersion: req.promptVersion })
    return { status: "succeeded", runId: "r", parsed: h.parsed }
  }),
}))

import { openaiEngineAI } from "@/lib/khat-map/v2/openai-engine-ai"
import { coerceEpisodeType } from "@/lib/hybrid-topics/generate"

const topic = (episode_type: string, topic_domain: string) => ({
  topic: { working_title: `حلقة ${episode_type} ${topic_domain}`, episode_type, topic_domain },
  guest: null,
})

beforeEach(() => {
  h.calls = []
})

const genInput = (editorial: boolean) =>
  ({
    season_id: "s1",
    target_count: 4,
    season_target: 10,
    accepted_domain_counts: {},
    accepted_titles: [],
    rejected_titles: [],
    rejected_reason_categories: [],
    taste_profile: null,
    invasion_policy: "optional",
    editorial_controls: undefined,
    phase: "topics",
    extra_system_blocks: [],
    editorial,
  }) as never

describe("khat-map v2 — controversial is coerced, never persisted", () => {
  it.each([
    ["psychology", "psychological"],
    ["money_career", "economic"],
    ["philosophy", "intellectual"],
    ["relationships", "social"],
    ["none", "social"],
  ])("controversial + %s → %s (same map as hybrid-topics)", async (domain, expected) => {
    h.parsed = { topics: [topic("controversial", domain)] }
    const [c] = await openaiEngineAI.generateCandidates(genInput(false))
    expect(c.topic.episode_type).toBe(expected)
    expect(coerceEpisodeType("controversial", "x", domain)).toBe(expected)
  })

  it("other types pass through untouched", async () => {
    h.parsed = { topics: [topic("historical", "kuwait_gulf")] }
    const [c] = await openaiEngineAI.generateCandidates(genInput(false))
    expect(c.topic.episode_type).toBe("historical")
  })

  it("guest-anchored path coerces too", async () => {
    h.parsed = { topics: [topic("controversial", "psychology")] }
    const [c] = await openaiEngineAI.generateGuestAnchoredTopics({
      guest_profile: { full_name: "ضيف", gender: "male", expertise_domains: [] },
      angle_count: 1,
      rejected_titles: [],
      taste_profile: null,
    } as never)
    expect(c.topic.episode_type).toBe("psychological")
  })

  it("prompt versions bumped (batch v4, editorial v3, guest-anchored v4)", async () => {
    h.parsed = { topics: [topic("social", "none")] }
    await openaiEngineAI.generateCandidates(genInput(false))
    await openaiEngineAI.generateCandidates(genInput(true))
    await openaiEngineAI.generateGuestAnchoredTopics({
      guest_profile: { full_name: "ضيف", gender: "male", expertise_domains: [] },
      angle_count: 1,
      rejected_titles: [],
      taste_profile: null,
    } as never)
    expect(h.calls.map((c) => c.promptVersion)).toEqual([
      "khat-map-batch-v4-constitution",
      "khat-map-editorial-v3-constitution",
      "khat-map-guest-anchored-v4-constitution",
    ])
  })
})
