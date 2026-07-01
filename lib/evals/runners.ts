/**
 * Khat Brain — Eval generator runners.
 *
 * For each evaluated feature, this module knows how to invoke the
 * production generator in a way that:
 *   (a) uses the same prompt builders as the live admin code,
 *   (b) supplies sane defaults for inputs the feature needs
 *       (originals, clusters, worked-report, etc.),
 *   (c) returns a uniform { candidates, promptVersion } shape so the
 *       CLI doesn't need feature-specific branching.
 *
 * The CLI calls runGenerator(feature). No mocking — Phase 0 baselines
 * reflect the actual production behaviour at the time of recording.
 *
 * Hardening:
 *   • If OPENAI_API_KEY is unset, every runner throws a clear error.
 *   • If the production generator returns an error result, the runner
 *     surfaces it so the CLI writes a failure report.
 *   • Inputs are loaded from the live DB where the generator needs
 *     them (Hybrid needs clusters + originals + worked-report). Empty
 *     DBs produce smaller pools — that's a real signal, not a bug.
 */

import { env } from "@/lib/env"
import { generateHybridTopics } from "@/lib/hybrid-topics/generate"
import { generateOriginalTopics } from "@/lib/original-thinking/generator"
import { generateStudioPackage } from "@/lib/ai/studio"
import { enableSessionBypass } from "@/lib/ai-router/rate-limit"
import {
  HYBRID_TOPICS_PROMPT_VERSION,
} from "@/lib/ai/prompts/hybrid-topics"
import {
  ORIGINAL_THINKING_PROMPT_VERSION,
} from "@/lib/ai/prompts/original-thinking"
import {
  STUDIO_PACKAGE_PROMPT_VERSION,
} from "@/lib/ai/prompts/studio-package"
import type { EvalFeature } from "./types"

export interface RunnerOutput {
  candidates: Array<{ id: string; example: Record<string, unknown> }>
  promptVersion: string | null
}

export async function runGenerator(feature: EvalFeature): Promise<RunnerOutput> {
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set — runners require a live key to produce candidates",
    )
  }

  // Phase 1.6 — disable the rate limiter for the duration of this run.
  // Baselines must be reproducible regardless of the operator's day-cost
  // ledger. Audit rows still record bypassed_session so misuse is
  // visible.
  const releaseBypass = enableSessionBypass(`eval-runner:${feature}`)
  try {
    switch (feature) {
      case "hybrid-topics":
        return await runHybridTopics()
      case "original-thinking":
        return await runOriginalThinking()
      case "studio-package":
        return await runStudioPackage()
    }
  } finally {
    releaseBypass()
  }
}

// ─── Hybrid Topics ──────────────────────────────────────────────────

async function runHybridTopics(): Promise<RunnerOutput> {
  const result = await generateHybridTopics({
    seasonId: null,
    language: "ar",
    count: 6,
    allowKuwaitBias: false,
    createdBy: "eval-runner",
  })
  if (!result.ok) {
    throw new Error(`hybrid generation failed: ${result.reason}`)
  }
  const all = [...result.accepted, ...result.rejected].slice(0, 8)
  return {
    candidates: all.map((t, i) => ({
      id: `gen-${i}-${slug(t.title)}`,
      example: t as unknown as Record<string, unknown>,
    })),
    promptVersion: HYBRID_TOPICS_PROMPT_VERSION,
  }
}

// ─── Original Thinking ──────────────────────────────────────────────

async function runOriginalThinking(): Promise<RunnerOutput> {
  const result = await generateOriginalTopics({
    language: "ar",
    count: 6,
    seasonId: null,
    excludedTitles: [],
    allowKuwaitBias: false,
  })
  if (!result.ok) {
    throw new Error("original-thinking generation failed (ok=false)")
  }
  return {
    candidates: result.accepted.map((t, i) => ({
      id: `gen-${i}-${slug(t.title)}`,
      example: t as unknown as Record<string, unknown>,
    })),
    promptVersion: ORIGINAL_THINKING_PROMPT_VERSION,
  }
}

// ─── Studio Package ─────────────────────────────────────────────────

async function runStudioPackage(): Promise<RunnerOutput> {
  // Synthetic transcript scenario. The studio prompt produces one full
  // package per call, so we run a single fixed scenario per eval run.
  const transcript =
    "هذا تجربة تقييم آلية. نتحدث في هذه الحلقة الافتراضية عن تحول صادق في حياة فرد عاش عقدين خارج وطنه ثم عاد. الموضوع يتمحور حول الفقد الذي لا اسم له، الحرية حين تصبح ثقيلة، والذاكرة التي يحفظها الجسد. الضيف يصف اللحظة الأولى للحرية، والباب الذي فتحه ليكتشف أن البيت لم يعد قائماً."
  const result = await generateStudioPackage(
    transcript,
    "حلقة تجربة التقييم",
    "خط بودكاست",
    null,
  )
  if (!result.success || !result.data) {
    throw new Error(`studio package failed: ${result.error}`)
  }
  return {
    candidates: [
      {
        id: "gen-0-studio-eval",
        example: result.data as unknown as Record<string, unknown>,
      },
    ],
    promptVersion: STUDIO_PACKAGE_PROMPT_VERSION,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
}
