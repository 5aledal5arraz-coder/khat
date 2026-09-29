/**
 * The source page, not Gemini's summary of it (2026-09-29).
 *
 * rashid measured it on a real run (exp_a_guest_first / exp_a_people_checked):
 * every web source's `text` is Gemini's grounding summary — Markdown,
 * third-person («تحدث براك المشعان عن…») — and 0 of 9 guard-passing quotes
 * were on the live pages. «رواها بنفسه» passed for جاسم المطوع, whose video is
 * a third party (قصص خالد عبدالعزيز) retelling his story.
 *
 * The page fixtures below are the REAL YouTube Data API metadata for rashid's
 * URLs, fetched 2026-09-29 (descriptions trimmed), and the real القبس
 * headlines. The Gemini snippets are the ones from his run.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ db: null }))
vi.mock("@/lib/ai-router", () => ({ runAiTask: vi.fn() }))

import {
  attachSourcePages,
  fetchSourcePage,
  isPrivateAddress,
  pageNamesPerson,
  pageReadable,
  pageSpeaker,
  parseHtmlPage,
  youtubeVideoId,
} from "@/lib/discovery-v2/source-page"
import { verifyStoryClassification } from "@/lib/discovery-v2/story-classify"
import { verifyHarvest } from "@/lib/discovery-v2/harvest"
import { nameVariants } from "@/lib/discovery-v2/story-evidence"
import { scoreEvidenceLabels } from "@/lib/discovery-v2/display"
import { scoreCandidate, storyScore } from "@/lib/discovery-v2/score"
import type { SourcePage, StorySource } from "@/lib/discovery-v2/types"

// ─── Real pages (YouTube Data API, 2026-09-29) ──────────────────────────────

const DHARI: SourcePage = {
  title: "قصة فشلي في 7 مشاريع تجارية ونجاحي بالمشروع الثامن | ضاري العنزي",
  author: "ضاري",
  text: "للطلب من براند العطور الخاص فيني : www.dhariperfumes.com\nرابط الاضافة السريعة لسنابي",
  via: "youtube_api",
}
const MUTAWA: SourcePage = {
  title: "قصص خالد عبدالعزيز ( قصة إفلاس الملياردير الكويتي 🥲 )",
  author: "قصص خالد عبدالعزيز 🎤📚",
  text:
    'جاسم المطوع، الذي لقب بـ"فارس سوق المناخ" في الكويت، كان مليارديرًا يمتلك ثروة طائلة ومكانة مرموقة في عالم الأعمال. ' +
    "إلا أن أزمة سوق المناخ الكبرى أدت إلى إفلاسه وخسارته لكل أمواله وعقاراته ومصانعه. " +
    "ورغم محاولاته لاستعادة جزء من ثروته، إلا أنه وجد نفسه مدينًا ويعيش الآن على إعانات الدولة وصدقات المحسنين، " +
    "مؤكدًا أنه لم يهرب أي أموال خارج الكويت. قصته تعد مثالًا صارخًا على تقلبات الثروة وتحديات الأزمات الاقتصادية.",
  via: "youtube_api",
}
/** The same video as oEmbed sees it: title + channel only — his name is absent. */
const MUTAWA_OEMBED: SourcePage = { title: MUTAWA.title, author: MUTAWA.author, text: "", via: "youtube_oembed" }
const BARRAK: SourcePage = {
  title: "من إغلاق شركات إلى امتلاك نادٍ في إنجلترا | أصدقاء بترولي",
  author: "إذاعة مختلف",
  text:
    "في هذه الحلقة من «أصدقاء بترولي»، نفتح عالم ريادة الأعمال والاستثمار مع رائدي الأعمال براك المشعان وعلي الحمد، " +
    "حيث يرويان لنا كواليس رحلتهما التي بدأت بتأسيس شركات، ومرت بإغلاقات قاسية وغدر من شركاء وموردين.",
  via: "youtube_api",
}
const GHANIM: SourcePage = {
  title: "جدوى #7 - من الأزمات إلى القمم: فن المخاطرة واغتنام الفرص - مع عادل الغانم",
  author: "Jadwa Podcast -  بودكاست جدوى",
  text: "عادل يعقوب الغانم هو رجل أعمال كويتي معروف برؤيته الاستثمارية الجريئة.",
  via: "youtube_api",
}
const OMRAN: SourcePage = {
  title: "القصة بالكامل من الإكتئاب الى الشهرة والتأثير - بوجراح في بودكاست دائرة",
  author: "بودكاست دائرة - عبدالرحمن البداح",
  text: "حوارنا اليوم مع يوسف العمران بوجراح ،\nتكلمنا عن بدايه حياته في مصر ودراسته\nعن اسباب مرضه، وعزلته",
  via: "youtube_api",
}
/** القبس, 2026-09-29: the body is not in the HTML — only the headline is. */
const FERAS: SourcePage = {
  title: "ترك التدريس ليعمل\nمع صديقه في كراج تصليح سيارات\nفراس الفارسي: حادث مروري غير مسيرة حياتي",
  author: null,
  text: "",
  via: "html",
}
const ABDULWAHAB: SourcePage = {
  title: "إعاقته لم تمنعه من الدراسة والتفوق والعمل والتميز\nعبد الوهاب: منذ إعاقتي وأنا أكثر إصرارا على إثبات وجودي",
  author: null,
  text: "",
  via: "html",
}

// ─── Gemini's grounding summaries from rashid's run (NOT the pages) ─────────

const MUTAWA_SNIPPET =
  "جاسم المطوع (فارس سوق المناخ) * **المصدر:** برنامج تلفزيوني حواري مع الإعلامي * **تفاصيل التجربة الشخصية:** " +
  "روى جاسم المطوع بنفسه قصة خسارته لثروته بعد انهيار سوق المناخ وكيف أصبح مثقلاً بالديون"
const MUTAWA_SNIPPET_QUOTE = "روى جاسم المطوع بنفسه قصة خسارته لثروته بعد انهيار سوق المناخ"
const DHARI_SNIPPET =
  "ضاري العنزي (رائد أعمال ومؤسس براند عطور) * **المصدر:** مقطع مرئي خاص على يوتيوب بعنوان: " +
  "*(قصة فشلي في 7 مشاريع تجارية ونجاحي بالمشروع الثامن)* * استعرض ضاري العنزي بشكل مفصل تجربته المريرة مع الفشل التجاري"
const DHARI_PAGE_QUOTE = "قصة فشلي في 7 مشاريع تجارية ونجاحي بالمشروع الثامن"

const src = (url: string, text: string, page?: SourcePage | null): StorySource => ({
  kind: "web",
  title: text.slice(0, 120),
  url,
  domain: "youtube.com",
  text,
  verified: true,
  ...(page !== undefined ? { page } : {}),
})

/** What the classifier said on the live run: first-hand, self-told — from the summary. */
const claimed = (quote: string) => ({
  story_type: "first_hand",
  evidence: [{ source: 1, quote }],
  topic_relevance: { value: "on_topic", source: 1, quote },
  self_told: { value: true, source: 1, quote },
  same_person: true,
})

const MUTAWA_V = nameVariants(["جاسم المطوع"])
const DHARI_V = nameVariants(["ضاري العنزي"])

describe("who is speaking — decided from the page", () => {
  it("جاسم المطوع: a third party retells his story → NOT self-told, whatever the model says", () => {
    expect(pageNamesPerson(MUTAWA, MUTAWA_V)).toBe(true) // the description names him…
    expect(pageSpeaker(MUTAWA, MUTAWA_V)).toBeNull() // …but only narrates him
    const s = verifyStoryClassification(
      claimed(MUTAWA_SNIPPET_QUOTE),
      [src("https://www.youtube.com/watch?v=VHxSZjG_tgU", MUTAWA_SNIPPET, MUTAWA)],
      MUTAWA_V,
      null,
    )
    expect(s.assessment.status).toBe("verified") // the summary still backs a story…
    expect(s.assessment.self_told).toBeNull() // …but never «told it himself»
    // The quote is Gemini's words, not the page's: a summary, never a quote.
    expect(s.assessment.evidence[0].on_page).toBe(false)
    const label = scoreEvidenceLabels({ story: s.assessment, scores: { searchability: 0.5 } }).story
    expect(label).toContain("لم يُتحقق أنه رواها بنفسه")
    expect(label).not.toMatch(/^رواها بنفسه/)
    expect(label).toContain("ملخص بلا اقتباس من الصفحة")
    const c = scoreCandidate({ name: "جاسم المطوع" }, { resolved: false }, {}, { topic: "الإفلاس" }, s)
    expect(c.reasons.join(" ")).not.toContain("روى قصته بنفسه")
    expect(c.reasons.join(" ")).toContain("لم يُتحقق أنه رواها بنفسه")
  })

  it("the name is absent from what was read → not verified (never true)", () => {
    // oEmbed sees only title + channel: his name is not there.
    expect(pageNamesPerson(MUTAWA_OEMBED, MUTAWA_V)).toBe(false)
    expect(pageSpeaker(MUTAWA_OEMBED, MUTAWA_V)).toBeNull()
    // …and title + channel alone cannot prove he is ABSENT (the description may name him).
    expect(pageReadable(MUTAWA_OEMBED)).toBe(false)
    const s = verifyStoryClassification(
      claimed(MUTAWA_SNIPPET_QUOTE),
      [src("https://www.youtube.com/watch?v=VHxSZjG_tgU", MUTAWA_SNIPPET, MUTAWA_OEMBED)],
      MUTAWA_V,
      null,
    )
    expect(s.assessment.self_told).toBeNull()
    // القبس: the headline says «عبد الوهاب», never «عبد الوهاب حمزة».
    expect(pageSpeaker(ABDULWAHAB, nameVariants(["عبد الوهاب حمزة"]))).toBeNull()
  })

  it("ضاري العنزي on his own channel, «قصة فشلي في 7 مشاريع» → self-told, quoted from the page", () => {
    // The first-name channel «ضاري» alone is NOT proof (yousef, 2026-09-29);
    // his first-person title with his full name as its own segment is.
    const f = pageSpeaker(DHARI, DHARI_V)
    expect(f).toEqual({ basis: "quoted", cue: DHARI.title })
    const s = verifyStoryClassification(
      claimed(DHARI_PAGE_QUOTE),
      [src("https://www.youtube.com/watch?v=sP7JyCUVCpo", DHARI_SNIPPET, DHARI)],
      DHARI_V,
      null,
    )
    expect(s.assessment.self_told).toMatchObject({ value: true, basis: "quoted" })
    expect(s.assessment.evidence[0].on_page).toBe(true)
    expect(storyScore(s.assessment)).toBe(0.8)
    const label = scoreEvidenceLabels({ story: s.assessment, scores: { searchability: 0.5 } }).story
    expect(label).toMatch(/^رواها بنفسه · /)
    expect(label).toContain("اقتباس واحد")
  })

  it("sight: a one-word channel that is NOT part of his name proves nothing", () => {
    expect(pageSpeaker({ ...DHARI, author: "مختلف" }, DHARI_V)).toMatchObject({ basis: "quoted" }) // first-person title + his name as its own segment
    expect(pageSpeaker({ ...DHARI, author: "مختلف", title: "قصة 7 مشاريع تجارية | ضاري العنزي" }, DHARI_V)).toBeNull()
  })

  it("the page presents him as the guest (real titles / descriptions)", () => {
    expect(pageSpeaker(GHANIM, nameVariants(["عادل يعقوب الغانم"]))?.basis).toBe("guest") // «مع عادل الغانم»
    expect(pageSpeaker(OMRAN, nameVariants(["يوسف العمران"]))?.basis).toBe("guest") // «حوارنا اليوم مع…»
    expect(pageSpeaker(BARRAK, nameVariants(["براك المشعان"]))?.basis).toBe("guest") // «…مع رائدي الأعمال براك المشعان… يرويان»
    expect(pageSpeaker(FERAS, nameVariants(["فراس الفارسي"]))).toMatchObject({
      basis: "quoted",
      cue: "فراس الفارسي: حادث مروري غير مسيرة حياتي",
    })
  })

  it("«قصة فلان» / «عن فلان» is about him, not by him", () => {
    const v = nameVariants(["جاسم المطوع"])
    const about = (title: string): SourcePage => ({ title, author: "قناة قصص", text: "", via: "youtube_api" })
    expect(pageSpeaker(about("قصة جاسم المطوع يرويها خالد"), v)).toBeNull()
    expect(pageSpeaker(about("حلقة عن جاسم المطوع وسوق المناخ"), v)).toBeNull()
    // sight: the same channel presenting him as the guest does count
    expect(pageSpeaker(about("حلقة مع جاسم المطوع عن سوق المناخ"), v)?.basis).toBe("guest")
  })

  it("a page that could not be read → self_told is never true", () => {
    for (const page of [null, undefined] as const) {
      const s = verifyStoryClassification(
        claimed(DHARI_PAGE_QUOTE),
        [src("https://www.youtube.com/watch?v=sP7JyCUVCpo", DHARI_SNIPPET, page)],
        DHARI_V,
        null,
      )
      expect(s.assessment.self_told).toBeNull()
      expect(s.assessment.evidence[0].on_page).toBe(false)
    }
  })

  it("an older run's stored model-said «true» (no basis) reads as NOT verified", () => {
    const s = verifyStoryClassification(
      claimed(DHARI_PAGE_QUOTE),
      [src("https://www.youtube.com/watch?v=sP7JyCUVCpo", DHARI_SNIPPET, DHARI)],
      DHARI_V,
      null,
    )
    const legacy = { ...s.assessment, self_told: { value: true, url: "https://x.example", quote: "…" } }
    expect(scoreEvidenceLabels({ story: legacy, scores: { searchability: 0.5 } }).story).toMatch(/^لم يُتحقق أنه رواها بنفسه/)
    const c = scoreCandidate({ name: "ضاري العنزي" }, { resolved: false }, {}, { topic: "الفشل التجاري" }, { ...s, assessment: legacy })
    expect(c.reasons.join(" ")).not.toContain("روى قصته بنفسه")
  })

  it("the model may still DOWNGRADE (false, with a verified quote)", () => {
    const raw = { ...claimed(MUTAWA_SNIPPET_QUOTE), self_told: { value: false, source: 1, quote: MUTAWA_SNIPPET_QUOTE } }
    const s = verifyStoryClassification(raw, [src("https://youtu.be/VHxSZjG_tgU", MUTAWA_SNIPPET, MUTAWA)], MUTAWA_V, null)
    expect(s.assessment.self_told).toMatchObject({ value: false, basis: "classifier" })
    expect(storyScore(s.assessment)).toBe(0.5)
  })
})

describe("harvest — the page must name him when it was read", () => {
  const person = (name: string, quote: string) => ({ people: [{ name, source: 1, quote, story_claim: "خسر ثروته" }] })
  const readablePage = (text: string): SourcePage => ({ title: "مقال", author: null, text, via: "html" })
  const FILLER = "تقرير مطوّل عن أزمة سوق المناخ في الكويت وآثارها على التجار والمستثمرين والأسر. ".repeat(6)

  it("a read page that does NOT name him → dropped (the name was Gemini's)", () => {
    const withoutName = src("https://a.example/1", MUTAWA_SNIPPET, readablePage(FILLER))
    expect(verifyHarvest(person("جاسم المطوع", MUTAWA_SNIPPET_QUOTE), [withoutName])).toEqual([])
    // sight: the same page naming him keeps him — but never says he told it himself
    const withName = src("https://a.example/1", MUTAWA_SNIPPET, readablePage(`${FILLER} جاسم المطوع خسر ثروته.`))
    const kept = verifyHarvest(person("جاسم المطوع", MUTAWA_SNIPPET_QUOTE), [withName])
    expect(kept).toHaveLength(1)
    expect(kept[0].why).toContain("لم يُتحقق أنه رواها بنفسه")
  })

  it("an unread or too-thin page proves nothing either way → kept, labelled unverified", () => {
    for (const page of [null, undefined, MUTAWA_OEMBED] as const) {
      const out = verifyHarvest(person("جاسم المطوع", MUTAWA_SNIPPET_QUOTE), [src("https://a.example/2", MUTAWA_SNIPPET, page)])
      expect(out).toHaveLength(1)
      expect(out[0].why).toContain("لم يُتحقق أنه رواها بنفسه")
    }
  })

  it("his own channel → «يروي تجربته بنفسه»", () => {
    const out = verifyHarvest(person("ضاري العنزي", DHARI_PAGE_QUOTE), [src("https://www.youtube.com/watch?v=sP7JyCUVCpo", DHARI_SNIPPET, DHARI)])
    expect(out).toHaveLength(1)
    expect(out[0].why).toContain("يروي تجربته بنفسه")
    expect(out[0].harvest_sources?.[0].page).toEqual(DHARI) // the story check reuses the read page
  })
})

describe("reading a page", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("youtubeVideoId", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=sP7JyCUVCpo&t=3")).toBe("sP7JyCUVCpo")
    expect(youtubeVideoId("https://youtu.be/sP7JyCUVCpo")).toBe("sP7JyCUVCpo")
    expect(youtubeVideoId("https://m.youtube.com/shorts/sP7JyCUVCpo")).toBe("sP7JyCUVCpo")
    expect(youtubeVideoId("https://www.alqabas.com/article/162302/")).toBeNull()
  })

  it("parseHtmlPage reads og:title, the byline, the description and the paragraphs — not scripts", () => {
    const html = `<html><head><title>x</title>
      <meta content="فراس الفارسي: حادث مروري غير مسيرة حياتي" property="og:title">
      <meta name="author" content="محمد الكاتب"><meta name="description" content="وصف &amp; مختصر">
      <script>var p = "<p>ليس نصاً من الصفحة ولا يُقرأ أبداً</p>"</script></head>
      <body><p>قال فراس الفارسي إنه ترك التدريس بعد الحادث.</p><p>قصير</p></body></html>`
    const p = parseHtmlPage(html)
    expect(p.title).toBe("فراس الفارسي: حادث مروري غير مسيرة حياتي")
    expect(p.author).toBe("محمد الكاتب")
    expect(p.text).toContain("وصف & مختصر")
    expect(p.text).toContain("قال فراس الفارسي إنه ترك التدريس بعد الحادث.")
    expect(p.text).not.toContain("ليس نصاً")
    const ld = parseHtmlPage(
      `<script type="application/ld+json">{"@type":"NewsArticle","headline":"ع","author":[{"name":"فلان الفلاني"}],"articleBody":"نص المقال كاملاً"}</script>`,
    )
    expect(ld).toMatchObject({ title: "ع", author: "فلان الفلاني", text: "نص المقال كاملاً" })
  })

  it("isPrivateAddress blocks loopback, private, link-local (cloud metadata), CGNAT, ULA, mapped", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "nonsense"]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
    for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false)
  })

  it("never fetches a private address — nor follows a redirect into one", async () => {
    const request = vi.fn(async () => ({ status: 302, location: "http://169.254.169.254/latest/meta-data/", contentType: "", body: new Uint8Array() }))
    expect(await fetchSourcePage("http://127.0.0.1/admin", 2_000, { request })).toBeNull()
    expect(await fetchSourcePage("http://localhost:3000/", 2_000, { request })).toBeNull()
    expect(request).not.toHaveBeenCalled()
    expect(await fetchSourcePage("http://93.184.216.34/story", 2_000, { request })).toBeNull()
    expect(request).toHaveBeenCalledTimes(1) // the redirect target was refused, never requested
  })

  it("an HTML page is read", async () => {
    const html = (body: string, contentType = "text/html; charset=utf-8") =>
      vi.fn(async () => ({ status: 200, location: null, contentType, body: new TextEncoder().encode(body) }))
    const p = await fetchSourcePage("http://93.184.216.34/story", 2_000, {
      request: html(`<title>فراس الفارسي: حادث مروري غير مسيرة حياتي</title>`),
    })
    expect(p).toMatchObject({ title: "فراس الفارسي: حادث مروري غير مسيرة حياتي", via: "html" })
    // not HTML → not read
    expect(await fetchSourcePage("http://93.184.216.34/file.pdf", 2_000, { request: html("%PDF", "application/pdf") })).toBeNull()
  })

  it("YouTube: Data API snippet when keyed, else oEmbed (title + channel only)", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("googleapis.com/youtube/v3/videos")
        ? Response.json({ items: [{ snippet: { title: DHARI.title, description: DHARI.text, channelTitle: "ضاري" } }] })
        : Response.json({ title: DHARI.title, author_name: "ضاري" }),
    )
    vi.stubGlobal("fetch", fetchMock)
    expect(await fetchSourcePage("https://www.youtube.com/watch?v=sP7JyCUVCpo")).toEqual(DHARI)
    vi.stubEnv("YOUTUBE_API_KEY", "")
    expect(await fetchSourcePage("https://youtu.be/sP7JyCUVCpo")).toEqual({
      title: DHARI.title,
      author: "ضاري",
      text: "",
      via: "youtube_oembed",
    })
  })

  it("attachSourcePages: bounded by the deadline; a failed read is null, an unattempted one stays absent", async () => {
    const fetchPage = vi.fn(async (url: string) => (url.endsWith("/ok") ? DHARI : null))
    const sources = [src("https://a.example/ok", "x"), src("https://a.example/fail", "y"), { ...src("https://a.example/dead", "z"), verified: false }]
    const out = await attachSourcePages(sources, { deadlineAt: Date.now() + 10_000, fetchPage })
    expect(out.map((s) => s.page)).toEqual([DHARI, null, undefined])
    expect(fetchPage).toHaveBeenCalledTimes(2) // a dead link is not read
    for (const [, timeout] of fetchPage.mock.calls as unknown as Array<[string, number]>) expect(timeout).toBeLessThanOrEqual(8_000)
    fetchPage.mockClear()
    const late = await attachSourcePages(sources, { deadlineAt: Date.now() + 500, fetchPage })
    expect(fetchPage).not.toHaveBeenCalled()
    expect(late.every((s) => s.page === undefined)).toBe(true)
  })
})
