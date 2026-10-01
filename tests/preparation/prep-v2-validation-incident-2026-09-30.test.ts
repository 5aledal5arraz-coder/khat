/**
 * Incident 2026-09-30 — prep c1810682 («خالد المناع: من «مُبخر» إلى «خليط»…»).
 *
 * A story prep for a founder ended `validation_failed_after_retry` with
 * `vague_emotional_hook` + `unverified_guest_reference`, after the Pass-4
 * retry. Three root causes, pinned here:
 *
 *  1. The guest-name detector treated ANY 2–40 Arabic characters after
 *     «ضيفنا»/«الأستاذ» as a name (no word boundary, no name shape, shadda
 *     cut «المنّاع» mid-word) — «ضيفنا يروي…» was a "hallucinated guest".
 *  2. The Pass-4 critic received `JSON.stringify(draft, null, 2).slice(0,
 *     14_000)`: on a realistic Arabic 31-question draft that cut every
 *     emotional_peak question away, and its prompt never asked for an
 *     `emotional` tag. The retry saw the same truncated view.
 *  3. A failed run was stored unmarked and reported only as «فشل»; soft
 *     failures now store the prep with `validation_warnings` and `ok: true`.
 *
 * No AI is called: `runAiTask` is mocked and answers per pass.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

type AiReq = {
  input: Record<string, unknown>
  promptVersion?: string | null
  prompt: { role: string; content: string }[]
}
const aiCalls: AiReq[] = []
let aiResponder: (req: AiReq) => unknown = () => null

vi.mock("@/lib/ai-router", () => ({
  runAiTask: vi.fn(async (req: AiReq) => {
    aiCalls.push(req)
    const parsed = aiResponder(req)
    return parsed
      ? { status: "succeeded", runId: `run-${aiCalls.length}`, parsed }
      : { status: "failed", runId: `run-${aiCalls.length}`, parsed: null }
  }),
}))

const dbState = vi.hoisted(() => {
  const state = {
    selectQueue: [] as Record<string, unknown>[][],
    persisted: null as Record<string, unknown> | null,
    fakeDb: null as unknown,
  }
  function chain(resolveRows: () => unknown[]): unknown {
    const then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve(resolveRows()).then(ok, bad)
    const proxy: unknown = new Proxy(
      {},
      { get: (_t, prop) => (prop === "then" ? then : () => proxy) },
    )
    return proxy
  }
  state.fakeDb = {
    select: () => chain(() => state.selectQueue.shift() ?? []),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => chain(() => []),
        update: () => ({
          set: (v: Record<string, unknown>) => {
            state.persisted = v
            return chain(() => [{ id: "prep" }])
          },
        }),
      }),
  }
  return state
})
vi.mock("@/lib/db", () => ({ db: dbState.fakeDb }))
vi.mock("@/lib/recording-v2/live-guard", () => ({
  hasActiveRecordingForPreparation: vi.fn(async () => false),
  ROOM_LIVE_REGENERATION_MESSAGE: "",
}))
vi.mock("@/lib/collaboration/prep-live", () => ({
  broadcastPrepV2Update: vi.fn(async () => undefined),
}))
const insightMock = vi.hoisted(() => ({ calls: 0 }))
vi.mock("@/lib/preparation/v2/insights", () => ({
  runInsightGeneration: vi.fn(async () => {
    insightMock.calls++
    return {
      ok: false,
      questions: [],
      ai_run_ids: [],
      stats: { drafted: 0, kept: 0, grounded: 0, capped: false },
    }
  }),
}))

import {
  detectUnverifiedGuestReference,
  findUnverifiedGuestReferences,
  normalizeArabic,
  onlySoftFailures,
  sanitizeGuestReferences,
  validatePrepV2Payload,
  type ValidationFailure,
} from "@/lib/preparation/v2/validation"
import { runPrepV2Pipeline } from "@/lib/preparation/v2/pipeline"
import { runCritiquePass, storyDraftBlock } from "@/lib/preparation/v2/critique"
import { runQuestionBankGeneration } from "@/lib/preparation/v2/question-banks"
import { STORY_PROMPT_VERSION } from "@/lib/preparation/v2/format"
import { prepV2Schema } from "@/lib/db/validators"
import type {
  PrepV2Payload,
  PrepV2Question,
  PrepV2Section,
  QuestionType,
} from "@/lib/preparation/v2/types"

// ─── Fixtures (shaped on the incident) ────────────────────────────────

const GUEST = "خالد نواف المناع"
const TITLE = "خالد المناع: من «مُبخر» إلى «خليط» — رحلة مؤسس"
const GOAL = [
  "حلقة عن رحلة خالد المنّاع ريادياً، بالترتيب:",
  "1) تأسيس «مبخر» من الصفر.",
  "2) الصعوبات الأولى وكيف تجاوزها.",
  "3) إدارة الفريق مع النمو.",
  "4) استحواذ «فلاورد» على مبخر وما عناه له.",
  "5) كيف صار الرئيس التنفيذي لـ«خليط».",
].join("\n")
const KNOWN = `${TITLE}\n${GOAL}`

const KINDS = ["opening", "build_up", "conflict", "deep_dive", "emotional_peak", "resolution"] as const
const DIST = [4, 5, 6, 7, 5, 4]

function sections(peakIntent = "نصل إلى اللحظة التي وقّع فيها على بيع ما بناه، وما شعر به تلك الليلة مع عائلته."): PrepV2Section[] {
  return KINDS.map((kind) => ({
    kind,
    intent:
      kind === "emotional_peak"
        ? peakIntent
        : "نفهم كيف تحولت فكرة صغيرة في مطبخ البيت إلى مشروع ينافس في سوق البخور الخليجي.",
    target_emotion: "فضول وحنين",
    estimated_minutes: kind === "deep_dive" || kind === "emotional_peak" ? 15 : 12,
    transition_goal: "ننتقل من البدايات إلى أول أزمة حقيقية هددت المشروع.",
  }))
}

/** A realistic Arabic 31-question bank; the peak types are configurable. */
function questions(peakTypes: QuestionType[] = ["emotional", "personal"]): PrepV2Question[] {
  const out: PrepV2Question[] = []
  KINDS.forEach((kind, i) => {
    for (let j = 0; j < DIST[i]; j++) {
      out.push({
        id: `${kind}-${j}`,
        section: kind,
        text: "لما قررت تبيع «مُبخر» لفلاورد بعد سنوات من البناء، شنو الشي اللي حسيت إنك تتنازل عنه فعلاً، وهل كان عندك لحظة تردد قبل التوقيع؟",
        types: kind === "emotional_peak" ? peakTypes : ["factual", "reflective"],
        priority: j < 3 ? "must_ask" : "if_time",
        purpose: "يخدم محور التوتر بين الحفاظ على هوية المشروع والنمو عبر الاستحواذ، ويكشف الكلفة الشخصية للقرار.",
        follow_up_prompt: "اسأله: من أول شخص قلت له عن القرار، وشنو كان رده؟",
        risk_level: "medium",
      })
    }
  })
  return out
}

const PASS1 = {
  thesis: "قصة خالد المناع ليست قصة نجاح تجاري فقط بل قصة رجل باع ما بناه ليبني ما هو أكبر.",
  axes_of_tension: [
    "الولاء للمشروع الأول مقابل طموح التوسع",
    "الهوية العائلية مقابل منطق الاستثمار",
    "القائد المؤسس مقابل المدير التنفيذي",
    "المخاطرة الشخصية مقابل أمان الوظيفة",
    "الفريق الصغير مقابل الشركة الكبيرة",
    "البيع كخسارة أم كبداية",
  ],
  guest_extraction_strategy:
    "نبدأ بتفاصيل حسية من أيام التأسيس ثم نربط كل منعطف تجاري بما كلّفه شخصياً، وندع الضيف يصل بنفسه إلى لحظة البيع دون أن نستعجله أو نلقنه الإجابة.",
  sensitive_zones: ["تفاصيل مالية لصفقة الاستحواذ غير المعلنة"],
}

function guidance(openingText = "ضيفنا يروي كيف بدأ «مبخر» من مطبخ البيت.") {
  return {
    host_guidance: {
      overall_tone: "فضول دافئ؛ ضيفه صاحب التجربة يعرف تفاصيلها أكثر منا.",
      do_list: ["اطلب تفاصيل حسية", "اربط القرار بالكلفة", "اصمت بعد لحظة البيع"],
      dont_list: ["لا تسأل عن الأرقام السرية", "لا تستعجل الذروة", "لا تقاطع"],
      energy_curve: "يتصاعد من الفضول إلى لحظة البيع ثم يهدأ عند «خليط».",
    },
    director_guidance: {
      shot_priorities: ["يداه عند ذكر التوقيع", "وجهه عند ذكر العائلة", "لحظة الصمت"],
      silence_moments: ["بعد ذكر البيع", "بعد ذكر والده"],
      cut_warnings: [],
    },
    opening_options: [
      { approach: "مشهد", text: openingText },
      { approach: "سؤال", text: "ماذا تبيع حين تبيع شركتك الأولى؟" },
    ],
    closing_options: [
      { approach: "المستقبل", text: "ما الذي تريد أن يبقى من «مبخر» في «خليط»؟" },
      { approach: "الأستاذ في الإدارة", text: "لو رجعت لأول يوم، هل تبيع مرة ثانية؟" },
    ],
    critic_notes: ["أعيد توزيع الدقائق"],
  }
}

function storyPayload(over: Partial<PrepV2Payload> = {}): PrepV2Payload {
  const g = guidance()
  const s = sections()
  return {
    thesis: PASS1.thesis,
    axes_of_tension: PASS1.axes_of_tension,
    guest_extraction_strategy: PASS1.guest_extraction_strategy,
    episode_sections: s,
    question_bank: questions(),
    host_guidance: g.host_guidance,
    director_guidance: g.director_guidance,
    sensitive_zones: PASS1.sensitive_zones,
    opening_options: g.opening_options,
    closing_options: g.closing_options,
    total_estimated_minutes: s.reduce((a, x) => a + x.estimated_minutes, 0),
    generator_version: "v2.1",
    generated_at: new Date().toISOString(),
    ai_run_ids: {
      pass1_research: null,
      pass2_structure: null,
      pass3_questions: null,
      pass4_critique: null,
      pass5_insights: null,
    },
    ...over,
  }
}

function withOpening(text: string): PrepV2Payload {
  const p = storyPayload()
  p.opening_options = [{ approach: "مشهد", text }, p.opening_options[1]]
  return p
}

const refs = (text: string, linked: string | null = GUEST, known: string | null = KNOWN) =>
  findUnverifiedGuestReferences(withOpening(text), { linkedGuestName: linked, knownText: known })

beforeEach(() => {
  aiCalls.length = 0
  aiResponder = () => null
  dbState.selectQueue.length = 0
  dbState.persisted = null
  insightMock.calls = 0
})

// ─── 1. Guest-name detector ───────────────────────────────────────────

describe("detectUnverifiedGuestReference — no false positives on real copy", () => {
  it.each([
    ["verb after ضيفنا", "ضيفنا يروي كيف بدأ «مبخر» من مطبخ البيت."],
    ["future verb", "ضيفنا سيحكي لنا عن ليلة التوقيع."],
    ["role noun after ضيفه", "ضيفه صاحب التجربة يعرف تفاصيلها."],
    ["no word boundary (المستضيفه)", "المستضيفه تشرح كيف تُدار الجلسة."],
    ["preposition after الأستاذ", "الأستاذ في الإدارة لا يعلّم ما يتعلمه المؤسس بالخسارة."],
    ["adjective after ضيفنا", "ضيفنا الكريم بنى مشروعه بيده."],
    ["filler then comma", "ضيفنا الليلة، مؤسس «مبخر»، يعود إلى البداية."],
    ["linked guest with shadda", "ضيفنا خالد المنّاع يحكي عن البداية."],
    ["linked family name with tatweel", "الأستاذ خالد المنـــاع ومشواره."],
    ["first name only of linked guest", "ضيفي خالد يعرف معنى أن تبيع ما بنيت."],
    ["brand from the title/goal", "ضيفنا مبخر وخليط في جملة واحدة."],
    // ABBREV_TRIGGER lookbehind: «…د.» / «…ا.» at a word END is a sentence stop.
    ["«الجديد.» + question", "يواجه التحدي الجديد. ما الأداة التي تتمسك بها؟"],
    ["«الجديد.» + sentence", "بدأ فصله الجديد. تغيرت الأمور بعدها."],
    ["«جديدا.» + sentence", "كان كل شيء جديدا. خسارة كبيرة تبعته."],
    ["title + descriptor", "الأستاذ المساعد في الجامعة شرح الفكرة."],
    ["kunya head alone («أم لا»)", "هل يعود ضيفنا أم لا؟"],
    ["linked family name after a title", "الشيخ المناع كما يناديه فريقه."],
  ])("%s", (_label, text) => {
    expect(refs(text)).toEqual([])
  })

  it("normalizeArabic folds shadda, tatweel and alef forms and keeps an index map", () => {
    const n = normalizeArabic("المنّـاع أحمد")
    expect(n.text).toBe("المناع احمد")
    expect(n.map.length).toBe(n.text.length)
  })
})

describe("detectUnverifiedGuestReference — genuine hallucinations still fail", () => {
  it("«ضيفنا فهد العتيبي» when the guest is خالد المناع", () => {
    const r = refs("ضيفنا فهد العتيبي يروي كيف بدأ «مبخر».")
    expect(r.map((x) => x.name)).toEqual(["فهد العتيبي"])
    expect(r[0].snippet).toBe("ضيفنا فهد العتيبي")
    expect(r[0].field).toBe("opening_options[0].text")
  })

  it("harakat do not hide a name, and the original spelling is reported + sanitized", () => {
    const text = "ضيفنا فَهْد العُتيبي يروي."
    expect(refs(text).map((x) => x.name)).toEqual(["فَهْد العُتيبي"])
    const { payload } = sanitizeGuestReferences(withOpening(text), {
      linkedGuestName: GUEST,
      knownText: KNOWN,
    })
    expect(payload.opening_options[0].text).toBe("ضيفنا [الضيف] يروي.")
  })

  it.each([
    ["kunya «أبو بكر السالم»", "ضيفنا أبو بكر السالم يروي.", "أبو بكر السالم"],
    // «أم فيصل»: Noura's «أم خالد» shape, with a name that is not the linked
    // guest's (خالد IS his first name, so «أم خالد» verifies by design).
    ["kunya «أم فيصل»", "ضيفنا أم فيصل تحكي البداية.", "أم فيصل"],
    ["title + ال-family name «الشيخ الصباح»", "الشيخ الصباح دعم المشروع.", "الصباح"],
    ["«الدكتور الغانم»", "كما قال الدكتور الغانم.", "الغانم"],
    ["«المهندس المرزوق»", "صمم المهندس المرزوق المصنع.", "المرزوق"],
    ["«ضيفنا إمام الصالح»", "ضيفنا إمام الصالح يحكي.", "إمام الصالح"],
    ["feminine «ضيفتنا»", "ضيفتنا سارة العلي تروي.", "سارة العلي"],
    ["feminine «الدكتورة»", "قالت الدكتورة منى الرشيد ذلك.", "منى الرشيد"],
    ["comma after trigger «ضيفنا، فهد»", "ضيفنا، فهد العتيبي، يروي.", "فهد العتيبي"],
  ])("flags %s", (_l, text, name) => {
    expect(refs(text).map((x) => x.name)).toEqual([name])
  })

  it("a filler before the name does not hide it («ضيفنا اليوم …»)", () => {
    expect(refs("ضيفنا اليوم سالم الكندري.").map((x) => x.name)).toEqual(["سالم الكندري"])
  })

  it("a bare nisba family name after a title («الدكتور العتيبي»)", () => {
    expect(refs("الدكتور العتيبي سيشرح الصفقة.").map((x) => x.name)).toEqual(["العتيبي"])
  })

  it("an abbreviated honorific («د. سالم»)", () => {
    expect(refs("كما قال د. سالم في مقابلته.").map((x) => x.name)).toEqual(["سالم"])
  })

  it("«ضيفنا يوسف» — a given name starting with ي is not mistaken for a verb", () => {
    expect(refs("ضيفنا يوسف يحكي البداية.").map((x) => x.name)).toEqual(["يوسف"])
  })

  it("no linked guest at all ⇒ any name is unverified (boolean API kept)", () => {
    const p = withOpening("أهلاً بكم. ضيفنا اليوم عبدالله السالم.")
    expect(detectUnverifiedGuestReference(p, null)).toBe(true)
    expect(detectUnverifiedGuestReference(p, "عبدالله السالم")).toBe(false)
  })

  it("the validation failure carries the matched snippet", () => {
    const v = validatePrepV2Payload(withOpening("ضيفنا فهد العتيبي يروي."), {
      linkedGuestName: GUEST,
      knownText: KNOWN,
    })
    const f = v.failures.find((x) => x.code === "unverified_guest_reference")!
    expect(f).toBeDefined()
    expect(f.detail).toMatchObject({
      linked_guest_name: GUEST,
      references: [{ name: "فهد العتيبي", snippet: "ضيفنا فهد العتيبي" }],
    })
  })

  it("the whole incident-shaped payload passes with the real guest + goal", () => {
    const v = validatePrepV2Payload(storyPayload(), { linkedGuestName: GUEST, knownText: KNOWN })
    expect(v.failures).toEqual([])
  })
})

describe("sanitizeGuestReferences — replaces only the unverified name", () => {
  it("keeps the trigger and the rest of the sentence; leaves the real guest alone", () => {
    const p = storyPayload()
    p.opening_options = [
      { approach: "a", text: "ضيفنا فهد العتيبي يروي كيف بدأ." },
      { approach: "b", text: "ضيفنا خالد المنّاع يحكي عن البداية." },
    ]
    const { payload, replacements } = sanitizeGuestReferences(p, {
      linkedGuestName: GUEST,
      knownText: KNOWN,
    })
    expect(replacements).toBe(1)
    expect(payload.opening_options[0].text).toBe("ضيفنا [الضيف] يروي كيف بدأ.")
    expect(payload.opening_options[1].text).toBe("ضيفنا خالد المنّاع يحكي عن البداية.")
  })
})

// ─── 2. Emotional peak ────────────────────────────────────────────────

describe("vague_emotional_hook — evidence + soft classification", () => {
  it("carries the peak question types so the failure is readable", () => {
    const p = storyPayload({ question_bank: questions(["reflective", "factual"]) })
    const f = validatePrepV2Payload(p).failures.find((x) => x.code === "vague_emotional_hook")!
    expect(f.detail).toMatchObject({
      peak_section_present: true,
      peak_question_count: 5,
      peak_question_types: Array(5).fill(["reflective", "factual"]),
    })
  })

  it("validation records the option count that decides soft vs hard", () => {
    const zero = validatePrepV2Payload(storyPayload({ opening_options: [] }))
    const one = validatePrepV2Payload(storyPayload({ closing_options: [storyPayload().closing_options[0]] }))
    expect(zero.failures.find((x) => x.code === "missing_opening_options")?.detail).toEqual({ count: 0 })
    expect(onlySoftFailures(zero.failures)).toBe(false)
    expect(one.failures.find((x) => x.code === "missing_closing_options")?.detail).toEqual({ count: 1 })
    expect(onlySoftFailures(one.failures)).toBe(true)
  })

  it("reflective alone does not satisfy the peak (rule deliberately not loosened)", () => {
    const p = storyPayload({ question_bank: questions(["reflective", "personal"]) })
    expect(validatePrepV2Payload(p).failures.map((f) => f.code)).toContain("vague_emotional_hook")
  })

  it("onlySoftFailures: soft codes only ⇒ true; any structural code ⇒ false", () => {
    const f = (code: ValidationFailure["code"]): ValidationFailure => ({ code, message: "" })
    expect(onlySoftFailures([f("vague_emotional_hook"), f("unverified_guest_reference")])).toBe(true)
    expect(onlySoftFailures([f("section_only_generic_questions")])).toBe(true)
    expect(onlySoftFailures([f("vague_emotional_hook"), f("question_count_out_of_range")])).toBe(false)
    expect(onlySoftFailures([f("wrong_section_order")])).toBe(false)
    // Options: ONE of two is an edit (soft); ZERO is a broken payload (hard).
    const opt = (code: ValidationFailure["code"], count: number): ValidationFailure => ({
      code,
      message: "",
      detail: { count },
    })
    expect(onlySoftFailures([opt("missing_opening_options", 1), opt("missing_closing_options", 1)])).toBe(true)
    expect(onlySoftFailures([opt("missing_opening_options", 0)])).toBe(false)
    expect(onlySoftFailures([opt("missing_closing_options", 0)])).toBe(false)
    expect(onlySoftFailures([])).toBe(false)
  })
})

describe("the critic now SEES the emotional peak", () => {
  const input = () => ({
    language: "ar" as const,
    preparation_id: "p",
    eir_id: "e",
    pass1: PASS1,
    pass2: { sections: sections() },
    pass3: { questions: questions() },
  })

  it("the old pretty-printed 14k slice cut every peak question (evidence)", () => {
    const old = JSON.stringify(
      { ...PASS1, sections: sections(), questions: questions() },
      null,
      2,
    ).slice(0, 14_000)
    expect(old).not.toContain('"emotional_peak-0"')
  })

  it("storyDraftBlock is complete, parseable JSON with all 31 questions", () => {
    const block = storyDraftBlock(input())
    const parsed = JSON.parse(block) as { questions: PrepV2Question[] }
    expect(parsed.questions.length).toBe(31)
    expect(parsed.questions.filter((q) => q.section === "emotional_peak").length).toBe(5)
  })

  it("an oversized draft sheds purpose/follow-up before any character cut", () => {
    const big = questions().concat(questions().map((q) => ({ ...q, id: q.id + "-b" })))
    const block = storyDraftBlock({ ...input(), pass3: { questions: big } })
    const parsed = JSON.parse(block) as { questions: Record<string, unknown>[] }
    expect(parsed.questions.length).toBe(62)
    expect(parsed.questions[0].purpose).toBeUndefined()
  })

  it("Pass 4 sends the peak, the emotional rule and the story prompt version", async () => {
    aiResponder = () => ({ questions: [], ...guidance() })
    await runCritiquePass(input())
    const req = aiCalls[0]
    const sys = req.prompt.find((m) => m.role === "system")!.content
    const usr = req.prompt.find((m) => m.role === "user")!.content
    expect(usr).toContain('"emotional_peak-4"')
    expect(sys).toContain("The emotional_peak section MUST end with at least 2 questions tagged 'emotional'")
    expect(sys).toContain("business/founder/success story")
    expect(req.promptVersion).toBe(STORY_PROMPT_VERSION)
  })

  it("Pass 3 names what 'emotional' means for a founder story + version", async () => {
    aiResponder = () => ({ questions: questions() })
    await runQuestionBankGeneration({
      language: "ar",
      preparation_id: "p",
      eir_id: "e",
      pass1: PASS1,
      pass2: { sections: sections() },
    })
    const sys = aiCalls[0].prompt.find((m) => m.role === "system")!.content
    expect(sys).toContain("including a business, founder or success story")
    expect(sys).toContain("the moment of selling or handing over what he built")
    expect(aiCalls[0].promptVersion).toBe(STORY_PROMPT_VERSION)
  })
})

// ─── 3. Pipeline: soft failures are stored, not thrown away ───────────

function queueContext() {
  dbState.selectQueue.push([
    {
      id: "c1810682",
      title: TITLE,
      episode_goal: GOAL,
      guest_identity: null,
      guest_name: GUEST,
      eir_id: null,
    },
  ])
}

function respond(critique: () => Record<string, unknown>) {
  aiResponder = (req) => {
    switch (req.input.pass) {
      case "prep_v2.research_synthesis":
        return PASS1
      case "prep_v2.structure_build":
        return { sections: sections() }
      case "prep_v2.question_banks":
        return { questions: questions() }
      case "prep_v2.critique":
        return critique()
      default:
        return null
    }
  }
}

describe("runPrepV2Pipeline — validation outcome is stored and explained", () => {
  it("incident copy («ضيفنا يروي…», «ضيفه صاحب التجربة») passes first time — no retry", async () => {
    queueContext()
    respond(() => ({ sections: sections(), questions: questions(), ...guidance() }))
    const r = await runPrepV2Pipeline({ preparationId: "c1810682", force: true })
    expect(r.validation.failures).toEqual([])
    expect(r.ok).toBe(true)
    expect(aiCalls.filter((c) => c.input.pass === "prep_v2.critique").length).toBe(1)
    const stored = dbState.persisted!.prep_v2 as PrepV2Payload
    expect("validation_warnings" in stored).toBe(false)
  })

  it("soft-only failures after the retry: stored with warnings, ok:true, name sanitized, Pass 5 runs", async () => {
    queueContext()
    respond(() => ({
      sections: sections(),
      questions: questions(["reflective", "factual"]),
      ...guidance("ضيفنا فهد العتيبي يروي كيف بدأ «مبخر»."),
    }))
    const r = await runPrepV2Pipeline({ preparationId: "c1810682", force: true })

    expect(aiCalls.filter((c) => c.input.pass === "prep_v2.critique").length).toBe(2)
    expect(r.ok).toBe(true)
    expect(r.soft_accepted).toBe(true)
    expect(r.reason).toBeUndefined()
    expect(r.validation.failures.map((f) => f.code)).toEqual(["vague_emotional_hook"])
    expect(r.sanitized_guest_references).toEqual([
      { field: "opening_options[0].text", name: "فهد العتيبي", snippet: "ضيفنا فهد العتيبي" },
    ])
    expect(insightMock.calls).toBe(1)

    const stored = dbState.persisted!.prep_v2 as PrepV2Payload
    expect(stored.opening_options[0].text).toBe("ضيفنا [الضيف] يروي كيف بدأ «مبخر».")
    expect(stored.validation_warnings).toHaveLength(1)
    expect(stored.validation_warnings![0]).toMatchObject({
      code: "vague_emotional_hook",
      severity: "soft",
      label_ar: "الذروة العاطفية بلا سؤال عاطفي أو بنيّة ضعيفة",
      detail: { peak_question_types: Array(5).fill(["reflective", "factual"]) },
    })
    expect(prepV2Schema.safeParse(stored).success).toBe(true)
  })

  it("a hard failure keeps ok:false validation_failed_after_retry, but the stored payload says so", async () => {
    queueContext()
    respond(() => ({ sections: sections(), questions: questions().slice(0, 10), ...guidance() }))
    const r = await runPrepV2Pipeline({ preparationId: "c1810682", force: true })

    expect(r.ok).toBe(false)
    expect(r.reason).toBe("validation_failed_after_retry")
    expect(r.soft_accepted).toBeUndefined()
    expect(insightMock.calls).toBe(0)
    const stored = dbState.persisted!.prep_v2 as PrepV2Payload
    const codes = stored.validation_warnings!.map((w) => w.code)
    expect(codes).toContain("question_count_out_of_range")
    expect(stored.validation_warnings!.every((w) => w.severity === "hard")).toBe(true)
  })
})
