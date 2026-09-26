/**
 * «نسخة الضيف» — the suggestion pending cap, and the guest_preferences input
 * to prep generation (present ⇒ the prompt carries it; absent ⇒ unchanged,
 * which the story SHA test in prep-v2-course-format.test.ts pins byte-for-byte).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { mockDb, mockInsertReturning, mockSelectResult, resetMock } from "../db-mock"

vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

type AiReq = { input: Record<string, unknown>; prompt: { role: string; content: string }[] }
const aiCalls: AiReq[] = []
vi.mock("@/lib/ai-router", () => ({
  runAiTask: vi.fn(async (req: AiReq) => {
    aiCalls.push(req)
    return { status: "failed", runId: "r", parsed: null }
  }),
}))

import { createGuestSuggestion, type GuestLinkRow } from "@/lib/guest-link/service"
import { GUEST_SUGGESTION_LIMITS } from "@/lib/validation/guest-link"
import { runResearchSynthesis } from "@/lib/preparation/v2/research"
import { runCritiquePass } from "@/lib/preparation/v2/critique"
import {
  guestPreferencesFromQuestionnaire,
  withGuestAvoidZone,
} from "@/lib/preparation/v2/guest-preferences"

const row = {
  id: "link-1",
  eir_id: "eir-1",
  published_view: { v: 1, schedule_at: null, location: null, axes: [] },
  published_ref_map: { axes: { a1: { section: "opening", label: "البداية والتعارف" } }, samples: {} },
} as unknown as GuestLinkRow

beforeEach(() => {
  resetMock()
  aiCalls.length = 0
})

describe("createGuestSuggestion", () => {
  const input = { target_kind: "axis", target_ref: "a1", suggestion_type: "edit", body: "x" } as const

  it(`refuses at ${GUEST_SUGGESTION_LIMITS.MAX_PENDING_PER_LINK} pending (count arrives as a STRING)`, async () => {
    mockSelectResult([{ n: String(GUEST_SUGGESTION_LIMITS.MAX_PENDING_PER_LINK) }])
    expect(await createGuestSuggestion(row, input)).toEqual({ ok: false, reason: "too_many" })
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("inserts below the cap", async () => {
    mockSelectResult([{ n: "3" }])
    mockInsertReturning([{ id: "sug-9" }])
    expect(await createGuestSuggestion(row, input)).toEqual({ ok: true, id: "sug-9" })
  })

  it("unpublished link or unknown target is refused before any write", async () => {
    expect(
      await createGuestSuggestion({ ...row, published_view: null } as GuestLinkRow, input),
    ).toEqual({ ok: false, reason: "not_published" })
    expect(await createGuestSuggestion(row, { ...input, target_ref: "a7" })).toEqual({
      ok: false,
      reason: "bad_target",
    })
  })
})

describe("guest_preferences → prep prompts (gated)", () => {
  const prefs = guestPreferencesFromQuestionnaire({
    topics_excited_about: "بناء الفرق",
    sensitivities_to_avoid: "خلاف قديم مع شريك",
    kunya: "بو فهد",
  })!

  const pass1Base = {
    episode_title: "T",
    episode_goal: "G",
    topic_domain: "d",
    episode_type: "x",
    language: "ar" as const,
    editorial_intent: {},
    hybrid_provenance: null,
    guest_identity: null,
    eir_id: "e",
    preparation_id: "p",
  }

  it("Pass 1: present ⇒ the answers are in the prompt and flagged in input", async () => {
    await runResearchSynthesis({ ...pass1Base, guest_preferences: prefs })
    const user = aiCalls[0].prompt.find((m) => m.role === "user")!.content
    expect(user).toContain("Excited to talk about: بناء الفرق")
    expect(user).toContain("Asked us to avoid: خلاف قديم مع شريك")
    expect(user).toContain("بو فهد")
    expect(aiCalls[0].input.guest_preferences).toBe(true)
  })

  it("Pass 1: null or empty preferences ⇒ identical request to none at all", async () => {
    await runResearchSynthesis(pass1Base)
    await runResearchSynthesis({ ...pass1Base, guest_preferences: null })
    await runResearchSynthesis({
      ...pass1Base,
      guest_preferences: { excited_about: null, avoid: null, kunya: null },
    })
    const [a, b, c] = aiCalls.map((x) => JSON.stringify(x))
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it("Pass 4: kunya reaches host guidance instructions; absent ⇒ identical", async () => {
    const base = {
      language: "ar" as const,
      preparation_id: "p",
      eir_id: "e",
      pass1: { thesis: "t", axes_of_tension: ["a"], guest_extraction_strategy: "g", sensitive_zones: [] },
      pass2: { sections: [] },
      pass3: { questions: [] },
    }
    await runCritiquePass(base)
    await runCritiquePass({ ...base, guest_preferences: null })
    await runCritiquePass({ ...base, guest_preferences: prefs })
    expect(JSON.stringify(aiCalls[1])).toBe(JSON.stringify(aiCalls[0]))
    const user = aiCalls[2].prompt.find((m) => m.role === "user")!.content
    expect(user).toContain("Kunya: بو فهد")
  })

  it("the avoid answer becomes a sensitive zone deterministically (and only once)", () => {
    const z = withGuestAvoidZone(["موجود"], prefs)
    expect(z).toEqual(["موجود", "طلب الضيف تجنّب: خلاف قديم مع شريك"])
    expect(withGuestAvoidZone(z, prefs)).toEqual(z)
    expect(withGuestAvoidZone(["موجود"], null)).toEqual(["موجود"])
  })

  it("current questionnaire (no excited/avoid) ⇒ kunya only; no topic or avoid lines", async () => {
    const current = guestPreferencesFromQuestionnaire({
      honorific: "خبير إداري",
      kunya: "بو محمد",
      phone_whatsapp: "+96599990000",
      preferred_drink: "قهوة",
    })
    expect(current).toEqual({ excited_about: null, avoid: null, kunya: "بو محمد" })
    await runResearchSynthesis({ ...pass1Base, guest_preferences: current })
    const user = aiCalls[0].prompt.find((m) => m.role === "user")!.content
    expect(user).toContain("بو محمد")
    expect(user).not.toContain("Excited to talk about")
    expect(user).not.toContain("Asked us to avoid")
    expect(withGuestAvoidZone(["موجود"], current)).toEqual(["موجود"])
    // Neither the title nor anything else the guest typed becomes a preference.
    expect(user).not.toContain("خبير إداري")
  })

  it("empty questionnaire ⇒ no preferences", () => {
    expect(guestPreferencesFromQuestionnaire({ topics_excited_about: " " })).toBeNull()
    expect(guestPreferencesFromQuestionnaire(null)).toBeNull()
  })
})
