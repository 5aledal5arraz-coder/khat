/**
 * AI-Knowledge source.
 *
 * Every other discovery source (youtube, google_web, public_voice, …) finds
 * people by SEARCHING external platforms. When those keys are missing or an
 * API is down (e.g. Google CSE returns 403), the only hits are channel /
 * brand / show names — not individuals (that's why runs surfaced "Audiobook
 * Magazine" and YouTube handles instead of real guests).
 *
 * This source flips the approach: it asks the AI router (a GPT-class model)
 * to NAME real, verifiable public figures from its own knowledge that match
 * the archetype + strict filters, each with a canonical URL. The downstream
 * verifier (also LLM-based, taskKind "verification") then confirms identity
 * and fit. Result: real named people even with zero web-search config.
 *
 * The model output is treated as a SEED, never as final truth — the verifier
 * still gates every candidate against the person-classifier threshold.
 */

import type { DiscoveryArchetype } from "@/lib/db/schema/discovery"
import { runAiTask } from "@/lib/ai-router"
import type {
  SearchResult,
  SearchCandidate,
  DiscoveryFilterContext,
} from "../search-agents"

export const AI_KNOWLEDGE_SOURCE_VERSION = "ai-knowledge-1" as const

interface ProposedPerson {
  name?: string | null
  name_en?: string | null
  role?: string | null
  country?: string | null
  url?: string | null
  why?: string | null
}

export async function runAiKnowledgeSource(input: {
  archetype: DiscoveryArchetype
  maxResults: number
  filters?: DiscoveryFilterContext
}): Promise<SearchResult> {
  const { archetype, maxResults, filters } = input
  const count = Math.max(1, Math.min(maxResults, 8))

  const genderLine =
    filters?.gender === "male"
      ? "يجب أن يكونوا رجالاً فقط."
      : filters?.gender === "female"
        ? "يجب أن يكنّ نساءً فقط."
        : "أيّ جنس."
  const natLine =
    filters?.nationality === "kuwaiti"
      ? "يجب أن يكونوا كويتيين."
      : filters?.nationality === "non_kuwaiti"
        ? "يجب أن يكونوا من خارج الكويت (يفضّل شخصيات عربية)."
        : "يفضّل شخصيات عربية معروفة."

  const system = [
    "أنت باحث ترشيحات ضيوف لبودكاست عربي اسمه «خط».",
    "مهمتك: اقترح أشخاصاً حقيقيين معروفين — أفراداً من البشر — يطابقون النمط البشري والفلاتر.",
    "قواعد صارمة:",
    "- أسماء حقيقية لأشخاص فعليين معروفين فقط. لا تختلق أيّ اسم. إن لم تكن متأكداً أنّ الشخص حقيقي وموجود، فاحذفه.",
    "- ممنوع اقتراح أسماء قنوات يوتيوب أو حسابات أو برامج أو صفحات أو مؤسسات أو علامات تجارية — أفراد فقط.",
    `- ${genderLine}`,
    `- ${natLine}`,
    "- لكلّ شخص: الاسم الكامل بالعربية، والاسم بالإنجليزية إن وُجد، وتخصّصه/دوره، وبلده، ورابطاً عاماً موثوقاً واحداً (ويكيبيديا، أو موقع رسمي، أو حساب موثّق، أو مقال في صحيفة كبرى)، وسبباً قصيراً لملاءمته للحلقة.",
    "- جودة أعلى من الكمّية: من الأفضل 3 أسماء حقيقية مؤكّدة على 8 أسماء مشكوك فيها.",
    'أعد JSON فقط بهذا الشكل بالضبط: {"people":[{"name":"","name_en":"","role":"","country":"","url":"","why":""}]}',
  ].join("\n")

  const user = JSON.stringify({
    archetype: { name: archetype.name, detail: archetype },
    topic: filters?.episodeWorkingTitle ?? null,
    topic_domain: filters?.episodeTopicDomain ?? null,
    count,
  })

  const result = await runAiTask<{ people?: ProposedPerson[] }>({
    taskKind: "discovery",
    subjectTable: "discovery_runs",
    subjectId: null,
    promptVersion: AI_KNOWLEDGE_SOURCE_VERSION,
    input: { source: "ai_knowledge", count, archetype: archetype.name },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.4 },
  })

  if (result.status !== "succeeded") {
    return {
      source: "ai_knowledge",
      configured: true,
      note: result.errorMessage ?? "ai_knowledge: generation failed",
      candidates: [],
    }
  }

  const people = (result.parsed?.people ?? []).filter(
    (p): p is ProposedPerson =>
      Boolean(p && typeof p.name === "string" && p.name.trim()),
  )

  const candidates: SearchCandidate[] = people.map((p) => {
    const name = (p.name ?? "").trim()
    const url = (p.url ?? "").trim()
    return {
      proposed_name: name,
      proposed_role: p.role?.trim() || null,
      proposed_country:
        p.country?.trim() ||
        (filters?.nationality === "kuwaiti" ? "Kuwait" : null),
      evidence_urls: url
        ? [
            {
              platform: "ai_knowledge",
              url,
              title: p.name_en?.trim() || name,
              snippet: p.why?.trim() || null,
              fetched_at: new Date().toISOString(),
            },
          ]
        : [],
      platform_signals: {
        ai_knowledge: {
          model_proposed: true,
          name_en: p.name_en?.trim() || null,
          why: p.why?.trim() || null,
          version: AI_KNOWLEDGE_SOURCE_VERSION,
        },
      },
    }
  })

  return { source: "ai_knowledge", configured: true, candidates }
}
