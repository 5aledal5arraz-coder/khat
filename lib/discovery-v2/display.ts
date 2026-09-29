/**
 * Guest Discovery v2 — what the run page may SAY about a stored candidate.
 *
 * Pure and client-safe (no I/O), so the card and its tests share one rule.
 * Rows written before 2026-09-28 carry numbers and Wikidata facts the
 * scorer no longer trusts; these helpers make the page honest about both
 * without rewriting stored data.
 */

import { formatArabicCount } from "@/lib/shared/formatters"
import type { StoryAssessment, TopicRelevanceValue, V2Flag, V2ScoreKey } from "./types"

interface StoredCard {
  scores?: { unmeasured?: V2ScoreKey[] } | null
  story?: Pick<StoryAssessment, "status"> | null
  flags?: V2Flag[] | null
}

/**
 * Which score rows have no evidence behind them («غير مقيّم»). New rows
 * carry the list; an older row still gets the one inference that is
 * certain — a story that was never checked has no story score.
 */
export function unmeasuredScores(c: StoredCard): Set<V2ScoreKey> {
  const out = new Set<V2ScoreKey>(c.scores?.unmeasured ?? [])
  if (c.story?.status === "not_checked") out.add("story")
  return out
}

/**
 * True when the stored Wikidata facts belong to a CONFIDENT match. New rows
 * store no facts from an untrusted match at all; older rows did, and their
 * flags say so — a birth year or photo from a possible namesake is hidden.
 */
export function wikiFactsTrusted(c: StoredCard): boolean {
  const flags = c.flags ?? []
  return !flags.includes("identity_uncertain") && !flags.includes("identity_unverified")
}

/**
 * «He told it himself» was PROVEN from the page (source-page.ts): value true
 * WITH a basis. Runs before 2026-09-29 stored the model's own true without
 * one — never verified.
 */
export function isSelfToldVerified(a: Pick<StoryAssessment, "self_told"> | null | undefined): boolean {
  return a?.self_told?.value === true && !!a.self_told.basis
}

const RELEVANCE_LABEL: Record<TopicRelevanceValue, string> = {
  on_topic: "في صلب الموضوع",
  adjacent: "قريب من الموضوع",
  off_topic: "خارج الموضوع",
}

/**
 * What the card prints next to القصة / الملاءمة / يُبحث عنه instead of a
 * percentage (D4, 2026-09-29). Those three are ORDINAL buckets by design —
 * S ∈ {0, 0.5, 0.8, 1}×relevance, F ∈ {0, 0.5, 1}, Q ∈ {0, 0.5, 1} — and
 * «80 / 100 / 50» on three different people read as a precise measurement
 * that happened to tie. The label says the evidence the bucket stands for,
 * so two people with different evidence read differently. `null` = no label
 * (the row keeps its «غير مقيّم» / bar behaviour).
 */
export function scoreEvidenceLabels(c: {
  story?: Pick<StoryAssessment, "status" | "story_type" | "evidence" | "self_told" | "topic_relevance"> | null
  scores?: { searchability?: number | null } | null
}): { story: string | null; topic_fit: string | null; searchability: string | null } {
  const a = c.story
  let story: string | null = null
  if (a?.status === "verified" && a.evidence?.length) {
    // «رواها بنفسه» only when the page itself showed it (self_told true WITH
    // a basis — source-page.ts). Runs before 2026-09-29 stored the model's
    // own true (no basis): that was never verified, and says so.
    const kind =
      a.story_type === "first_hand"
        ? isSelfToldVerified(a)
          ? "رواها بنفسه"
          : a.self_told?.value === false
            ? "كتبه غيره عنه"
            : "لم يُتحقق أنه رواها بنفسه"
        : a.story_type === "second_hand"
          ? "يرويها أهله"
          : "موثّقة"
    const sites = new Set(a.evidence.map((e) => e.domain ?? e.url)).size
    // A quote counts as one only when it was found on the page itself; the
    // rest matched the search engine's summary of the page.
    const onPage = a.evidence.filter((e) => e.on_page === true).length
    story = `${kind} · ${formatArabicCount(sites, "موقع")} · ${onPage > 0 ? formatArabicCount(onPage, "اقتباس") : "ملخص بلا اقتباس من الصفحة"}`
  } else if (a?.status === "unverified") {
    story = "لم تُثبت بمصدر"
  }
  const rel = a?.topic_relevance?.value
  const topic_fit = rel ? RELEVANCE_LABEL[rel] : null
  const q = c.scores?.searchability
  const searchability =
    q == null || !a || a.status === "not_checked"
      ? null
      : q >= 1
        ? "موقعان أو أكثر"
        : q > 0
          ? formatArabicCount(1, "موقع")
          : "لا موقع يذكره"
  return { story, topic_fit, searchability }
}
