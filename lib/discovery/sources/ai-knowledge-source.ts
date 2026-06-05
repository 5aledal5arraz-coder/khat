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
 * the archetype + strict filters, each with REAL authoritative links and a
 * short bio (with birth year). The Alpha person-classifier then scores each
 * candidate from that evidence exactly as it scores search-agent evidence:
 *
 *   - bio_page         fires on a real Wikipedia / official "/about" URL.
 *   - name_agreement   fires when the full name appears across ≥2 distinct
 *                      hosts (a genuine property of notable public figures).
 *   - birth_or_age     fires on "من مواليد <year>".
 *
 * Net effect: genuinely NOTABLE people (who actually have ≥2 authoritative
 * public sources) clear the 0.35 threshold; obscure or fabricated names can't
 * muster two real distinct sources and stay rejected. So the multi-link
 * requirement doubles as a notability filter. The model is instructed to use
 * ONLY links it is confident genuinely exist — never to invent URLs.
 */

import type { DiscoveryArchetype } from "@/lib/db/schema/discovery"
import { runAiTask } from "@/lib/ai-router"
import type {
  SearchResult,
  SearchCandidate,
  DiscoveryFilterContext,
} from "../search-agents"

export const AI_KNOWLEDGE_SOURCE_VERSION = "ai-knowledge-2" as const

interface ProposedPerson {
  name?: string | null
  name_en?: string | null
  role?: string | null
  country?: string | null
  birth_year?: string | number | null
  bio?: string | null
  /** Up to 3 REAL authoritative public URLs across different sites. */
  links?: string[] | null
  why?: string | null
}

/** Derive a stable per-host "platform" label so distinct authoritative
 *  sources count as distinct platforms for the name-agreement signal. */
function hostLabel(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    if (h.includes("wikipedia.org")) return "wikipedia"
    if (h.includes("linkedin.com")) return "linkedin"
    return h
  } catch {
    return "web"
  }
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
    "- أسماء حقيقية لأشخاص فعليين معروفين فقط. لا تختلق أيّ اسم. إن لم تكن متأكّداً أنّ الشخص حقيقي وموجود، احذفه.",
    "- ممنوع اقتراح أسماء قنوات يوتيوب أو حسابات أو برامج أو صفحات أو مؤسسات أو علامات تجارية — أفراد فقط.",
    `- ${genderLine}`,
    `- ${natLine}`,
    "- لكلّ شخص قدّم: الاسم الكامل بالعربية، والاسم بالإنجليزية إن وُجد، وتخصّصه/دوره، وبلده، وسنة الميلاد إن كانت معروفة، وسيرة قصيرة بجملة واحدة.",
    "- والأهمّ: قائمة «links» تحتوي حتى 3 روابط عامة موثوقة حقيقية موجودة فعلاً من مصادر مختلفة (يفضّل ويكيبيديا العربية أو الإنجليزية، ثمّ الموقع الرسمي، أو موسوعة، أو مقال في صحيفة كبرى، أو حساب موثّق رسمي).",
    "- لا تختلق روابط أبداً. ضع فقط روابط تتأكّد أنّها موجودة فعلاً لهذا الشخص بالذات. إن لم تجد رابطين موثوقين حقيقيين على الأقل، فهذا مؤشّر أنّ الشخص غير بارز كفاية — استبعده.",
    "- جودة أعلى من الكمّية: 3 أسماء بارزة موثّقة أفضل من 8 مشكوك فيها.",
    'أعد JSON فقط بهذا الشكل بالضبط: {"people":[{"name":"","name_en":"","role":"","country":"","birth_year":"","bio":"","links":["",""],"why":""}]}',
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
    const nameEn = p.name_en?.trim() || null
    const role = p.role?.trim() || null
    const bio = p.bio?.trim() || null
    const birth = p.birth_year != null ? String(p.birth_year).trim() : ""
    // Title carries the name so name_agreement can match across hosts.
    const title = nameEn ? `${name} — ${nameEn}` : name
    // Snippet carries the bio + a birth-year phrase the classifier detects.
    const snippet = [bio, birth ? `من مواليد ${birth}` : null, role]
      .filter(Boolean)
      .join(" · ")

    const links = (p.links ?? [])
      .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
      .slice(0, 3)

    const evidence_urls = links.map((url) => ({
      platform: hostLabel(url),
      url,
      title,
      snippet: snippet || null,
      fetched_at: new Date().toISOString(),
    }))

    return {
      proposed_name: name,
      proposed_role: role,
      proposed_country:
        p.country?.trim() ||
        (filters?.nationality === "kuwaiti" ? "Kuwait" : null),
      evidence_urls,
      platform_signals: {
        ai_knowledge: {
          model_proposed: true,
          name_en: nameEn,
          birth_year: birth || null,
          why: p.why?.trim() || null,
          link_count: links.length,
          version: AI_KNOWLEDGE_SOURCE_VERSION,
        },
      },
    }
  })

  return { source: "ai_knowledge", configured: true, candidates }
}
