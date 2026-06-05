/**
 * Channel analysis orchestrator.
 *
 * One entry point: `runChannelAnalysis()`. It:
 *   1. Collects DB signals (real episodes, enrichments, guests, categories).
 *   2. Runs the Gemini structured pass with the constitution as primary truth.
 *   3. Persists a new `khat_map_channel_fingerprint` version (demotes prior).
 *   4. Stores both the polished product + the raw Gemini output + the
 *      deterministic corpus for future audit.
 *
 * Callers (server actions) get a single `ChannelAnalysisResult` back that
 * carries everything the UI needs for success OR failure — no throws across
 * the boundary.
 */

import type { KhatMapChannelFingerprint } from "@/types/khat-map"
import { createFingerprintVersion } from "@/lib/khat-map/core/queries"
import { collectChannelSignals, buildChannelCorpus, type ChannelSignals } from "./collector"
import {
  analyzeFingerprintWithGemini,
  FingerprintAnalysisError,
  CHANNEL_ANALYSIS_MODEL,
  type FingerprintAnalysisOutput,
} from "./gemini-analyze"

export type { ChannelSignals, FingerprintAnalysisOutput }
export { FingerprintAnalysisError }

export interface ChannelAnalysisSuccess {
  ok: true
  fingerprint: KhatMapChannelFingerprint
  analyzed_at: string
  corpus_size_chars: number
  signals_summary: {
    episodes_analyzed: number
    coverage_notes: string[]
  }
}

export interface ChannelAnalysisFailure {
  ok: false
  reason: FingerprintAnalysisError["reason"] | "unknown"
  message: string
  detail?: string
  diagnostics?: FingerprintAnalysisError["diagnostics"]
}

export type ChannelAnalysisResult = ChannelAnalysisSuccess | ChannelAnalysisFailure

export interface RunChannelAnalysisOptions {
  /** Admin user id that initiated this run — stored on the fingerprint row. */
  generatedBy: string | null
}

/**
 * Full end-to-end analysis. Never throws — always returns a result.
 */
export async function runChannelAnalysis(
  opts: RunChannelAnalysisOptions,
): Promise<ChannelAnalysisResult> {
  let signals: ChannelSignals
  try {
    signals = await collectChannelSignals()
  } catch (err) {
    return {
      ok: false,
      reason: "unknown",
      message: "فشل جمع بيانات القناة من قاعدة البيانات",
      detail: err instanceof Error ? err.message : String(err),
    }
  }

  if (signals.coverage.non_hidden_episodes === 0) {
    return {
      ok: false,
      reason: "empty_corpus",
      message: "لا توجد حلقات ظاهرة في الأرشيف لتحليلها",
    }
  }

  let output: FingerprintAnalysisOutput
  try {
    output = await analyzeFingerprintWithGemini(signals)
  } catch (err) {
    if (err instanceof FingerprintAnalysisError) {
      const userMessage =
        err.reason === "no_api_key"
          ? "مفتاح GEMINI_API_KEY غير مهيّأ. لا يمكن تحليل القناة."
          : err.reason === "empty_corpus"
            ? "لا توجد حلقات كافية للتحليل"
            : err.message || "فشل تحليل القناة عبر Gemini"
      return {
        ok: false,
        reason: err.reason,
        message: userMessage,
        detail: err.detail,
        diagnostics: err.diagnostics,
      }
    }
    return {
      ok: false,
      reason: "unknown",
      message: "خطأ غير متوقع أثناء تحليل القناة",
      detail: err instanceof Error ? err.message : String(err),
    }
  }

  // Persist — createFingerprintVersion demotes the previous current row.
  const corpus = buildChannelCorpus(signals)
  let fingerprint: KhatMapChannelFingerprint
  try {
    fingerprint = await createFingerprintVersion({
      identity_summary: output.identity_summary,
      khat_dna: output.dna,
      strongest_emotional_topics: output.strongest_emotional_topics,
      most_successful_episodes: output.most_successful_episodes,
      most_successful_guests: output.most_successful_guests,
      analysis_notes: output.analysis_notes,
      raw_gemini_payload: {
        corpus,
        signals: {
          coverage: signals.coverage,
          title_keywords: signals.title_keywords,
          length_buckets: signals.length_buckets,
          by_category: signals.by_category,
          repeat_guests: signals.repeat_guests,
          // Episodes are large — store ids only to keep the payload compact;
          // the full rows are always re-derivable from the DB.
          top_viewed_ids: signals.top_viewed.map((e) => e.id),
          most_recent_ids: signals.most_recent.map((e) => e.id),
          representative_sample_ids: signals.representative_sample.map((e) => e.id),
        },
        gemini_output: output,
      },
      model_name: CHANNEL_ANALYSIS_MODEL,
      generated_by: opts.generatedBy,
    })
  } catch (err) {
    return {
      ok: false,
      reason: "unknown",
      message: "تم تحليل القناة لكن فشل حفظ النتيجة في قاعدة البيانات",
      detail: err instanceof Error ? err.message : String(err),
    }
  }

  return {
    ok: true,
    fingerprint,
    analyzed_at: fingerprint.generated_at,
    corpus_size_chars: corpus.length,
    signals_summary: {
      episodes_analyzed: signals.coverage.non_hidden_episodes,
      coverage_notes: signals.coverage.notes,
    },
  }
}
