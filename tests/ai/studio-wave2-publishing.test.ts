/**
 * Studio Wave 2 — stage-2 (publishing package) prompt fixes.
 *
 * Locks down the three Marzouq-verified content gaps:
 *   FIX A — the YouTube description / clips MUST link back to the full episode
 *           (and carry a visible {{EPISODE_URL}} placeholder when the URL is
 *            unknown at generation time).
 *   FIX B — the social pack targets khat's REAL 7 platforms — never LinkedIn
 *           or Facebook (no such accounts).
 *   FIX C — best_publish_time is no longer fabricated/surfaced.
 *
 * runAiTask is mocked so the generators run with no network/keys.
 */

import { describe, expect, it, vi, beforeEach } from "vitest"

const runAiTaskMock = vi.fn()
vi.mock("@/lib/ai-router", () => ({
  runAiTask: (args: unknown) => runAiTaskMock(args),
}))

import {
  buildStudioPackagePrompt,
  EPISODE_URL_PLACEHOLDER as STUDIO_PLACEHOLDER,
} from "@/lib/ai/prompts/studio-package"
import {
  buildYoutubePackFullPrompt,
  buildYoutubePackSectionPrompt,
  EPISODE_URL_PLACEHOLDER as YT_PLACEHOLDER,
} from "@/lib/ai/prompts/youtube-pack"
import { generateSocialBundle, generateDistributionPlan } from "@/lib/ai/growth"
import { growthToMarkdown } from "@/app/admin/studio/components/tab-growth"
import { emptyGrowthPackage } from "@/lib/ai/growth/types"
import type { GlobalEpisodeIntelligence } from "@/lib/ai/episode-intelligence"

const EPISODE_URL = "https://youtu.be/abc123"

// ─── FIX A — episode back-link in descriptions ──────────────────────

describe("FIX A — studio-package description links back to the full episode", () => {
  it("instructs the model to include the full-episode link + CTA", () => {
    const built = buildStudioPackagePrompt({
      videoTitle: "عنوان", channelTitle: "خط بودكاست", intelligenceBlock: "", preparedText: "نص",
    })
    expect(built.system).toContain("رابط الحلقة الكاملة")
    expect(built.system).toContain("دعوة صريحة لمشاهدة الحلقة كاملة")
  })

  it("falls back to a visible placeholder when no URL is supplied", () => {
    const built = buildStudioPackagePrompt({
      videoTitle: "عنوان", channelTitle: "خط بودكاست", intelligenceBlock: "", preparedText: "نص",
    })
    expect(built.user).toContain(`رابط الحلقة الكاملة: ${STUDIO_PLACEHOLDER}`)
    expect(STUDIO_PLACEHOLDER).toBe("{{EPISODE_URL}}")
  })

  it("threads the real episode URL into the user prompt when supplied", () => {
    const built = buildStudioPackagePrompt({
      videoTitle: "عنوان", channelTitle: "خط بودكاست", intelligenceBlock: "", preparedText: "نص",
      episodeUrl: EPISODE_URL,
    })
    expect(built.user).toContain(`رابط الحلقة الكاملة: ${EPISODE_URL}`)
    expect(built.user).not.toContain(STUDIO_PLACEHOLDER)
  })
})

describe("FIX A — youtube-pack description + clips link back to the full episode", () => {
  it("full-pack system requires a description link and clip back-references", () => {
    const built = buildYoutubePackFullPrompt({ transcript: "نص", episodeTitle: "حلقة", guestName: "ضيف" })
    expect(built.system).toContain("رابط الحلقة الكاملة")
    expect(built.system).toContain("تعيد المشاهد إلى الحلقة الكاملة")
    expect(built.user).toContain(`رابط الحلقة الكاملة: ${YT_PLACEHOLDER}`)
  })

  it("full-pack threads the real URL and marks hasEpisodeUrl", () => {
    const built = buildYoutubePackFullPrompt({
      transcript: "نص", episodeTitle: "حلقة", guestName: "ضيف", episodeUrl: EPISODE_URL,
    })
    expect(built.user).toContain(`رابط الحلقة الكاملة: ${EPISODE_URL}`)
    expect(built.input.hasEpisodeUrl).toBe(true)
  })

  it("section prompt injects the URL only for description/clips, not titles", () => {
    const desc = buildYoutubePackSectionPrompt({
      transcript: "نص", episodeTitle: "حلقة", guestName: "ضيف", sectionType: "description", episodeUrl: EPISODE_URL,
    })
    expect(desc.user).toContain(`رابط الحلقة الكاملة: ${EPISODE_URL}`)

    const clips = buildYoutubePackSectionPrompt({
      transcript: "نص", episodeTitle: "حلقة", guestName: "ضيف", sectionType: "clips",
    })
    expect(clips.user).toContain(`رابط الحلقة الكاملة: ${YT_PLACEHOLDER}`)

    const titles = buildYoutubePackSectionPrompt({
      transcript: "نص", episodeTitle: "حلقة", guestName: "ضيف", sectionType: "titles", episodeUrl: EPISODE_URL,
    })
    expect(titles.user).not.toContain("رابط الحلقة الكاملة")
  })
})

// ─── FIX B / FIX C — growth generators ──────────────────────────────

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
    controversy_moments: [],
    retention_risk_points: ["مقدمة بطيئة"],
    sponsor_safe_windows: ["بعد الموضوع الأول"],
    clip_seed_moments: [],
    topic_tags: ["تقنية"],
    guest_signature_topics: [],
    ...over,
  }
}

const input = () => ({ videoTitle: "حلقة", durationSeconds: 3600, intelligence: intel() })

beforeEach(() => {
  runAiTaskMock.mockReset()
  process.env.OPENAI_API_KEY = "test-key"
})

const REAL_PLATFORMS = ["youtube_community", "instagram", "tiktok", "x", "threads", "whatsapp"]

describe("FIX B — social pack targets khat's real platforms", () => {
  it("prompt lists exactly the real platforms, and never LinkedIn / Facebook / Snapchat", async () => {
    runAiTaskMock.mockResolvedValue({ status: "succeeded", parsed: { social_posts: [], short_form_ideas: [] }, modelName: "t", runId: "r" })
    await generateSocialBundle(input())

    const sys: string = runAiTaskMock.mock.calls[0][0].prompt[0].content
    for (const p of REAL_PLATFORMS) expect(sys).toContain(`"${p}"`)
    // linkedin/facebook may appear only as an explicit prohibition, never as a
    // target platform KEY.
    expect(sys).not.toContain(`"linkedin"`)
    expect(sys).not.toContain(`"facebook"`)
    // SNAPCHAT WAS ONE OF THE SEVEN UNTIL 2026-08-05 — «شيل ايقونة سناب شات ما
    // ابيها». The row is gone from both databases and from the seed; this stops
    // the GENERATOR from writing a post for a platform KHAT does not publish
    // on, which no database change could prevent on its own.
    expect(sys).not.toContain(`"snapchat"`)
  })

  it("markdown labels the newer platforms (threads / whatsapp)", () => {
    const pkg = emptyGrowthPackage()
    pkg.social_posts = [
      { platform: "threads", caption: "أ", hashtags: [] },
      { platform: "whatsapp", caption: "ج", hashtags: [] },
    ]
    const md = growthToMarkdown(pkg)
    expect(md).toContain("ثريدز")
    expect(md).toContain("واتساب")
  })
})

describe("FIX C — best_publish_time is no longer produced or requested", () => {
  it("distribution result carries no best_publish_time", async () => {
    runAiTaskMock.mockResolvedValue({
      status: "succeeded",
      parsed: {
        sponsor_placements: [{ type: "mid_roll", position_label: "بعد X", approx_timestamp: "00:20:00", why: "فاصل" }],
        // A stray field from an old model response must NOT leak through.
        best_publish_time: { day: "الثلاثاء", time_window: "8-10", timezone: "GMT+3", rationale: "x", alternatives: [] },
        retention_recommendations: [{ risk_point: "مقدمة", recommendation: "اقطع" }],
      },
      modelName: "t", runId: "r",
    })

    const res = await generateDistributionPlan(input())
    expect(res.success).toBe(true)
    expect(res.data && "best_publish_time" in res.data).toBe(false)
    expect(res.data?.sponsor_placements).toHaveLength(1)
  })

  it("prompt no longer asks for a publish time and guards against inventing one", async () => {
    runAiTaskMock.mockResolvedValue({ status: "succeeded", parsed: { sponsor_placements: [], retention_recommendations: [] }, modelName: "t", runId: "r" })
    await generateDistributionPlan(input())

    const sys: string = runAiTaskMock.mock.calls[0][0].prompt[0].content
    expect(sys).not.toContain("best_publish_time")
    expect(sys).toContain("لا تقترح")
  })
})
