/**
 * ص-٨ — the merge is the safety property of the conversation generator.
 *
 * `setEpisodeEnrichment` merges per COLUMN, so handing it a partial jsonb
 * object silently drops the sub-keys it doesn't mention. Every test below
 * exists because that failure mode is invisible: the write succeeds, the
 * page just quietly loses a card Khaled typed.
 */

import { describe, it, expect } from "vitest"
import {
  mergeConversationFields,
  conversationFieldIsEmpty,
} from "@/lib/ai/episode-conversation"
import type { EpisodeEnrichment } from "@/types/episodes"

describe("conversationFieldIsEmpty", () => {
  it("treats a missing enrichment as empty for every field", () => {
    expect(conversationFieldIsEmpty("why_this_conversation", null)).toBe(true)
    expect(conversationFieldIsEmpty("before_you_watch", null)).toBe(true)
    expect(conversationFieldIsEmpty("conversation_map", null)).toBe(true)
    expect(conversationFieldIsEmpty("unsaid_reflections", null)).toBe(true)
  })

  it("treats whitespace-only text as empty", () => {
    expect(
      conversationFieldIsEmpty("central_question", { central_question: "   " }),
    ).toBe(true)
    expect(
      conversationFieldIsEmpty("central_question", { central_question: "ما الثمن؟" }),
    ).toBe(false)
  })

  it("calls before_you_watch empty when ANY of the three cards is blank", () => {
    const partial: Partial<EpisodeEnrichment> = {
      before_you_watch: { who_is_it_for: "من يبدأ مشروعه" },
    }
    expect(conversationFieldIsEmpty("before_you_watch", partial)).toBe(true)

    const full: Partial<EpisodeEnrichment> = {
      before_you_watch: {
        who_is_it_for: "أ",
        who_is_it_not_for: "ب",
        what_you_gain: "ج",
      },
    }
    expect(conversationFieldIsEmpty("before_you_watch", full)).toBe(false)
  })

  it("calls conversation_map empty when a node is missing its description", () => {
    const half: Partial<EpisodeEnrichment> = {
      conversation_map: {
        beginning: { title: "البداية", description: "" },
        middle: { title: "م", description: "د" },
        conclusion: { title: "خ", description: "د" },
      },
    }
    expect(conversationFieldIsEmpty("conversation_map", half)).toBe(true)
  })
})

describe("mergeConversationFields — never overwrites a human", () => {
  it("keeps hand-written text and does not report it as filled", () => {
    const existing: Partial<EpisodeEnrichment> = {
      why_this_conversation: "نص كتبه خالد بيده",
    }
    const { patch, filled } = mergeConversationFields(existing, {
      why_this_conversation: "نص من النموذج",
      central_question: "سؤال من النموذج؟",
    })

    expect(patch.why_this_conversation).toBeUndefined()
    expect(patch.central_question).toBe("سؤال من النموذج؟")
    expect(filled).toEqual(["central_question"])
  })

  it("fills only the blank cards of before_you_watch and preserves the rest", () => {
    const existing: Partial<EpisodeEnrichment> = {
      before_you_watch: { who_is_it_for: "كتابة خالد" },
    }
    const { patch, filled } = mergeConversationFields(existing, {
      before_you_watch: {
        who_is_it_for: "توليد يجب تجاهله",
        who_is_it_not_for: "ليست لك إذا كنت تبحث عن خطوات جاهزة",
        what_you_gain: "مكسب",
      },
    })

    // The whole object is rewritten by the DB layer, so the patch MUST
    // carry the human value forward or it is lost.
    expect(patch.before_you_watch).toEqual({
      who_is_it_for: "كتابة خالد",
      who_is_it_not_for: "ليست لك إذا كنت تبحث عن خطوات جاهزة",
      what_you_gain: "مكسب",
    })
    expect(filled).toContain("before_you_watch")
  })

  it("accepts a null who_is_it_not_for rather than inventing aversion", () => {
    const { patch } = mergeConversationFields(null, {
      before_you_watch: {
        who_is_it_for: "أ",
        who_is_it_not_for: null,
        what_you_gain: "ج",
      },
    })
    expect(patch.before_you_watch).toEqual({ who_is_it_for: "أ", what_you_gain: "ج" })
    expect(patch.before_you_watch?.who_is_it_not_for).toBeUndefined()
  })

  it("preserves a complete map node and fills only the incomplete one", () => {
    const existing: Partial<EpisodeEnrichment> = {
      conversation_map: {
        beginning: { title: "بداية خالد", description: "وصف خالد" },
      },
    }
    const { patch, filled } = mergeConversationFields(existing, {
      conversation_map: {
        beginning: { title: "تجاهلني", description: "تجاهلني" },
        middle: { title: "المنتصف", description: "وصف" },
        conclusion: { title: "الخاتمة", description: "وصف" },
      },
    })

    expect(patch.conversation_map?.beginning).toEqual({
      title: "بداية خالد",
      description: "وصف خالد",
    })
    expect(patch.conversation_map?.middle).toEqual({
      title: "المنتصف",
      description: "وصف",
    })
    expect(filled).toContain("conversation_map")
  })

  it("drops a half-generated node instead of rendering an empty paragraph", () => {
    const { patch } = mergeConversationFields(null, {
      conversation_map: {
        beginning: { title: "عنوان بلا وصف", description: null },
        middle: { title: "المنتصف", description: "وصف" },
      },
    })
    expect(patch.conversation_map?.beginning).toBeUndefined()
    expect(patch.conversation_map?.middle).toBeDefined()
  })

  it("does not touch unsaid_reflections when the human list is non-empty", () => {
    const existing: Partial<EpisodeEnrichment> = {
      unsaid_reflections: ["فكرة خالد"],
    }
    const { patch, filled } = mergeConversationFields(existing, {
      unsaid_reflections: ["توليد", "توليد ٢"],
    })
    expect(patch.unsaid_reflections).toBeUndefined()
    expect(filled).not.toContain("unsaid_reflections")
  })

  it("returns an empty patch when the model gives nothing usable", () => {
    const { patch, filled } = mergeConversationFields(null, {
      why_this_conversation: "   ",
      central_question: null,
      before_you_watch: null,
      conversation_map: null,
      unsaid_reflections: [],
    })
    expect(patch).toEqual({})
    expect(filled).toEqual([])
  })

  it("writes nothing at all when every field is already human-written", () => {
    const existing: Partial<EpisodeEnrichment> = {
      why_this_conversation: "أ",
      central_question: "ب؟",
      before_you_watch: {
        who_is_it_for: "ج",
        who_is_it_not_for: "د",
        what_you_gain: "هـ",
      },
      conversation_map: {
        beginning: { title: "١", description: "٢" },
        middle: { title: "٣", description: "٤" },
        conclusion: { title: "٥", description: "٦" },
      },
      unsaid_reflections: ["و"],
    }
    const { patch, filled } = mergeConversationFields(existing, {
      why_this_conversation: "x",
      central_question: "y?",
      before_you_watch: { who_is_it_for: "x", who_is_it_not_for: "y", what_you_gain: "z" },
      conversation_map: {
        beginning: { title: "x", description: "y" },
        middle: { title: "x", description: "y" },
        conclusion: { title: "x", description: "y" },
      },
      unsaid_reflections: ["x"],
    })
    expect(patch).toEqual({})
    expect(filled).toEqual([])
  })
})
