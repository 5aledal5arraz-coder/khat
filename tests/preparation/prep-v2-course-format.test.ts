/**
 * Prep V2 — the «دورة مصغّرة / جلسة تدريبية» (course) format.
 *
 * Root cause this covers: Pass 2–4 never saw the episode goal and hard-coded
 * a six-beat emotional arc at ~75 minutes, so a goal that listed an ordered
 * syllabus (who he is → diagnose → first 100 days → AI) was bent into a
 * personal story. The course branch passes the goal through verbatim, pins
 * modules onto slot kinds in goal order, and validates against a course
 * contract instead of "missing emotional peak".
 *
 * No AI is called: `runAiTask` is mocked and answers per pass.
 */

import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

// ─── Mocks ────────────────────────────────────────────────────────────

type AiReq = {
  input: Record<string, unknown>
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

// Minimal Drizzle stand-in: every select chain resolves to the next queued
// row set; the transaction's UPDATE captures what the pipeline persists.
// Built in vi.hoisted because vi.mock factories run before module scope.
const dbState = vi.hoisted(() => {
  const state = {
    selectQueue: [] as Record<string, unknown>[][],
    persisted: null as Record<string, unknown> | null,
    /** What the persist transaction's locked SELECT sees (the prep being replaced). */
    lockedRow: [] as Record<string, unknown>[],
    fakeDb: null as unknown,
    writeRefused: false,
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
        select: () => chain(() => state.lockedRow),
        update: () => ({
          set: (v: Record<string, unknown>) => {
            state.persisted = v
            // The write is conditional (no live room) and RETURNING — one row
            // back means it landed. `writeRefused` simulates a take starting
            // while the passes ran.
            return chain(() => (state.writeRefused ? [] : [{ id: "prep" }]))
          },
        }),
      }),
  }
  return state
})
vi.mock("@/lib/db", () => ({ db: dbState.fakeDb }))
// The pipeline now refuses to run while a take is live on the prep (one extra
// SELECT at its entry). This stand-in DB is POSITIONAL — every select takes the
// next queued row set — so that read is answered here, not from the queue.
vi.mock("@/lib/recording-v2/live-guard", () => ({
  hasActiveRecordingForPreparation: vi.fn(async () => false),
  ROOM_LIVE_REGENERATION_MESSAGE: "",
}))
vi.mock("@/lib/collaboration/prep-live", () => ({
  broadcastPrepV2Update: vi.fn(async () => undefined),
}))
vi.mock("@/lib/preparation/v2/insights", () => ({
  runInsightGeneration: vi.fn(async () => ({
    ok: false,
    questions: [],
    ai_run_ids: [],
    stats: { drafted: 0, kept: 0, grounded: 0, capped: false },
  })),
}))

import { runResearchSynthesis } from "@/lib/preparation/v2/research"
import { runStructureBuild } from "@/lib/preparation/v2/structure"
import { runQuestionBankGeneration } from "@/lib/preparation/v2/question-banks"
import {
  runCritiquePass,
  rebalanceCourseMinutes,
  courseDraftBlock,
  COURSE_DRAFT_MAX_CHARS,
} from "@/lib/preparation/v2/critique"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PrepV2View } from "@/app/admin/preparation/[id]/prep-v2-view"
import { runPrepV2Pipeline, backfillQuestionFloor } from "@/lib/preparation/v2/pipeline"
import {
  validatePrepV2Payload,
  describeValidationFailuresAr,
} from "@/lib/preparation/v2/validation"
import {
  assignCourseSlots,
  courseSlotsFor,
  courseTargetMinutes,
  coerceCourseTargetChoice,
  autoCourseTargetMinutes,
  autoOptionLabel,
  effectiveCourseTarget,
  COURSE_PROMPT_VERSION,
  PREP_BACKBONE_PROMPT_VERSION,
  extractTargetMinutes,
  isCourseSlotSequence,
  prepFormatOf,
  sectionLabelAr,
  type CourseModuleDraft,
} from "@/lib/preparation/v2/format"
import { prepV2Schema } from "@/lib/db/validators"
import { khatConstitutionBlock } from "@/lib/khat-map/core/constitution"
import { coachHint, sectionTargetLevel } from "@/lib/recording-v2/energy"
import { cardInputsFromPrepV2 } from "@/lib/ai/interview-cards"
import type {
  PrepV2Payload,
  PrepV2Question,
  PrepV2Section,
  SectionKind,
} from "@/lib/preparation/v2/types"

// ─── Fixtures ─────────────────────────────────────────────────────────

/** Shape of the real goal on EIR 3b0333ea (trimmed), incl. its numbering. */
const BADER_GOAL = [
  "حلقة ثقيلة وطويلة (قرابة ساعتين) تُبنى كمرجع أو «دورة مصغّرة» في القيادة مع د. بدر الطريجي.",
  "الترتيب المطلوب:",
  "1) من هو بدر الطريجي (15–20 دقيقة): الانتقال من الطب إلى الإدارة، تجارب النجاح والفشل.",
  "2) تشخيص المؤسسات بعين الطبيب (نفهم).",
  "3) أول 100 يوم: دليل القائد اللي استلم مؤسسة (نتصرف).",
  "4) القيادة في زمن الذكاء الاصطناعي (المستقبل).",
].join("\n")

const PASS1 = {
  thesis: "القائد الجيد يشخّص المؤسسة كما يشخّص الطبيب مريضه قبل أن يصف العلاج",
  axes_of_tension: [
    "التفريق بين العرَض والمرض",
    "مؤشرات الأداء كأدوات فحص",
    "الفريق الموروث في أول 100 يوم",
    "المكاسب السريعة دون محو من سبق",
    "ما يبقى إنسانياً في قيادة زمن الذكاء الاصطناعي",
    "قيادة فريق نصفه أدوات",
  ],
  guest_extraction_strategy:
    "يُستخرج من الضيف منهجه خطوةً خطوة عبر طلب أمثلة من تجربته الطبية والإدارية داخل كل محور، مع تحويل كل تجربة فشل إلى درس قابل للتطبيق.",
  sensitive_zones: ["لا يُسمّي شركاته عادةً — يُطرح الأمر فقط إن رغب"],
}

const MODULE_TITLES = [
  "من هو بدر الطريجي",
  "تشخيص المؤسسات بعين الطبيب",
  "أول 100 يوم",
  "القيادة في زمن الذكاء الاصطناعي",
  "الخلاصة وحقيبة الأدوات",
]

function mod(title: string, minutes: number): CourseModuleDraft {
  return {
    title,
    intent: `يشرح هذا المحور ${title} بمنهج عملي واضح`,
    learning_objective: `أن يستطيع المستمع تطبيق ${title} في مؤسسته`,
    key_concepts: ["مفهوم أ", "مفهوم ب"],
    takeaway_tool: `قائمة فحص: ${title}`,
    guest_experience_fit: "مثال من تجربته في إدارة المستشفى",
    target_emotion: "وضوح",
    estimated_minutes: minutes,
    transition_goal: "الانتقال إلى المحور التالي",
  }
}

const COURSE_KINDS: SectionKind[] = ["opening", "build_up", "conflict", "deep_dive", "resolution"]

function courseSections(minutes = [18, 30, 30, 30, 8]): PrepV2Section[] {
  return assignCourseSlots(MODULE_TITLES.map((t, i) => mod(t, minutes[i])))!
}

function courseQuestions(): PrepV2Question[] {
  const perSlot: Record<string, number> = {
    opening: 5,
    build_up: 8,
    conflict: 8,
    deep_dive: 8,
    resolution: 3,
  }
  const out: PrepV2Question[] = []
  for (const kind of COURSE_KINDS) {
    for (let i = 0; i < perSlot[kind]; i++) {
      out.push({
        id: `${kind}-${i}`,
        section: kind,
        text: `ما الخطوات العملية رقم ${i} في هذا المحور، وكيف طبّقتها في تجربتك؟`,
        types: ["factual", "reflective"],
        priority: i < 3 ? "must_ask" : "if_time",
        purpose: "يستخرج خطوة من المنهج وأداة عملية للمستمع",
        follow_up_prompt: "أعطنا مثالاً محدداً.",
        risk_level: "low",
      })
    }
  }
  return out
}

function guidance() {
  return {
    host_guidance: {
      overall_tone: "ميسّر فضولي يستخرج المنهج",
      do_list: ["اطلب مثالاً", "لخّص الإطار", "اربط بالمحور السابق"],
      dont_list: ["لا تستجوب", "لا تطلب اعترافاً", "لا تقفز بين المحاور"],
      energy_curve: "فهم يتراكم محوراً بعد محور",
    },
    director_guidance: {
      shot_priorities: ["لحظة ذكر الإطار", "المثال الأول", "الخلاصة"],
      silence_moments: ["بعد ذكر الإطار", "بعد المثال"],
      cut_warnings: [],
    },
    opening_options: [
      { approach: "وعد الدورة", text: "بعد هذه الحلقة ستعرف كيف تشخّص مؤسستك." },
      { approach: "سؤال", text: "ماذا لو عامل القائد مؤسسته كمريض؟" },
    ],
    closing_options: [
      { approach: "الخطوة الأولى", text: "ما الخطوة الأولى التي يبدأ بها المستمع غداً؟" },
      { approach: "الأداة", text: "لو خرج المستمع بأداة واحدة، ما هي؟" },
    ],
    critic_notes: ["أعيد توزيع الدقائق"],
  }
}

function coursePayload(overrides: Partial<PrepV2Payload> = {}): PrepV2Payload {
  const sections = courseSections()
  const g = guidance()
  return {
    format: "course",
    target_minutes: 120,
    thesis: PASS1.thesis,
    axes_of_tension: PASS1.axes_of_tension,
    guest_extraction_strategy: PASS1.guest_extraction_strategy,
    episode_sections: sections,
    question_bank: courseQuestions(),
    host_guidance: g.host_guidance,
    director_guidance: g.director_guidance,
    sensitive_zones: PASS1.sensitive_zones,
    opening_options: g.opening_options,
    closing_options: g.closing_options,
    total_estimated_minutes: sections.reduce((a, s) => a + s.estimated_minutes, 0),
    generator_version: "v2.1",
    generated_at: new Date().toISOString(),
    ai_run_ids: {
      pass1_research: null,
      pass2_structure: null,
      pass3_questions: null,
      pass4_critique: null,
      pass5_insights: null,
    },
    ...overrides,
  }
}

const system = (req: AiReq) => req.prompt.find((m) => m.role === "system")!.content
const user = (req: AiReq) => req.prompt.find((m) => m.role === "user")!.content

beforeEach(() => {
  aiCalls.length = 0
  aiResponder = () => null
  dbState.selectQueue.length = 0
  dbState.persisted = null
  dbState.lockedRow = []
  dbState.writeRefused = false
})

// ─── Story mode is byte-identical ─────────────────────────────────────

describe("story mode — prompts unchanged", () => {
  /**
   * SHA-256 of each full runAiTask request (prompt + input metadata), captured
   * from the code BEFORE the course format existed, with the same fixtures.
   * Any drift in the story path — one character — changes a hash.
   */
  const PRE_CONSTITUTION = [
    "04690773f26a429b98ee8b8be6ac1db2f2014720586aaac0e7a2082e16fad8ab",
    "8d2855594bb32270836406a659b845838043012ea226a419a3309ad7de096022",
    "e451483bdc0752f7340db84244ed86edbc817acf958e3f326d8c84b32055a909",
    "437c930349d1387efaa634c31dba962bdc1d2513445dc597e06f98788d17c494",
  ]
  /**
   * Re-pinned deliberately on 2026-09-28 (batch 2, «دستور خط»): passes 1–2
   * (research synthesis, structure) now open with the constitution (compact)
   * and carry PREP_BACKBONE_PROMPT_VERSION.story. Passes 3–4 did not change
   * and keep their pre-feature hashes. The companion test below proves the
   * constitution block + the version tag are the ONLY difference: strip them
   * and passes 1–2 hash back to PRE_CONSTITUTION.
   */
  const BASELINE = [
    "a147326f685107c46defd5df7f0f334aeba4d84301a041840934ab07b0c36fbe",
    "26dcd37af1586f815587c8eccac3d8e67f205a003688e716d2b25f04a1e18aeb",
    PRE_CONSTITUTION[2],
    PRE_CONSTITUTION[3],
  ]

  async function runAllStoryPasses() {
    const pass1 = {
      thesis: "t".repeat(40),
      axes_of_tension: ["a1", "a2", "a3", "a4", "a5", "a6"],
      guest_extraction_strategy: "g".repeat(90),
      sensitive_zones: ["z"],
    }
    const sections = (
      ["opening", "build_up", "conflict", "deep_dive", "emotional_peak", "resolution"] as const
    ).map((kind) => ({
      kind,
      intent: "i " + kind,
      target_emotion: "e",
      estimated_minutes: 12,
      transition_goal: "tg",
    }))
    const questions: PrepV2Question[] = [
      {
        id: "q1",
        section: "opening",
        text: "question text one",
        types: ["factual"],
        priority: "must_ask",
        purpose: "p",
        follow_up_prompt: "f",
        risk_level: "low",
      },
    ]
    await runResearchSynthesis({
      episode_title: "T",
      episode_goal: "G",
      topic_domain: "d",
      episode_type: "x",
      language: "ar",
      editorial_intent: { a: 1 },
      hybrid_provenance: null,
      guest_identity: { name: "n" },
      eir_id: "e",
      preparation_id: "p",
    })
    await runStructureBuild({ language: "ar", preparation_id: "p", eir_id: "e", pass1 })
    await runQuestionBankGeneration({
      language: "ar",
      preparation_id: "p",
      eir_id: "e",
      pass1,
      pass2: { sections },
    })
    await runCritiquePass({
      language: "ar",
      preparation_id: "p",
      eir_id: "e",
      pass1,
      pass2: { sections },
      pass3: { questions },
    })
  }

  const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")

  it("all four passes send exactly the pinned request", async () => {
    await runAllStoryPasses()
    expect(aiCalls.map(sha)).toEqual(BASELINE)
  })

  it("the constitution block + version tag are the ONLY change to passes 1–2", async () => {
    await runAllStoryPasses()
    const prefix = khatConstitutionBlock("compact") + "\n\n"
    const stripped = aiCalls.slice(0, 2).map((c) => {
      const copy = JSON.parse(JSON.stringify(c)) as AiReq & { promptVersion?: string }
      expect(copy.promptVersion).toBe(PREP_BACKBONE_PROMPT_VERSION.story)
      delete copy.promptVersion
      const sys = copy.prompt.find((m) => m.role === "system")!
      expect(sys.content.startsWith(prefix)).toBe(true)
      sys.content = sys.content.slice(prefix.length)
      return copy
    })
    expect(stripped.map(sha)).toEqual(PRE_CONSTITUTION.slice(0, 2))
  })

  it("a story payload still fails without an emotional peak (rule kept)", () => {
    const p = coursePayload()
    delete p.format
    delete p.target_minutes
    const codes = validatePrepV2Payload(p).failures.map((f) => f.code)
    expect(codes).toContain("vague_emotional_hook")
    expect(codes).toContain("wrong_section_count")
  })
})

// ─── Format helpers ───────────────────────────────────────────────────

describe("format helpers", () => {
  it("reads the target length from the goal", () => {
    expect(extractTargetMinutes(BADER_GOAL)).toBe(120)
    // Round 4: only strict length phrases count («مدة الحلقة …»).
    expect(extractTargetMinutes("مدة الحلقة ساعة ونص")).toBe(90)
    expect(extractTargetMinutes("مدة الحلقة: ٩٠ دقيقة")).toBe(90)
    expect(extractTargetMinutes("about 2 hours")).toBe(120)
    // A per-module duration is not the episode's total.
    expect(extractTargetMinutes("1) التعريف (15–20 دقيقة)")).toBeNull()
    expect(extractTargetMinutes(null)).toBeNull()
  })

  it("pins modules onto slots in goal order: opening, middles, resolution", () => {
    const s = courseSections()
    expect(s.map((x) => x.kind)).toEqual(COURSE_KINDS)
    expect(s.map((x) => x.title)).toEqual(MODULE_TITLES)
    expect(courseSlotsFor(6)).toEqual([
      "opening",
      "build_up",
      "conflict",
      "deep_dive",
      "emotional_peak",
      "resolution",
    ])
    expect(isCourseSlotSequence(COURSE_KINDS)).toBe(true)
    expect(isCourseSlotSequence(["opening", "conflict", "resolution"])).toBe(false)
  })

  it("merges overflow topics into the last middle slot instead of dropping them", () => {
    const titles = ["مقدمة", "أ", "ب", "ج", "د", "هـ", "خلاصة"]
    const s = assignCourseSlots(titles.map((t) => mod(t, 10)))!
    expect(s).toHaveLength(6)
    expect(s[4].kind).toBe("emotional_peak")
    expect(s[4].title).toBe("د + هـ")
    expect(s[4].estimated_minutes).toBe(20)
    expect(s[5].title).toBe("خلاصة")
  })

  it("refuses fewer than 3 modules", () => {
    expect(assignCourseSlots([mod("أ", 10), mod("ب", 10)])).toBeNull()
  })

  it("labels a module by its title, a story section by the arc", () => {
    const s = courseSections()
    expect(sectionLabelAr("deep_dive", s)).toBe("القيادة في زمن الذكاء الاصطناعي")
    expect(sectionLabelAr("emotional_peak", null)).toBe("الذروة العاطفية")
    expect(prepFormatOf(null)).toBe("story")
    expect(prepFormatOf({ format: "course" })).toBe("course")
  })
})

// ─── Course passes ────────────────────────────────────────────────────

describe("course — Pass 2 structure", () => {
  it("sends the goal verbatim + the target, and keeps goal order", async () => {
    aiResponder = () => ({
      modules: MODULE_TITLES.map((t, i) => ({ ...mod(t, [18, 30, 30, 30, 8][i]) })),
    })
    const r = await runStructureBuild({
      language: "ar",
      preparation_id: "p",
      eir_id: "e",
      pass1: PASS1,
      format: "course",
      episode_goal: BADER_GOAL,
      target_minutes: 120,
    })
    expect(r.ok).toBe(true)
    expect(r.output!.sections.map((s) => s.title)).toEqual(MODULE_TITLES)
    expect(r.output!.sections.map((s) => s.kind)).toEqual(COURSE_KINDS)
    const req = aiCalls[0]
    expect(user(req)).toContain("أول 100 يوم")
    expect(system(req)).toContain("120-minute")
    expect(system(req)).toContain("IN THE EXACT ORDER")
    expect(system(req)).not.toContain("emotional_peak")
    expect(req.input).toMatchObject({ format: "course", target_minutes: 120 })
  })

  it("fails honestly when the model returns too few modules", async () => {
    aiResponder = () => ({ modules: [mod("أ", 10), mod("ب", 10)] })
    const r = await runStructureBuild({
      language: "ar",
      preparation_id: "p",
      eir_id: "e",
      pass1: PASS1,
      format: "course",
      episode_goal: BADER_GOAL,
      target_minutes: 120,
    })
    expect(r.ok).toBe(false)
  })
})

describe("course — Pass 3 questions", () => {
  it("drops the emotional/confrontation quotas and routes only to used slots", async () => {
    aiResponder = () => ({
      questions: [
        {
          section: "deep_dive",
          text: "كيف يقود القائد فريقاً نصفه أدوات ذكاء اصطناعي؟",
          types: ["factual"],
          priority: "must_ask",
          purpose: "أداة",
          follow_up_prompt: "مثال؟",
          risk_level: "low",
        },
        {
          // emotional_peak is not a slot this 5-module course uses.
          section: "emotional_peak",
          text: "ما أكثر لحظة ندمت عليها في حياتك المهنية؟",
          types: ["emotional"],
          priority: "must_ask",
          purpose: "ذروة",
          follow_up_prompt: "لماذا؟",
          risk_level: "high",
        },
      ],
    })
    const r = await runQuestionBankGeneration({
      language: "ar",
      preparation_id: "p",
      eir_id: "e",
      pass1: PASS1,
      pass2: { sections: courseSections() },
      format: "course",
      episode_goal: BADER_GOAL,
    })
    expect(r.output!.questions.map((q) => q.section)).toEqual(["deep_dive"])
    const sys = system(aiCalls[0])
    expect(sys).not.toContain("MUST contain at least 2 questions tagged 'emotional'")
    expect(sys).toContain("Do not use the types 'confrontational' or 'emotional'")
    expect(sys).toContain("deep_dive: 9") // 30 min ⇒ ~9 questions, never 1
    expect(user(aiCalls[0])).toContain("«أول 100 يوم»")
  })
})

describe("course — Pass 4 critique", () => {
  it("keeps modules fixed and rebalances minutes to the course target", async () => {
    const sections = courseSections()
    const questions = courseQuestions()
    aiResponder = () => ({
      // The critic tries to rename a module and shrink everything to 75.
      sections: sections.map((s) => ({ kind: s.kind, title: "X", estimated_minutes: 15 })),
      questions: questions.map((q) => ({ ...q })),
      ...guidance(),
    })
    const r = await runCritiquePass({
      language: "ar",
      preparation_id: "p",
      eir_id: "e",
      pass1: PASS1,
      pass2: { sections },
      pass3: { questions },
      format: "course",
      target_minutes: 120,
    })
    expect(r.ok).toBe(true)
    expect(r.revised_sections.map((s) => s.title)).toEqual(MODULE_TITLES)
    const total = r.revised_sections.reduce((a, s) => a + s.estimated_minutes, 0)
    expect(total).toBeGreaterThanOrEqual(96)
    expect(total).toBeLessThanOrEqual(144)
    expect(system(aiCalls[0])).toContain("between 96 and 144")
  })

  it("rebalance never dumps the rounding remainder on the wrap-up", () => {
    const s = courseSections([6, 11, 13, 17, 5])
    rebalanceCourseMinutes(s, 120)
    const wrap = s[s.length - 1].estimated_minutes
    expect(wrap).toBeLessThan(s[1].estimated_minutes)
  })
})

// ─── Validation ───────────────────────────────────────────────────────

describe("course — validation", () => {
  it("accepts a course with no emotional peak", () => {
    const r = validatePrepV2Payload(coursePayload(), {
      linkedGuestName: "بدر الطريجي",
    })
    expect(r.failures).toEqual([])
    expect(r.ok).toBe(true)
  })

  it("judges duration against the course target, not [60, 90]", () => {
    const codes = validatePrepV2Payload(coursePayload({ total_estimated_minutes: 75 }))
      .failures.map((f) => f.code)
    expect(codes).toContain("duration_out_of_range")
  })

  it("requires every topic module to carry a practical tool", () => {
    const p = coursePayload()
    p.episode_sections[2] = { ...p.episode_sections[2], takeaway_tool: "" }
    const codes = validatePrepV2Payload(p).failures.map((f) => f.code)
    expect(codes).toContain("course_module_incomplete")
  })

  it("the prep_v2 JSONB schema accepts a course payload", () => {
    expect(prepV2Schema.safeParse(coursePayload()).success).toBe(true)
  })
})

// ─── Whole pipeline, course ───────────────────────────────────────────

describe("runPrepV2Pipeline — format: course", () => {
  it("threads the goal through every pass and persists a valid course", async () => {
    process.env.KHAT_JSONB_VALIDATORS_MODE = "enforce"
    // loadContext: prep row, then EIR row.
    dbState.selectQueue.push(
      [
        {
          id: "prep-1",
          title: "القيادة بعين الطبيب",
          episode_goal: BADER_GOAL,
          guest_identity: null,
          guest_name: "بدر الطريجي",
          eir_id: "eir-1",
        },
      ],
      [{ editorial_intent: {}, topic_domain: "leadership", episode_type: "expert" }],
    )
    aiResponder = (req) => {
      switch (req.input.pass) {
        case "prep_v2.research_synthesis":
          return PASS1
        case "prep_v2.structure_build":
          return {
            modules: MODULE_TITLES.map((t, i) => mod(t, [18, 30, 30, 30, 8][i])),
          }
        case "prep_v2.question_banks":
          return { questions: courseQuestions() }
        case "prep_v2.critique":
          return { questions: courseQuestions(), ...guidance() }
        default:
          return null
      }
    }

    const r = await runPrepV2Pipeline({ preparationId: "prep-1", force: true, format: "course" })
    delete process.env.KHAT_JSONB_VALIDATORS_MODE

    expect(r.validation.failures).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.payload!.format).toBe("course")
    expect(r.payload!.target_minutes).toBe(120)
    expect(r.payload!.total_estimated_minutes).toBe(116)
    expect(r.payload!.episode_sections.map((s) => s.title)).toEqual(MODULE_TITLES)
    // "First 100 days" is a full module, not one question in the closing.
    expect(r.payload!.question_bank.filter((q) => q.section === "conflict").length).toBe(8)

    const passes = aiCalls.map((c) => c.input.pass)
    expect(passes).toEqual([
      "prep_v2.research_synthesis",
      "prep_v2.structure_build",
      "prep_v2.question_banks",
      "prep_v2.critique",
    ])
    for (const c of aiCalls) expect(c.input.format).toBe("course")
    expect(dbState.persisted).not.toBeNull()
    expect((dbState.persisted!.prep_v2 as PrepV2Payload).format).toBe("course")
  })

  it("REFUSES the write when a take started while the passes ran (live-guard TOCTOU)", async () => {
    // The entry check passed (no live room then); the passes take minutes; a
    // take starts; the conditional UPDATE matches 0 rows. The host must keep
    // the bank he is reading from, and the operator gets the same refusal.
    dbState.selectQueue.push(
      [
        {
          id: "prep-1",
          title: "القيادة بعين الطبيب",
          episode_goal: BADER_GOAL,
          guest_identity: null,
          guest_name: "بدر الطريجي",
          eir_id: "eir-1",
        },
      ],
      [{ editorial_intent: {}, topic_domain: "leadership", episode_type: "expert" }],
    )
    aiResponder = (req) => {
      switch (req.input.pass) {
        case "prep_v2.research_synthesis":
          return PASS1
        case "prep_v2.structure_build":
          return { modules: MODULE_TITLES.map((t, i) => mod(t, [18, 30, 30, 30, 8][i])) }
        case "prep_v2.question_banks":
          return { questions: courseQuestions() }
        case "prep_v2.critique":
          return { questions: courseQuestions(), ...guidance() }
        default:
          return null
      }
    }
    dbState.writeRefused = true

    const r = await runPrepV2Pipeline({ preparationId: "prep-1", force: true, format: "course" })

    expect(r.ok).toBe(false)
    expect(r.reason).toBe("room_live")
    expect(r.payload).toBeNull()
  })

  it("regeneration keeps questions a person added (manual / guest) whose module still exists", async () => {
    process.env.KHAT_JSONB_VALIDATORS_MODE = "enforce"
    dbState.selectQueue.push(
      [
        {
          id: "prep-1",
          title: "القيادة بعين الطبيب",
          episode_goal: BADER_GOAL,
          guest_identity: null,
          guest_name: "بدر الطريجي",
          eir_id: "eir-1",
        },
      ],
      [{ editorial_intent: {}, topic_domain: "leadership", episode_type: "expert" }],
    )
    const authored = (id: string, section: string, origin: "manual" | "guest") => ({
      id,
      section,
      text: `سؤال أضافه الفريق ${id}`,
      types: ["reflective"],
      priority: "must_ask",
      purpose: "",
      follow_up_prompt: "",
      risk_level: "low",
      origin,
    })
    dbState.lockedRow = [
      {
        id: "prep-1",
        prep_v2: {
          question_bank: [
            { ...authored("gen-old", "conflict", "manual"), origin: undefined },
            authored("manual-keep", "conflict", "manual"),
            authored("guest-keep", "opening", "guest"),
            authored("manual-gone", "emotional_peak", "manual"),
          ],
        },
      },
    ]
    aiResponder = (req) => {
      switch (req.input.pass) {
        case "prep_v2.research_synthesis":
          return PASS1
        case "prep_v2.structure_build":
          return { modules: MODULE_TITLES.map((t, i) => mod(t, [18, 30, 30, 30, 8][i])) }
        case "prep_v2.question_banks":
          return { questions: courseQuestions() }
        case "prep_v2.critique":
          return { questions: courseQuestions(), ...guidance() }
        default:
          return null
      }
    }
    const r = await runPrepV2Pipeline({ preparationId: "prep-1", force: true, format: "course" })
    delete process.env.KHAT_JSONB_VALIDATORS_MODE

    const stored = (dbState.persisted!.prep_v2 as PrepV2Payload).question_bank
    const ids = stored.map((q) => q.id)
    expect(ids).toContain("manual-keep")
    expect(ids).toContain("guest-keep")
    expect(ids).not.toContain("gen-old") // generated: replaced, as before
    expect(ids).not.toContain("manual-gone") // its section is not in this course
    const conflict = stored.filter((q) => q.section === "conflict").map((q) => q.id)
    expect(conflict[conflict.length - 1]).toBe("manual-keep") // appended to its module
    expect(r.payload!.question_bank.map((q) => q.id)).toEqual(ids) // result = what was stored
  })

  it("omitting format stays story (no format key persisted)", async () => {
    dbState.selectQueue.push(
      [{ id: "prep-2", title: "t", episode_goal: "g", guest_identity: null, guest_name: null, eir_id: null }],
    )
    aiResponder = (req) => (req.input.pass === "prep_v2.research_synthesis" ? null : null)
    const r = await runPrepV2Pipeline({ preparationId: "prep-2", force: true })
    expect(r.reason).toBe("pass1_failed")
    expect(aiCalls[0].input.format).toBeUndefined()
  })
})

// ─── Downstream consumers ─────────────────────────────────────────────

describe("course — recording room + cards", () => {
  it("coaching never pushes confrontation in a course", () => {
    for (const s of COURSE_KINDS) {
      for (const e of [0, 1, 2, 3, 4, 5]) {
        const h = coachHint(s, e, "course") ?? ""
        expect(h).not.toMatch(/المواجهة|الذروة العاطفية|ادفع|اضغط/)
      }
    }
    expect(coachHint("conflict", 1, "course")).toBe("اطلب مثالاً عملياً من تجربته — الإيقاع هابط")
    expect(sectionTargetLevel("conflict", "course")).toBe(3)
  })

  it("story coaching is unchanged", () => {
    expect(coachHint("conflict", 1)).toBe("ادفع أكثر — نحن في قسم المواجهة")
    expect(sectionTargetLevel("conflict")).toBe(5)
  })

  it("cards carry the module title and are not escalation beats", () => {
    const p = coursePayload()
    const [card] = cardInputsFromPrepV2("prep", [p.question_bank.find((q) => q.section === "conflict")!], p)
    expect(card.section_label).toBe("أول 100 يوم")
    expect(card.bucket).toBe("deep")
  })

  it("course backfill asks for a practical step, not a confession", () => {
    const qs = courseQuestions().slice(0, 21)
    const out = backfillQuestionFloor(qs, courseSections(), PASS1, true)
    const fillers = out.slice(21)
    expect(fillers.length).toBe(3)
    for (const f of fillers) {
      expect(f.text).toContain("الخطوة العملية")
      expect(f.text).not.toContain("تشعر")
    }
  })
})

// ═══ Round 2 — QA (noura) + AI review (rashid) ═══════════════════════

describe("round 2 — target duration", () => {
  it("sums per-module durations instead of taking the largest one", () => {
    const goal = [
      "1) التعريف (15 دقيقة)",
      "2) التشخيص (45 دقيقة)",
      "3) أول 100 يوم (40 دقيقة)",
      "4) المستقبل (30 دقيقة)",
    ].join("\n")
    expect(extractTargetMinutes(goal)).toBe(130)
    // A range counts its upper bound.
    expect(extractTargetMinutes("أ (15–20 دقيقة) ب (30 دقيقة)")).toBe(50)
  })

  it("round 4: ≥2 module durations ALWAYS win over a stated total", () => {
    expect(extractTargetMinutes("قرابة 100 دقيقة. 1) أ (15 دقيقة) 2) ب (45 دقيقة) 3) ج (45 دقيقة)")).toBe(105)
    expect(extractTargetMinutes(BADER_GOAL)).toBe(120) // «قرابة ساعتين» + «(15–20 دقيقة)»
  })

  it("recognises ساعة / ساعة واحدة / ساعة ونص", () => {
    expect(extractTargetMinutes("مدة الحلقة: ساعة")).toBe(60)
    expect(extractTargetMinutes("طول الحلقة ساعة واحدة")).toBe(60)
    expect(extractTargetMinutes("(قرابة ساعة ونص)")).toBe(90)
    expect(extractTargetMinutes("ساعات طويلة من العمل")).toBeNull()
  })

  it("expected_duration_min wins over the goal", () => {
    expect(courseTargetMinutes(BADER_GOAL, 90)).toBe(90)
    expect(courseTargetMinutes(BADER_GOAL, null)).toBe(120)
    expect(courseTargetMinutes(null, null)).toBe(120)
  })

  it("caps the target at what the modules can hold", () => {
    expect(effectiveCourseTarget(180, 3)).toBe(135)
    expect(effectiveCourseTarget(120, 5)).toBe(120)
  })
})

describe("round 2 — rebalance redistributes clamped minutes", () => {
  const sum = (s: PrepV2Section[]) => s.reduce((a, x) => a + x.estimated_minutes, 0)

  it("1 topic @120 reaches the window (was 93)", () => {
    const s = assignCourseSlots([mod("مقدمة", 18), mod("محور", 30), mod("خلاصة", 8)])!
    rebalanceCourseMinutes(s, 120)
    expect(sum(s)).toBe(120)
    for (const x of s) expect(x.estimated_minutes).toBeLessThanOrEqual(45)
  })

  it("2 topics @180 fills to the caps (was 135)", () => {
    const s = assignCourseSlots([mod("مقدمة", 18), mod("أ", 30), mod("ب", 30), mod("خلاصة", 8)])!
    rebalanceCourseMinutes(s, 180)
    expect(sum(s)).toBe(180)
  })

  it("an infeasible target is capped, and validation accepts the capped length", () => {
    const s = assignCourseSlots([mod("مقدمة", 18), mod("محور", 30), mod("خلاصة", 8)])!
    rebalanceCourseMinutes(s, 180)
    expect(sum(s)).toBe(135)
    const qs = courseQuestions()
      .filter((q) => ["opening", "build_up", "resolution"].includes(q.section))
      .concat(courseQuestions().filter((q) => q.section === "conflict").map((q) => ({ ...q, section: "build_up" as const, id: q.id + "x" })))
    const p = coursePayload({
      episode_sections: s,
      question_bank: qs,
      target_minutes: 180,
      total_estimated_minutes: sum(s),
    })
    const codes = validatePrepV2Payload(p).failures.map((f) => f.code)
    expect(codes).not.toContain("duration_out_of_range")
  })
})

describe("round 2 — duration message names the course window", () => {
  it("course failure carries its own window in English and Arabic", () => {
    const [f] = validatePrepV2Payload(coursePayload({ total_estimated_minutes: 75 }))
      .failures.filter((x) => x.code === "duration_out_of_range")
    expect(f.message).toContain("[96, 144]")
    expect(f.message).not.toContain("[60, 90]")
    expect(describeValidationFailuresAr([f])).toBe("مجموع دقائق الدورة خارج النطاق [96, 144]")
  })

  it("story failure message is unchanged", () => {
    const p = coursePayload({ total_estimated_minutes: 20 })
    delete p.format
    const f = validatePrepV2Payload(p).failures.find((x) => x.code === "duration_out_of_range")!
    expect(f).toEqual({
      code: "duration_out_of_range",
      message: "total_estimated_minutes must be in [60, 90].",
    })
    expect(describeValidationFailuresAr([f])).toBe("مجموع دقائق الحلقة خارج النطاق [60, 90]")
  })
})

describe("round 2 — course prompts (rashid)", () => {
  async function allCoursePrompts(): Promise<string> {
    aiResponder = () => null
    await runResearchSynthesis({
      episode_title: "T", episode_goal: BADER_GOAL, topic_domain: null, episode_type: null,
      language: "ar", editorial_intent: null, hybrid_provenance: null, guest_identity: null,
      eir_id: null, preparation_id: "p", format: "course",
    })
    await runStructureBuild({ language: "ar", preparation_id: "p", eir_id: null, pass1: PASS1, format: "course", episode_goal: "G", target_minutes: 120 })
    await runQuestionBankGeneration({ language: "ar", preparation_id: "p", eir_id: null, pass1: PASS1, pass2: { sections: courseSections() }, format: "course", episode_goal: "G" })
    await runCritiquePass({ language: "ar", preparation_id: "p", eir_id: null, pass1: PASS1, pass2: { sections: courseSections() }, pass3: { questions: courseQuestions() }, format: "course", target_minutes: 120 })
    return aiCalls.map(system).join("\n")
  }

  it("carry no guest-specific examples", async () => {
    const all = await allCoursePrompts()
    for (const leak of ["symptom", "disease", "inherited team", "100 days", "diagnose an organisation"]) {
      expect(all).not.toContain(leak)
    }
  })

  it("course passes 1–2 carry the constitution version, 3–4 stay prep_v2.course.v1", async () => {
    await allCoursePrompts()
    expect(aiCalls).toHaveLength(4)
    const versions = aiCalls.map((c) => (c as unknown as { promptVersion: string }).promptVersion)
    expect(versions).toEqual([
      PREP_BACKBONE_PROMPT_VERSION.course,
      PREP_BACKBONE_PROMPT_VERSION.course,
      COURSE_PROMPT_VERSION,
      COURSE_PROMPT_VERSION,
    ])
    for (const c of aiCalls.slice(0, 2)) expect(system(c).startsWith(khatConstitutionBlock("compact"))).toBe(true)
  })

  it("Pass 3 anchors then extracts, opens goal-named doors, and treats slot ids as opaque", async () => {
    await allCoursePrompts()
    const p3 = system(aiCalls[2])
    expect(p3).toContain("Anchor, then extract")
    expect(p3).toContain("The step list or checklist belongs in follow_up_prompt")
    expect(p3).not.toContain("what are the steps")
    expect(p3).toContain("doors the EPISODE GOAL explicitly names are IN scope for module 0")
    expect(p3).toContain("a previous episode already covered")
    expect(p3).toContain("Section ids are opaque slot labels")
    const p4 = system(aiCalls[3])
    expect(p4).toContain("doors the EPISODE GOAL explicitly names are IN scope for module 0")
    expect(p4).toContain("Section ids are opaque slot labels")
    expect(p4).toContain("a later module must not be starved in favour of the guest's personal story")
  })
})

describe("round 2 — critic behaviour in course mode", () => {
  it("remaps confrontational/emotional to reflective (Pass 3 and Pass 4)", async () => {
    aiResponder = () => ({
      questions: [{ section: "build_up", text: "سؤال طويل بما يكفي للاختبار؟", types: ["confrontational", "emotional", "factual"], priority: "must_ask", purpose: "p", follow_up_prompt: "f", risk_level: "low" }],
    })
    const r3 = await runQuestionBankGeneration({ language: "ar", preparation_id: "p", eir_id: null, pass1: PASS1, pass2: { sections: courseSections() }, format: "course", episode_goal: "G" })
    expect(r3.output!.questions[0].types).toEqual(["reflective", "factual"])

    const qs = courseQuestions()
    aiResponder = () => ({ questions: qs.map((q) => ({ ...q, types: ["confrontational"] })), ...guidance() })
    const r4 = await runCritiquePass({ language: "ar", preparation_id: "p", eir_id: null, pass1: PASS1, pass2: { sections: courseSections() }, pass3: { questions: qs }, format: "course", target_minutes: 120 })
    for (const q of r4.revised_questions) expect(q.types).toEqual(["reflective"])
  })

  it("does not move questions across modules to fill a thin one", async () => {
    // resolution gets only 1 question back; the others stay where they are.
    const qs = courseQuestions().filter((q) => q.section !== "resolution" || q.id === "resolution-0")
      .map((q) => ({ ...q, priority: "if_time" as const }))
    aiResponder = () => ({ questions: qs, ...guidance() })
    const r = await runCritiquePass({ language: "ar", preparation_id: "p", eir_id: null, pass1: PASS1, pass2: { sections: courseSections() }, pass3: { questions: qs }, format: "course", target_minutes: 120 })
    const bySection = (k: string) => r.revised_questions.filter((q) => q.section === k).length
    expect(bySection("resolution")).toBe(1)
    expect(bySection("build_up")).toBe(8)
  })

  it("an oversized draft sheds purpose/follow-up before any slice — still valid JSON", () => {
    const long = "ن".repeat(400)
    const qs = Array.from({ length: 38 }, (_, i) => ({
      ...courseQuestions()[i % 32],
      id: `q-${i}`,
      purpose: long,
      follow_up_prompt: long,
    }))
    const block = courseDraftBlock({ language: "ar", preparation_id: "p", eir_id: null, pass1: PASS1, pass2: { sections: courseSections() }, pass3: { questions: qs }, format: "course" })
    expect(block.length).toBeLessThanOrEqual(COURSE_DRAFT_MAX_CHARS)
    const parsed = JSON.parse(block) as { questions: Array<Record<string, unknown>> }
    expect(parsed.questions).toHaveLength(38)
    expect(parsed.questions[37]).not.toHaveProperty("purpose")
    // A draft that fits keeps every field.
    const small = JSON.parse(courseDraftBlock({ language: "ar", preparation_id: "p", eir_id: null, pass1: PASS1, pass2: { sections: courseSections() }, pass3: { questions: courseQuestions() }, format: "course" }))
    expect(small.questions[0]).toHaveProperty("purpose")
  })
})

describe("round 2 — pipeline honours expected_duration_min", () => {
  it("plans a 90-minute course when the studio says 90", async () => {
    dbState.selectQueue.push(
      [{ id: "prep-3", title: "t", episode_goal: BADER_GOAL, guest_identity: null, guest_name: "بدر الطريجي", eir_id: null, expected_duration_min: 90 }],
    )
    aiResponder = (req) => {
      switch (req.input.pass) {
        case "prep_v2.research_synthesis": return PASS1
        case "prep_v2.structure_build": return { modules: MODULE_TITLES.map((t, i) => mod(t, [18, 30, 30, 30, 8][i])) }
        case "prep_v2.question_banks": return { questions: courseQuestions() }
        case "prep_v2.critique": return { questions: courseQuestions(), ...guidance() }
        default: return null
      }
    }
    const r = await runPrepV2Pipeline({ preparationId: "prep-3", force: true, format: "course" })
    expect(r.validation.failures).toEqual([])
    expect(r.payload!.target_minutes).toBe(90)
    expect(r.payload!.total_estimated_minutes).toBe(90)
    expect(aiCalls[1].input.target_minutes).toBe(90)
  })
})

describe("round 2 — prep view", () => {
  it("numbers modules from 1 and counts only rendered questions", () => {
    const p = coursePayload()
    // An orphan in a slot this course does not use — not rendered anywhere.
    p.question_bank = [...p.question_bank, { ...p.question_bank[0], id: "orphan", section: "emotional_peak" }]
    const html = renderToStaticMarkup(createElement(PrepV2View, { payload: p }))
    expect(html).toContain("الوحدة 1:")
    expect(html).not.toContain("الوحدة 0:")
    expect(html).toContain(">32<") // 32 rendered, not 33
    expect(html).not.toContain(">33<")
  })
})

// ═══ Round 3 — an hour word in the goal's CONTENT is not the length ═══

describe("round 3 — duration must be anchored to episode length (noura)", () => {
  it("«أول 24 ساعة» is content → module sum 100 (was 180)", () => {
    expect(
      extractTargetMinutes(
        "ماذا يفعل القائد في أول 24 ساعة؟ 1) التعريف (15 دقيقة) 2) التشخيص (45 دقيقة) 3) أول 100 يوم (40 دقيقة)",
      ),
    ).toBe(100)
  })

  it("«اجتماع ساعة واحدة» is content → module sum (was 60)", () => {
    expect(
      extractTargetMinutes(
        "1) التعريف (20 دقيقة) 2) كيف تدير اجتماع ساعة واحدة بفعالية (45 دقيقة)",
      ),
    ).toBe(65)
  })

  it("«يقرأ ساعتين يومياً» is content → module sum 45 (was 120)", () => {
    expect(
      extractTargetMinutes("الضيف يقرأ ساعتين يومياً. 1) التعريف (15 دقيقة) 2) التشخيص (30 دقيقة)"),
    ).toBe(45)
  })

  it("maps the Arabic decimal separator: «١٫٥ ساعة» → 90 (was 180)", () => {
    expect(extractTargetMinutes("مدة الحلقة ١٫٥ ساعة")).toBe(90)
  })

  it("strict length phrases: label, or approx word adjacent in a paren / first sentence", () => {
    expect(extractTargetMinutes("حلقة ثقيلة وطويلة (قرابة ساعتين) عن القيادة")).toBe(120)
    expect(extractTargetMinutes("مدة الحلقة ساعة ونص")).toBe(90)
    expect(extractTargetMinutes("ساعتين تقريباً لهذه الحلقة")).toBe(120)
    expect(extractTargetMinutes("حوالي 100 دقيقة")).toBe(100)
  })

  it("stray minutes in a topic's description are not a module duration", () => {
    expect(
      extractTargetMinutes(
        "1) الروتين: اجتماع 10 دقائق يومياً (30 دقيقة) 2) التشخيص (40 دقيقة)",
      ),
    ).toBe(70)
  })

  it("a list line may end with its duration", () => {
    expect(extractTargetMinutes("1) التعريف: 20 دقيقة\n2) التشخيص: 40 دقيقة\n3) المستقبل: 30 دقيقة")).toBe(90)
  })

  it("«N دقيقة لكل محور» × the listed topics", () => {
    expect(
      extractTargetMinutes("30 دقيقة لكل محور.\n1) التشخيص\n2) أول 100 يوم\n3) الذكاء الاصطناعي"),
    ).toBe(90)
    // Topic count unknown ⇒ no guess.
    expect(extractTargetMinutes("30 دقيقة لكل محور")).toBeNull()
  })

  it("ساعة وربع / ساعتين إلا ربع / Persian digits", () => {
    expect(extractTargetMinutes("مدة الحلقة ساعة وربع")).toBe(75)
    expect(extractTargetMinutes("حلقة تدريبية (قرابة ساعتين إلا ربع)")).toBe(105)
    expect(extractTargetMinutes("مدة الحلقة ۹۰ دقيقة")).toBe(90)
  })

  it("regressions: Bader goal 120, 15/45/40/30 → 130", () => {
    expect(extractTargetMinutes(BADER_GOAL)).toBe(120)
    expect(
      extractTargetMinutes("1) التعريف (15 دقيقة)\n2) التشخيص (45 دقيقة)\n3) أول 100 يوم (40 دقيقة)\n4) المستقبل (30 دقيقة)"),
    ).toBe(130)
  })
})

// ═══ Round 4 — bare anchors in the content no longer win ══════════════

describe("round 4 — strict length phrases only (noura)", () => {
  it("«في هذه الحلقة نناقش أول 24 ساعة» + modules 15/40/10 → 65 (was 180)", () => {
    expect(
      extractTargetMinutes(
        "في هذه الحلقة نناقش أول 24 ساعة في المنصب. 1) التعريف (15 دقيقة) 2) التشخيص (40 دقيقة) 3) الخلاصة (10 دقيقة)",
      ),
    ).toBe(65)
  })

  it("«الحلقة الأولى استمرت ساعة» is content → null (was 60)", () => {
    expect(extractTargetMinutes("الحلقة الأولى استمرت ساعة")).toBeNull()
  })

  it("«مدة الاجتماع المثالي ساعة واحدة» is content → null (was 60)", () => {
    expect(extractTargetMinutes("مدة الاجتماع المثالي ساعة واحدة")).toBeNull()
  })

  it("«حوالي 90 دقيقة يومياً» is a rate → null (was 90)", () => {
    expect(extractTargetMinutes("حوالي 90 دقيقة يومياً")).toBeNull()
  })

  it("«قدّم حلقة من 60 دقيقة على قناته» is content → null (was 60)", () => {
    expect(extractTargetMinutes("قدّم حلقة من 60 دقيقة على قناته")).toBeNull()
  })

  it("a module parenthesis may continue after its duration", () => {
    expect(
      extractTargetMinutes("1) التعريف (15 دقيقة، مع قصة البداية) 2) التشخيص (40 دقيقة)"),
    ).toBe(55)
  })

  it("an approximate total later in the text (not first sentence, no paren) is ignored", () => {
    expect(extractTargetMinutes("عن القيادة. وقد تحدث حوالي 90 دقيقة في محاضرته")).toBeNull()
  })
})

describe("round 4 — the operator's explicit length", () => {
  it("precedence: choice > expected_duration_min > parser > 120", () => {
    expect(courseTargetMinutes(BADER_GOAL, 90, 150)).toBe(150)
    expect(courseTargetMinutes(BADER_GOAL, 90, null)).toBe(90)
    expect(courseTargetMinutes(BADER_GOAL, null, null)).toBe(120)
    expect(courseTargetMinutes("بدون مدة", null, null)).toBe(120)
  })

  it("only an allowed choice survives the server-side guard", () => {
    expect(coerceCourseTargetChoice(90)).toBe(90)
    expect(coerceCourseTargetChoice("150")).toBe(150)
    expect(coerceCourseTargetChoice(100)).toBeNull()
    expect(coerceCourseTargetChoice(99999)).toBeNull()
    expect(coerceCourseTargetChoice("abc")).toBeNull()
    expect(courseTargetMinutes(BADER_GOAL, null, 100)).toBe(120) // ignored → parser
  })

  it("the pipeline plans the chosen length", async () => {
    dbState.selectQueue.push(
      [{ id: "prep-4", title: "t", episode_goal: BADER_GOAL, guest_identity: null, guest_name: "بدر الطريجي", eir_id: null, expected_duration_min: 90 }],
    )
    aiResponder = (req) => {
      switch (req.input.pass) {
        case "prep_v2.research_synthesis": return PASS1
        case "prep_v2.structure_build": return { modules: MODULE_TITLES.map((t, i) => mod(t, [18, 30, 30, 30, 8][i])) }
        case "prep_v2.question_banks": return { questions: courseQuestions() }
        case "prep_v2.critique": return { questions: courseQuestions(), ...guidance() }
        default: return null
      }
    }
    const r = await runPrepV2Pipeline({ preparationId: "prep-4", force: true, format: "course", targetMinutes: 150 })
    expect(r.validation.failures).toEqual([])
    expect(r.payload!.target_minutes).toBe(150)
    expect(r.payload!.total_estimated_minutes).toBe(150)
  })
})

// ═══ Round 5 — a partially timed list is not the length ════════════════

describe("round 5 — full list sum vs strict total (noura)", () => {
  it("«مدة الحلقة ساعتين.» + 2 of 4 items timed → 120 (was 45)", () => {
    expect(
      extractTargetMinutes(
        "مدة الحلقة ساعتين.\n1) التعريف (15 دقيقة)\n2) التشخيص (30 دقيقة)\n3) أول 100 يوم\n4) المستقبل",
      ),
    ).toBe(120)
  })

  it("«(قرابة ساعتين)» + 2 of 4 items timed → 120 (was 50)", () => {
    expect(
      extractTargetMinutes(
        "حلقة ثقيلة وطويلة (قرابة ساعتين) في القيادة.\n1) التعريف (15–20 دقيقة)\n2) التشخيص (30 دقيقة)\n3) أول 100 يوم\n4) المستقبل",
      ),
    ).toBe(120)
  })

  it("partially timed list with no strict total → null (default 120), not a partial sum", () => {
    expect(
      extractTargetMinutes("1) التعريف (15 دقيقة)\n2) التشخيص (30 دقيقة)\n3) أول 100 يوم\n4) المستقبل"),
    ).toBeNull()
  })

  it("a fully timed list still wins over a stated total", () => {
    expect(
      extractTargetMinutes("مدة الحلقة ساعتين.\n1) أ (15 دقيقة)\n2) ب (45 دقيقة)\n3) ج (40 دقيقة)"),
    ).toBe(100)
  })

  it("strict phrases restored: «حلقة مدتها ١٫٥ ساعة», «مدة الحلقة ساعة ونص», «مدتها ساعة وربع»", () => {
    expect(extractTargetMinutes("حلقة مدتها ١٫٥ ساعة")).toBe(90)
    expect(extractTargetMinutes("مدة الحلقة ساعة ونص")).toBe(90)
    expect(extractTargetMinutes("مدة الحلقة: ساعة ونصف")).toBe(90)
    expect(extractTargetMinutes("مدتها ساعة وربع")).toBe(75)
    expect(extractTargetMinutes("حلقة مدتها ساعة وربع مع قائمة.\n1) أ\n2) ب (20 دقيقة)")).toBe(75)
  })

  it("no list: ≥2 module parentheses still sum (round-4 behaviour)", () => {
    expect(extractTargetMinutes("أ (15–20 دقيقة) ب (30 دقيقة)")).toBe(50)
  })
})

describe("round 5 — «تلقائي» is visible before generating", () => {
  it("previews expected_duration_min, else the parser, else null", () => {
    expect(autoCourseTargetMinutes(BADER_GOAL, 90)).toBe(90)
    expect(autoCourseTargetMinutes(BADER_GOAL, null)).toBe(120)
    expect(autoCourseTargetMinutes("بدون مدة", null)).toBeNull()
  })

  it("labels the auto option with what it resolves to", () => {
    expect(autoOptionLabel(90)).toBe("تلقائي من الهدف (≈ 90 دقيقة)")
    expect(autoOptionLabel(null)).toBe("تلقائي (١٢٠ افتراضي)")
  })

  it("the preview equals what the pipeline plans for «تلقائي»", () => {
    for (const [goal, exp] of [[BADER_GOAL, null], ["بدون مدة", null], ["x", 150]] as const) {
      expect(courseTargetMinutes(goal, exp, null)).toBe(autoCourseTargetMinutes(goal, exp) ?? 120)
    }
  })
})
