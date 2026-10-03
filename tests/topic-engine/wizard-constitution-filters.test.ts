/**
 * Season wizard v2 — constitution gaps found in the 2026-10-03 read:
 *
 *   #9  a forbidden subcategory (e.g. `geopolitical_shifts`) returned by the
 *       model was accepted — the forbidden list only kept it out of the MENU.
 *   #10 the editorial contract has no `topic_domain`, so every editorial card
 *       normalised to "none" and the admin's disabled-domain filter never
 *       fired on that path (persistence later derived the real domain from the
 *       category — too late for the filter).
 *   #11 the lens menu offered `political` «سياسي» and a `religious` lens about
 *       "the sacred and the religious heritage" — the constitution forbids
 *       politics and religious dispute; faith appears only as a personal
 *       experience.
 */
import { describe, it, expect, vi } from "vitest"

const h = vi.hoisted(() => ({ runAiTask: vi.fn() }))
vi.mock("@/lib/ai-router", () => ({ runAiTask: h.runAiTask }))
vi.mock("@/lib/db", () => ({ db: {} }))

import { applyEditorialFilters } from "@/lib/khat-map/v2/editorial-filter"
import { openaiEngineAI } from "@/lib/khat-map/v2/openai-engine-ai"
import { buildLensesBlock } from "@/lib/khat-map/v2/prompts-editorial"
import { clampLenses, lensById } from "@/lib/khat-map/v2/lenses"
import { KHAT_EDITORIAL_CONTROLS_DEFAULTS } from "@/types/khat-map"
import type { RawCandidate } from "@/lib/khat-map/v2/types"
import { neutralTaste } from "@/lib/khat-map/v2/embedding-pipeline"

function raw(over: Partial<RawCandidate["topic"]> = {}): RawCandidate {
  return {
    topic: {
      working_title: "رجل عاد إلى قريته بعد ثلاثين سنة",
      hook: "ماذا يحدث حين تعود إلى مكان لم يعد يعرفك؟",
      why_matters: "",
      why_now: "",
      goal: "",
      description: "",
      episode_type: "personal_story",
      topic_domain: "none",
      topic_angle_code: null,
      main_axes: [],
      suggested_questions: [],
      risk_level: null,
      effort_level: null,
      sponsor_appeal: null,
      category: "human_stories",
      subcategory: null,
      sensitivity_flags: [],
      ...over,
    } as RawCandidate["topic"],
    guest: null,
    editorial_score: 7,
    why_now: "",
  } as RawCandidate
}

describe("#9 forbidden subcategory from the model is dropped", () => {
  it("drops geopolitical_shifts even when the text passes the lexicon", () => {
    const r = applyEditorialFilters(
      [raw({ category: "real_world", subcategory: "geopolitical_shifts" })],
      KHAT_EDITORIAL_CONTROLS_DEFAULTS,
    )
    expect(r.kept).toHaveLength(0)
    expect(r.dropped[0].reason).toBe("forbidden_territory")
  })

  it("keeps an allowed subcategory and off_map", () => {
    const r = applyEditorialFilters(
      [raw({ subcategory: "off_map" }), raw({ subcategory: null })],
      KHAT_EDITORIAL_CONTROLS_DEFAULTS,
    )
    expect(r.kept).toHaveLength(2)
  })
})

describe("#10 editorial cards carry a real topic_domain", () => {
  it("normalises topic_domain from the category so the disabled-domain filter fires", async () => {
    h.runAiTask.mockResolvedValue({
      status: "succeeded",
      parsed: {
        topics: [
          {
            topic: {
              working_title: "التاجر الذي خسر كل شيء ثم بدأ من دكان صغير",
              hook: "ماذا تفعل حين تخسر كل ما بنيته في ليلة؟",
              category: "business",
              subcategory: "off_map",
              episode_type: "personal_story",
            },
            guest: null,
            editorial_score: 7,
          },
        ],
      },
    })
    const raws = await openaiEngineAI.generateCandidates({
      season_id: "s1",
      target_count: 1,
      season_target: 10,
      accepted_domain_counts: {},
      accepted_titles: [],
      rejected_titles: [],
      rejected_reason_categories: [],
      taste_profile: neutralTaste(),
      invasion_policy: "optional",
      editorial_controls: KHAT_EDITORIAL_CONTROLS_DEFAULTS,
      phase: "topics",
      extra_system_blocks: [],
      editorial: true,
    } as never)
    expect(raws[0].topic.topic_domain).not.toBe("none")
    const domain = raws[0].topic.topic_domain
    const r = applyEditorialFilters(raws, {
      ...KHAT_EDITORIAL_CONTROLS_DEFAULTS,
      domain_weights: { [domain]: 0 },
    } as never)
    expect(r.dropped[0]?.reason).toBe("disabled_domain")
  })
})

describe("#11 the lens menu honours the constitution", () => {
  it("does not offer a political lens", () => {
    const menu = buildLensesBlock()
    expect(menu).not.toMatch(/\bpolitical\b/)
    expect(menu).not.toContain("سياسي")
    expect(clampLenses(["political", "historical"])).toEqual(["historical"])
  })

  it("offers faith only as a personal experience — no dispute, no doctrine", () => {
    const faith = lensById("religious")
    expect(faith?.hint_ar).toContain("تجربة")
    expect(faith?.hint_ar).toMatch(/لا جدل/)
    // a stored chip with the retired id still renders a label
    expect(lensById("political")?.label_ar).toBe("سياسي")
  })
})
