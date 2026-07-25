/**
 * Wave 2 — live grounded web market-signal adapter.
 *
 * Gathers general LIVE web signals (trends / news around the podcast's
 * topics) via the SHARED grounded-evidence service (Gemini + Google
 * Search), and normalises them into the SAME `MarketRawSignal` shape the
 * podcast/youtube adapters emit — so the existing OpenAI extraction pass
 * classifies them with zero pipeline changes.
 *
 * Why this adapter exists: podcast + youtube only see what already got
 * published on those two platforms. This one widens the aperture to the
 * open web (articles, news, discourse) around a topic query, so the
 * market view isn't blind to a trend until it lands on YouTube.
 *
 * Grounding stays OUTSIDE the AI router by design — retrieval returns
 * grounding metadata, not the router's text/JSON contract. We reuse
 * `gatherGroundedEvidence` rather than re-implement grounding, so this
 * adapter inherits its guarantees automatically:
 *   • ai_runs cost logging (token cost + per-query grounding fee),
 *   • the daily retrieval budget cap (`assertRetrievalBudget`),
 *   • redirect-resolution + dead-link marking,
 *   • provenance (provider + model).
 *
 * Prompt-injection: the web-derived title/snippet is stored in clean
 * columns (they are DISPLAYED in clustering hooks + the operator review
 * UI, so they must not carry markup). The only model that consumes them
 * afterwards is `extraction.ts`, whose output is server-side clamped to a
 * closed theme/emotion vocabulary + a [0,1] score — an injected imperative
 * cannot escape that classification. The raw source (incl. an `untrusted`
 * marker + provenance) is persisted in the `raw` jsonb for audit. If a
 * future caller feeds these snippets into a FREE-FORM prompt, it MUST wrap
 * them with `renderGroundedEvidenceBlock()` from the shared service.
 *
 * Fail-safe by contract (mirrors the youtube adapter): returns
 * `configured: false` when Gemini isn't set, and never throws — a transient
 * grounding/budget error becomes a `note`, so a market.collect run never
 * fails because of this optional source.
 */

import {
  gatherGroundedEvidence,
  isGroundedEvidenceConfigured,
  isVertexRedirect,
} from "@/lib/ai/grounded-evidence"
import { stripInlineMarkdown } from "@/lib/shared/formatters"
import type { MarketCollectionResult, MarketRawSignal } from "./types"

/** Strip query/hash so the same article dedups across runs (ON CONFLICT). */
function stableExternalId(url: string): string {
  return url.split(/[?#]/)[0]
}

export async function collectWebGroundedTopic(
  query: string,
  language: string,
  maxResults = 10,
): Promise<MarketCollectionResult> {
  if (!isGroundedEvidenceConfigured()) {
    return {
      source: "web_grounded",
      configured: false,
      note: "GEMINI_API_KEY not set",
      signals: [],
    }
  }

  // Topic-framed query — this asks about the SUBJECT/trend, never a person.
  // Kept broad so Gemini surfaces current discourse, not a single fact.
  const searchQuery =
    `ما أبرز النقاشات والاتجاهات والأخبار الحديثة حول "${query}"؟ ` +
    `ابحث عن مقالات وتحليلات وتغطيات إعلامية حديثة تعكس اهتمام الجمهور بهذا الموضوع، ` +
    `واذكر لكل مصدر جوهر ما يطرحه.`

  let evidence
  try {
    evidence = await gatherGroundedEvidence(searchQuery, {
      maxResults,
      subjectTable: "market_topic_signals",
      subjectId: null,
      actorId: null,
    })
  } catch (err) {
    // Budget spent / transient / misconfig — degrade to no signals, never
    // throw. The collection run continues with the other sources.
    return {
      source: "web_grounded",
      configured: true,
      note: err instanceof Error ? err.message.split("\n")[0] : "grounding failed",
      signals: [],
    }
  }

  const signals: MarketRawSignal[] = []
  for (const s of evidence.sources) {
    // Skip rows we can't dedup stably: a still-wrapped vertex redirect
    // carries a rotating token (a new row every run), and a null domain
    // means the URL didn't parse. Also require some substance (a snippet or
    // a publisher) so we never store a bare URL as a "signal".
    if (!s.domain || isVertexRedirect(s.url)) continue
    if (!s.snippet && !s.publisher) continue

    // s.title is the grounded snippet-prefix (topic text) — the most useful
    // headline; fall back to publisher/domain only when there's no snippet.
    // These land in DISPLAY columns (clustering hooks + operator review), so
    // strip the markdown Gemini snippets carry before storing — the file
    // invariant (see header) is that title/description hold no markup.
    const title = stripInlineMarkdown(s.title || s.publisher || s.domain).slice(0, 500)
    if (!title) continue

    // s.title is literally the snippet's first 120 chars, so short snippets
    // make description an exact echo of the title — drop it in that case.
    const cleanSnippet = stripInlineMarkdown(s.snippet)
    const description = cleanSnippet && cleanSnippet !== title ? cleanSnippet : null

    signals.push({
      source: "web_grounded",
      external_id: stableExternalId(s.url),
      title,
      description,
      language,
      // Web sources expose no comparable play/view count.
      view_signal: null,
      raw: {
        untrusted: true,
        url: s.url,
        domain: s.domain,
        publisher: s.publisher ?? null,
        snippet: s.snippet,
        verified: s.verified,
        provenance: evidence.provenance,
        query,
      },
    })
  }

  return { source: "web_grounded", configured: true, signals }
}
