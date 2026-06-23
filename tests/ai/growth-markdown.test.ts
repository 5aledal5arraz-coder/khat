/**
 * P2 — Studio redesign: Growth tab "Copy All / Export" serializer.
 *
 * growthToMarkdown is what the operator copies in one click, so it must
 * faithfully include every populated asset and gracefully omit empty ones.
 */

import { describe, expect, it } from "vitest"
import { growthToMarkdown } from "@/app/admin/studio/components/tab-growth"
import { emptyGrowthPackage, type GrowthPackage } from "@/lib/ai/growth/types"

function fullPackage(): GrowthPackage {
  return {
    thumbnail_concepts: [
      { concept: "المواجهة", mood: "توتر", color_palette: "أحمر/أسود", composition: "وجه مقرب", focal_text: "لماذا؟", image_prompt: "high contrast portrait" },
    ],
    opening_hook: { hook_script: "ابدأ بالسؤال الصادم", rationale: "يثير الفضول", alt_hooks: ["بديل واحد"] },
    sponsor_placements: [
      { type: "mid_roll", position_label: "بعد الموضوع الأول", approx_timestamp: "00:20:00", why: "فاصل طبيعي" },
    ],
    best_publish_time: { day: "الثلاثاء", time_window: "8-10 مساءً", timezone: "GMT+3", rationale: "ذروة المشاهدة", alternatives: ["الجمعة"] },
    retention_recommendations: [{ risk_point: "مقدمة بطيئة", recommendation: "اقطع أول دقيقة" }],
    social_posts: [{ platform: "x", caption: "تغريدة جاهزة", hashtags: ["بودكاست"] }],
    short_form_ideas: [{ title: "فكرة قصيرة", angle: "خطاف", source_moment: "لحظة", platforms: ["tiktok"] }],
    controversy_angles: ["زاوية جدلية"],
    marketing_strategy: { summary: "استراتيجية", positioning: "موضعة", target_audience: "جمهور", priority_actions: ["افعل أولاً"] },
  }
}

describe("growthToMarkdown", () => {
  it("includes every populated asset section", () => {
    const md = growthToMarkdown(fullPackage())
    expect(md).toContain("# حزمة النمو والنشر")
    expect(md).toContain("## الاستراتيجية التسويقية")
    expect(md).toContain("1. افعل أولاً")
    expect(md).toContain("## خطاف الافتتاح")
    expect(md).toContain("ابدأ بالسؤال الصادم")
    expect(md).toContain("## مفاهيم الصورة المصغّرة")
    expect(md).toContain("high contrast portrait")
    expect(md).toContain("## أفضل وقت للنشر")
    expect(md).toContain("## مواضع الإعلانات")
    expect(md).toContain("00:20:00")
    expect(md).toContain("## توصيات الاحتفاظ")
    expect(md).toContain("## منشورات المنصات")
    expect(md).toContain("إكس (تويتر)")
    expect(md).toContain("#بودكاست")
    expect(md).toContain("## أفكار المحتوى القصير")
    expect(md).toContain("## زوايا جدلية / لافتة")
  })

  it("omits empty sections and never throws on an empty package", () => {
    const md = growthToMarkdown(emptyGrowthPackage())
    expect(md).toContain("# حزمة النمو والنشر")
    expect(md).not.toContain("## الاستراتيجية التسويقية")
    expect(md).not.toContain("## منشورات المنصات")
    expect(md).not.toContain("## خطاف الافتتاح")
  })
})
