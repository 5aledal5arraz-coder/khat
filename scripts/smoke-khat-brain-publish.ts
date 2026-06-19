/**
 * UX-10 — Khat Brain Publishing & Website Package smoke.
 *
 * Pure node-side smoke: drives publish primitives (reducer + coercion +
 * validation + readiness scoring) and asserts on workspace wiring.
 * No DB, no DOM.
 */

import { promises as fs } from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "..")
const FAIL: string[] = []
const PASS: string[] = []

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}
async function readRel(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), "utf8")
}
async function caseRun(label: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    PASS.push(label)
    console.log(`✅ ${label}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    FAIL.push(`${label} — ${message}`)
    console.log(`❌ ${label}`)
    console.log(`   ${message}`)
  }
}

async function main() {
  console.log("\n🧪 smoke-khat-brain-publish — UX-10 verification\n")

  const types = await import("../lib/editorial/publish-types")
  const validation = await import("../lib/editorial/publish-validation")
  const {
    coerceWebsitePackageDocument,
    emptyWebsitePackageDocument,
    isValidSlug,
    publishReducer,
    slugifyTitle,
  } = types
  const {
    issuesForField,
    validateWebsitePackageDocument,
  } = validation

  // ─── Phase A — model + coercion + reducer ─────────────────────────

  await caseRun("1/22 coerceWebsitePackageDocument: empty + partial + complete", () => {
    const empty = coerceWebsitePackageDocument(null)
    assert(empty.schema_version === 1, "schema v1")
    assert(empty.website_package.final_title === "", "empty title")
    assert(empty.publish_status === "draft", "default status")
    assert(empty.visibility === "public", "default visibility")
    const partial = coerceWebsitePackageDocument({
      version: 4,
      website_package: { final_title: "  حلقة  ", slug: "hello" },
      publish_status: "ready",
    })
    assert(partial.version === 4, "version preserved")
    assert(partial.website_package.final_title === "  حلقة  ", "title preserved")
    assert(partial.publish_status === "ready", "status preserved")
  })

  await caseRun("2/22 publishReducer: patch each section independently", () => {
    let doc = emptyWebsitePackageDocument()
    doc = publishReducer(doc, {
      type: "patch_website",
      patch: { final_title: "هوية وانتماء" },
    })
    assert(doc.website_package.final_title === "هوية وانتماء", "website patch")
    doc = publishReducer(doc, {
      type: "patch_youtube",
      patch: { youtube_title: "Identity & Belonging" },
    })
    assert(doc.youtube_package.youtube_title === "Identity & Belonging", "youtube patch")
    doc = publishReducer(doc, {
      type: "patch_seo",
      patch: { search_intent: "narrative" },
    })
    assert(doc.seo_package.search_intent === "narrative", "seo patch")
    doc = publishReducer(doc, {
      type: "patch_analytics",
      patch: { expected_retention: 150 }, // out-of-range → clamped to 100
    })
    assert(doc.analytics_expectation.expected_retention === 100, "analytics clamped")
    doc = publishReducer(doc, { type: "set_status", status: "in_review" })
    assert(doc.publish_status === "in_review", "status set")
    doc = publishReducer(doc, { type: "set_visibility", visibility: "members_only" })
    assert(doc.visibility === "members_only", "visibility set")
    doc = publishReducer(doc, { type: "set_featured", priority: "headline" })
    assert(doc.featured_priority === "headline", "featured set")
  })

  await caseRun("3/22 slugifyTitle handles Arabic + Latin + punctuation", () => {
    const s = slugifyTitle("هوية و انتماء — Episode 4!")
    assert(isValidSlug(s), `expected valid slug, got "${s}"`)
    assert(s.includes("episode") && s.includes("4"), "Latin preserved")
    assert(!s.includes("—") && !s.includes("!"), "punctuation stripped")
    const fallback = slugifyTitle("")
    assert(isValidSlug(fallback), "empty fallback returns valid slug")
  })

  await caseRun("4/22 isValidSlug: accepts arabic-latin-hyphen, rejects garbage", () => {
    assert(isValidSlug("hello-world"), "latin-hyphen accepted")
    assert(isValidSlug("هوية-وانتماء"), "arabic-hyphen accepted")
    assert(isValidSlug("episode-2026-04"), "digits accepted")
    assert(!isValidSlug(""), "empty rejected")
    assert(!isValidSlug("-leading"), "leading hyphen rejected")
    assert(!isValidSlug("trailing-"), "trailing hyphen rejected")
    assert(!isValidSlug("with spaces"), "spaces rejected")
    assert(!isValidSlug("has/slash"), "slash rejected")
    assert(isValidSlug("a".repeat(120)), "120 chars accepted")
    assert(!isValidSlug("a".repeat(121)), "121 chars rejected")
  })

  // ─── Validation ────────────────────────────────────────────────────

  await caseRun("5/22 validation: missing title is blocker", () => {
    const r = validateWebsitePackageDocument(emptyWebsitePackageDocument())
    assert(r.issues.some((i) => i.code === "missing_title" && i.severity === "blocker"), "missing_title")
    assert(!r.canPublish, "cannot publish")
  })

  await caseRun("6/22 validation: missing slug + invalid slug + duplicate slug", () => {
    let doc = emptyWebsitePackageDocument()
    doc = publishReducer(doc, {
      type: "patch_website",
      patch: { final_title: "عنوان جيّد", canonical_description: "وصف طويل بما فيه الكفاية للحدّ الأدنى" },
    })
    let r = validateWebsitePackageDocument(doc)
    assert(r.issues.some((i) => i.code === "missing_slug"), "missing_slug")
    doc = publishReducer(doc, { type: "patch_website", patch: { slug: "BAD SLUG" } })
    r = validateWebsitePackageDocument(doc)
    assert(r.issues.some((i) => i.code === "invalid_slug"), "invalid_slug")
    doc = publishReducer(doc, { type: "patch_website", patch: { slug: "ok-slug" } })
    r = validateWebsitePackageDocument(doc, ["ok-slug"])
    assert(r.issues.some((i) => i.code === "duplicate_slug"), "duplicate_slug")
  })

  await caseRun("7/22 validation: missing description is blocker, short description warning", () => {
    let doc = emptyWebsitePackageDocument()
    doc = publishReducer(doc, {
      type: "patch_website",
      patch: { final_title: "عنوان جيد", slug: "ok" },
    })
    let r = validateWebsitePackageDocument(doc)
    assert(r.issues.some((i) => i.code === "missing_description"), "missing_description")
    doc = publishReducer(doc, {
      type: "patch_website",
      patch: { canonical_description: "قصير" },
    })
    r = validateWebsitePackageDocument(doc)
    assert(r.issues.some((i) => i.code === "short_description"), "short_description")
  })

  await caseRun("8/22 validation: chapters/clips linkage are blockers", () => {
    const r = validateWebsitePackageDocument(emptyWebsitePackageDocument())
    assert(r.issues.some((i) => i.code === "no_chapters_linked"), "no_chapters_linked")
    assert(r.issues.some((i) => i.code === "no_clips_linked"), "no_clips_linked")
  })

  await caseRun("9/22 validation: status_with_blocker fires when ready with blockers", () => {
    let doc = emptyWebsitePackageDocument()
    doc = publishReducer(doc, { type: "set_status", status: "ready" })
    const r = validateWebsitePackageDocument(doc)
    assert(
      r.issues.some((i) => i.code === "status_with_blocker" && i.severity === "blocker"),
      "status_with_blocker raised",
    )
  })

  await caseRun("10/22 identity enforcement: bait language warning", () => {
    let doc = emptyWebsitePackageDocument()
    doc = publishReducer(doc, {
      type: "patch_website",
      patch: { final_title: "صادم: لن تصدق ما قاله الضيف" },
    })
    const r = validateWebsitePackageDocument(doc)
    assert(r.issues.some((i) => i.code === "bait_language"), "bait_language")
  })

  await caseRun("11/22 identity enforcement: generic word info + shouting warning", () => {
    let doc = emptyWebsitePackageDocument()
    doc = publishReducer(doc, {
      type: "patch_website",
      patch: { final_title: "حلقة جميلة BREAKING NEWS" },
    })
    const r = validateWebsitePackageDocument(doc)
    assert(r.issues.some((i) => i.code === "generic_language"), "generic_language")
    assert(r.issues.some((i) => i.code === "shouting_text"), "shouting_text")
  })

  await caseRun("12/22 validation: sponsor missing CTA warning", () => {
    let doc = emptyWebsitePackageDocument()
    doc = publishReducer(doc, {
      type: "patch_sponsor",
      patch: { sponsor_mentions: ["Brand X"] },
    })
    const r = validateWebsitePackageDocument(doc)
    assert(r.issues.some((i) => i.code === "sponsor_missing_cta"), "sponsor_missing_cta")
  })

  await caseRun("13/22 validation: meta-titles identical is info", () => {
    let doc = emptyWebsitePackageDocument()
    const title = "هوية وانتماء"
    doc = publishReducer(doc, {
      type: "patch_website",
      patch: {
        final_title: title,
        slug: "ok",
        canonical_description: "وصف طويل بما فيه الكفاية للتحقق",
      },
    })
    doc = publishReducer(doc, {
      type: "patch_seo",
      patch: { meta_title: title, og_title: title },
    })
    const r = validateWebsitePackageDocument(doc)
    assert(r.issues.some((i) => i.code === "seo_titles_identical" && i.severity === "info"), "seo_titles_identical info")
  })

  await caseRun("14/22 issuesForField: scoping works", () => {
    let doc = emptyWebsitePackageDocument()
    doc = publishReducer(doc, {
      type: "patch_website",
      patch: { final_title: "" }, // missing title
    })
    const r = validateWebsitePackageDocument(doc)
    const titleIssues = issuesForField(r, "website_package.final_title")
    const slugIssues = issuesForField(r, "website_package.slug")
    assert(titleIssues.some((i) => i.code === "missing_title"), "title issue scoped")
    assert(!titleIssues.some((i) => i.code === "missing_slug"), "slug issue not in title scope")
    assert(slugIssues.some((i) => i.code === "missing_slug"), "slug issue scoped")
  })

  // ─── Readiness scoring ─────────────────────────────────────────────

  await caseRun("15/22 readiness: empty doc has low score + actionable recommendation", () => {
    const r = validateWebsitePackageDocument(emptyWebsitePackageDocument())
    assert(r.readiness.score < 30, `expected <30, got ${r.readiness.score}`)
    assert(r.readiness.recommendation.length > 0, "recommendation present")
  })

  await caseRun("16/22 readiness: a complete doc scores >= 75 + canPublish=true", () => {
    let doc = emptyWebsitePackageDocument()
    // Stamp linkage fields to satisfy cross-context blockers.
    doc = {
      ...doc,
      source_transcript_record_id: "trx-1",
      source_chapter_record_id: "ch-1",
      source_clip_record_id: "cl-1",
    }
    doc = publishReducer(doc, {
      type: "patch_website",
      patch: {
        final_title: "هوية وانتماء بين الكويت والعالم",
        subtitle: "حوار مع ضيف عن أسئلة الانتماء",
        slug: "kuwait-identity-belonging",
        canonical_description:
          "حلقة عميقة تناقش هويّة الجيل الكويتي الجديد بين الانتماء المحلّي والعولمة. سياق تحريري واضح.",
        episode_summary:
          "ملخّص أطول للحلقة يقدّم محاور النقاش والاكتشافات التي وصل إليها الضيف خلال الجلسة.",
        key_takeaways: [
          "الهويّة تُبنى وتُعاد كتابتها عبر الأجيال",
          "التوتّر بين المحلّي والعالمي مادّة فلسفية حيّة",
          "الحضور الرقمي يعيد تعريف الانتماء",
        ],
        quote_highlights: [
          "«لا أحتاج إلى أن أختار بين كويتيتي وحضوري العالمي»",
        ],
        emotional_keywords: ["انتماء", "حنين", "اغتراب"],
        topic_keywords: ["هوية", "كويت", "أجيال"],
      },
    })
    doc = publishReducer(doc, {
      type: "patch_youtube",
      patch: {
        youtube_title: "هوية وانتماء بين الكويت والعالم",
        youtube_description: "حلقة عميقة عن أسئلة الانتماء، الجيل الجديد، والكويت في العالم. نقاش غير سطحي.",
        pinned_comment: "اللحظة التي حسمت فيها هويتك؟",
        thumbnail_text_options: ["بين عالمَين"],
        thumbnail_direction: "بورتريه قريب على وجه الضيف، ألوان ترابية",
      },
    })
    doc = publishReducer(doc, {
      type: "patch_seo",
      patch: {
        meta_title: "هوية وانتماء بين الكويت والعالم",
        meta_description: "حلقة عميقة عن أسئلة الانتماء والهوية والكويت في عالم متعولم — حوار طويل بدون اختصار.",
        og_title: "هويتنا في عالم متعولم",
        og_description: "حوار طويل عن الانتماء.",
        ranking_angle: "زاوية جيلية كويتية بدل الزاوية العامة عن الهوية العربية",
        schema_notes: "PodcastEpisode + Person",
      },
    })
    doc = publishReducer(doc, {
      type: "patch_newsletter",
      patch: {
        newsletter_subject: "بين عالمَين — حلقة عن الانتماء",
        newsletter_preview: "كيف نُعيد كتابة هويّتنا كلّ يوم؟",
        newsletter_body:
          "في هذه الحلقة، نناقش كيف تعيد الأجيال الجديدة كتابة فكرة الانتماء. حديث طويل وغير مختصر، يستحقّ الجلسة الكاملة.",
        featured_quote: "«لا أحتاج إلى أن أختار»",
        emotional_angle: "حنين متجدّد",
      },
    })
    doc = publishReducer(doc, {
      type: "patch_social",
      patch: {
        instagram_caption: "بين عالمَين — حلقة جديدة",
        linkedin_post: "حوار عن الهوية والانتماء والعولمة",
        tiktok_caption: "هل اخترت هويّتك؟",
        x_thread: ["1/ ما الذي يجعلك أنت؟", "2/ الهوية تُكتب وتُعاد كتابتها"],
        reel_hook_lines: ["«لا أحتاج أن أختار»"],
      },
    })
    doc = publishReducer(doc, {
      type: "patch_release",
      patch: {
        release_priority: "high",
        release_window: "2026-05-30",
        release_reason: "تنزيل تحريري قبل العيد",
        primary_platform: "website",
        audience_target: "الكويتيون 25-40",
      },
    })
    const r = validateWebsitePackageDocument(doc)
    assert(r.canPublish, `canPublish=true expected; blockers=${r.blockerCount}`)
    assert(
      r.readiness.score >= 75,
      `expected score >= 75, got ${r.readiness.score}`,
    )
    assert(r.readiness.breakdown.identity === 100, "no identity issues")
  })

  await caseRun("17/22 readiness: bait language drops identity score", () => {
    let doc = emptyWebsitePackageDocument()
    doc = publishReducer(doc, {
      type: "patch_website",
      patch: { final_title: "صادم! لن تصدق ما حدث" },
    })
    const r = validateWebsitePackageDocument(doc)
    assert(
      r.readiness.breakdown.identity < 100,
      `identity score should drop, got ${r.readiness.breakdown.identity}`,
    )
  })

  // ─── Wiring assertions ────────────────────────────────────────────

  await caseRun("18/22 publish-actions.ts uses studio_analysis_records kind=website_package + revalidates", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/publish-actions.ts",
    )
    assert(src.includes("upsertStudioAnalysisRecord"), "uses repo")
    assert(src.includes('kind: "website_package"'), "writes kind=website_package")
    assert(
      src.includes("revalidatePath(`/admin/khat-brain/episodes/${"),
      "revalidates workspace path",
    )
    assert(src.includes("version_conflict"), "conflict path present")
    assert(src.includes("savePublishPackageAction"), "save action exported")
    assert(src.includes("suggestPublishImprovementsAction"), "AI action exported")
    assert(src.includes("seedPublishPackageFromContextAction"), "seed action exported")
  })

  await caseRun("19/22 AI taxonomy: 14 kinds enumerated + dedup present", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/publish-actions.ts",
    )
    for (const k of [
      "stronger_title",
      "more_philosophical_framing",
      "emotional_reframing",
      "controversy_softening",
      "controversy_amplification",
      "seo_improvement",
      "stronger_newsletter_angle",
      "stronger_opening_hook",
      "better_thumbnail_direction",
      "deeper_takeaway_extraction",
      "stronger_quote_extraction",
      "audience_specific_rewrite",
      "kuwait_specific_framing",
      "arab_world_framing",
    ]) {
      assert(src.includes(`"${k}"`), `AI kind "${k}" enumerated`)
    }
    assert(src.includes("seen.add(fp)"), "dedup present")
  })

  await caseRun("20/22 publish-editor-client uses editorial primitives + sections + readiness dashboard", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/publish-editor-client.tsx",
    )
    for (const sym of [
      "useAutosave",
      "useDirtyState",
      "useUndoHistory",
      "EditorStatusBadge",
      "EditorToolbar",
      "validateWebsitePackageDocument",
      "ReadinessDashboard",
      "SuggestionsPanel",
      "WebsitePreview",
      "publishReducer",
    ]) {
      assert(src.includes(sym), `expected ${sym}`)
    }
    assert(src.includes("data-readiness-score"), "readiness score marker present")
    assert(src.includes("data-publish-status"), "publish-status select marker present")
  })

  await caseRun("21/22 tab-publish hosts PublishPackageEditor + preserves PushButton + loader", async () => {
    const src = await readRel(
      "app/admin/khat-brain/episodes/[eirId]/tab-publish.tsx",
    )
    assert(src.includes("<PublishPackageEditor"), "editor mounted")
    assert(src.includes("<PushButton"), "legacy PushButton preserved")
    assert(src.includes("loadPublishPackageForEir"), "loader imported")
    assert(src.includes("export async function PublishTab"), "tab is async")
  })

  await caseRun("22/22 readiness recommendation copy varies with score", () => {
    let doc = emptyWebsitePackageDocument()
    const low = validateWebsitePackageDocument(doc).readiness.recommendation
    doc = {
      ...doc,
      source_transcript_record_id: "trx-1",
      source_chapter_record_id: "ch-1",
      source_clip_record_id: "cl-1",
    }
    doc = publishReducer(doc, {
      type: "patch_website",
      patch: {
        final_title: "هوية وانتماء بين الكويت والعالم",
        slug: "k-id-belong",
        canonical_description: "حلقة عميقة عن أسئلة الانتماء — سياق تحريري واضح ومفصّل.",
      },
    })
    const partial = validateWebsitePackageDocument(doc).readiness.recommendation
    assert(low !== partial, "recommendation changes with completeness")
  })

  console.log(
    `\n${FAIL.length === 0 ? "🎉" : "💥"} ${PASS.length} passed, ${FAIL.length} failed`,
  )
  if (FAIL.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error("Smoke crashed:", err)
  process.exit(1)
})
