/**
 * P1 — Studio redesign: Growth package orchestrator.
 *
 * Locks down that generateGrowthPackage:
 *   1. assembles every slice into one GrowthPackage,
 *   2. surfaces controversy angles from the shared intelligence (free), and
 *   3. is resilient — a single failing slice leaves its part empty + records
 *      the error in meta, but the package still succeeds.
 *
 * runAiTask is mocked so no network/keys are needed. Each generator reads only
 * its own keys from the parsed object, so one mega-response drives them all;
 * the resilience test keys off the packaging prompt to fail that slice only.
 */

import { describe, expect, it, vi, beforeEach } from "vitest"

// A single parsed object satisfying all four growth generators at once.
const FULL_PARSED = {
  thumbnail_concepts: [
    { concept: "المواجهة", mood: "توتر", color_palette: "أحمر/أسود", composition: "وجه مقرب", focal_text: "لماذا؟", image_prompt: "high contrast portrait" },
  ],
  opening_hook: { hook_script: "ابدأ بالسؤال الصادم", rationale: "يثير الفضول", alt_hooks: ["بديل 1"] },
  sponsor_placements: [
    { type: "mid_roll", position_label: "بعد الموضوع الأول", approx_timestamp: "00:20:00", why: "فاصل طبيعي" },
  ],
  best_publish_time: { day: "الثلاثاء", time_window: "8-10 مساءً", timezone: "GMT+3", rationale: "ذروة المشاهدة", alternatives: ["الجمعة"] },
  retention_recommendations: [{ risk_point: "مقدمة بطيئة", recommendation: "اقطع أول دقيقة" }],
  social_posts: [{ platform: "x", caption: "تغريدة جاهزة", hashtags: ["بودكاست"] }],
  short_form_ideas: [{ title: "فكرة قصيرة", angle: "خطاف", source_moment: "لحظة", platforms: ["tiktok"] }],
  summary: "استراتيجية موحّدة",
  positioning: "موضعة فريدة",
  target_audience: "جمهور عميق",
  priority_actions: ["افعل أولاً", "ثم هذا"],
}

const runAiTaskMock = vi.fn()
vi.mock("@/lib/ai-router", () => ({
  runAiTask: (args: unknown) => runAiTaskMock(args),
}))

import { generateGrowthPackage } from "@/lib/ai/growth"
import type { GlobalEpisodeIntelligence } from "@/lib/ai/episode-intelligence"

function intel(over: Partial<GlobalEpisodeIntelligence> = {}): GlobalEpisodeIntelligence {
  return {
    narrative_arc: { beginning: "", development: "", key_insight: "", conclusion: "" },
    turning_points: [],
    strongest_moments: [],
    core_ideas: [],
    themes: [],
    emotional_peaks: [],
    guest_profile: null,
    episode_essence: "جوهر",
    controversy_moments: ["زاوية جدلية أولى", "زاوية ثانية"],
    retention_risk_points: ["مقدمة بطيئة"],
    sponsor_safe_windows: ["بعد الموضوع الأول"],
    clip_seed_moments: ["مقطع"],
    topic_tags: ["تقنية"],
    guest_signature_topics: [],
    ...over,
  }
}

const input = () => ({ videoTitle: "حلقة تجريبية", durationSeconds: 3600, intelligence: intel() })

beforeEach(() => {
  runAiTaskMock.mockReset()
  process.env.OPENAI_API_KEY = "test-key"
})

describe("generateGrowthPackage — assembly", () => {
  it("assembles all slices and surfaces controversy angles from intelligence", async () => {
    runAiTaskMock.mockResolvedValue({
      status: "succeeded",
      parsed: FULL_PARSED,
      modelName: "test",
      runId: "run-1",
      tokensIn: 1,
      tokensOut: 1,
    })

    const res = await generateGrowthPackage(input())
    expect(res.success).toBe(true)
    expect(res.data.thumbnail_concepts).toHaveLength(1)
    expect(res.data.opening_hook?.hook_script).toContain("الصادم")
    expect(res.data.sponsor_placements[0].type).toBe("mid_roll")
    expect(res.data.best_publish_time?.day).toBe("الثلاثاء")
    expect(res.data.social_posts[0].platform).toBe("x")
    expect(res.data.short_form_ideas).toHaveLength(1)
    expect(res.data.marketing_strategy?.priority_actions).toHaveLength(2)
    // Controversy angles come straight from intelligence, no extra call.
    expect(res.data.controversy_angles).toEqual(["زاوية جدلية أولى", "زاوية ثانية"])
    // 4 generators: packaging, distribution, social, marketing.
    expect(runAiTaskMock).toHaveBeenCalledTimes(4)
  })

  it("reports progress for each slice", async () => {
    runAiTaskMock.mockResolvedValue({ status: "succeeded", parsed: FULL_PARSED, modelName: "test", runId: "r" })
    const seen: string[] = []
    await generateGrowthPackage(input(), (slice) => seen.push(slice))
    expect(seen).toEqual(expect.arrayContaining(["packaging", "distribution", "social", "marketing"]))
  })
})

describe("generateGrowthPackage — resilience", () => {
  it("survives a single failing slice (packaging) and records the error", async () => {
    runAiTaskMock.mockImplementation((args: { prompt: Array<{ content: string }> }) => {
      const sys = args.prompt?.[0]?.content ?? ""
      if (sys.includes("مدير تغليف")) {
        return Promise.resolve({ status: "failed", errorMessage: "boom", runId: "r" })
      }
      return Promise.resolve({ status: "succeeded", parsed: FULL_PARSED, modelName: "test", runId: "r" })
    })

    const res = await generateGrowthPackage(input())
    expect(res.success).toBe(true) // other slices carried it
    expect(res.data.thumbnail_concepts).toHaveLength(0)
    expect(res.data.opening_hook).toBeNull()
    expect(res.data.social_posts).toHaveLength(1)
    expect(res.data.meta?.errors?.packaging).toBe("boom")
  })

  it("fails only when no substantive slice produced output", async () => {
    runAiTaskMock.mockResolvedValue({ status: "failed", errorMessage: "all down", runId: "r" })
    const res = await generateGrowthPackage(input())
    expect(res.success).toBe(false)
    expect(res.error).toBeTruthy()
  })
})
