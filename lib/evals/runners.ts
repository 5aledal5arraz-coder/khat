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

import { generateHybridTopics } from "@/lib/hybrid-topics/generate"
import { generateOriginalTopics } from "@/lib/original-thinking/generator"
import { seedArchetypes } from "@/lib/discovery/seed-archetypes"
import { verifyCandidate } from "@/lib/discovery/verify-candidate"
import { generateStudioPackage } from "@/lib/ai/studio"
import { enableSessionBypass } from "@/lib/ai-router/rate-limit"
import {
  HYBRID_TOPICS_PROMPT_VERSION,
} from "@/lib/ai/prompts/hybrid-topics"
import {
  ORIGINAL_THINKING_PROMPT_VERSION,
} from "@/lib/ai/prompts/original-thinking"
import {
  DISCOVERY_ARCHETYPES_PROMPT_VERSION,
} from "@/lib/ai/prompts/discovery-archetypes"
import {
  DISCOVERY_VERIFY_PROMPT_VERSION,
} from "@/lib/ai/prompts/discovery-verify"
import {
  STUDIO_PACKAGE_PROMPT_VERSION,
} from "@/lib/ai/prompts/studio-package"
import type { EvalFeature } from "./types"

export interface RunnerOutput {
  candidates: Array<{ id: string; example: Record<string, unknown> }>
  promptVersion: string | null
}

export async function runGenerator(feature: EvalFeature): Promise<RunnerOutput> {
  if (!process.env.OPENAI_API_KEY) {
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
      case "discovery-archetypes":
        return await runDiscoveryArchetypes()
      case "discovery-verify":
        return await runDiscoveryVerify()
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

// ─── Discovery Archetypes ───────────────────────────────────────────

async function runDiscoveryArchetypes(): Promise<RunnerOutput> {
  const result = await seedArchetypes({
    seedPrompt: "ضيوف عاشوا تحولاً صادقاً في عمل أو هوية أو إيمان",
    editorialContext:
      "خط بودكاست ليس بودكاست اتجاهات. نبحث عن صدق نادر، خبرة هادئة، تحول حقيقي.",
    count: 6,
  })
  if (!result.ok) {
    throw new Error(`archetypes generation failed: ${result.errorMessage}`)
  }
  return {
    candidates: result.archetypes.map((a, i) => ({
      id: `gen-${i}-${a.id || slug(a.name)}`,
      example: a as unknown as Record<string, unknown>,
    })),
    promptVersion: DISCOVERY_ARCHETYPES_PROMPT_VERSION,
  }
}

// ─── Discovery Verify ───────────────────────────────────────────────

async function runDiscoveryVerify(): Promise<RunnerOutput> {
  // Synthetic candidate scenarios. Each one is a known shape so the
  // judge can compare verification quality against the golden positives.
  const scenarios = [
    {
      proposed: {
        proposed_name: "د. خالد الراشد",
        proposed_role: "باحث في الأنثروبولوجيا",
        proposed_country: "السعودية",
      },
      evidence_urls: [
        {
          platform: "youtube" as const,
          url: "https://yt.example/rashed-1",
          title: "محاضرة عن البدو في القرن الواحد والعشرين",
          snippet:
            "تأمل هادئ في علاقة البدوي بالمكان بعد التحول الحضري. أمثلة محددة من رحلات ميدانية.",
          fetched_at: new Date().toISOString(),
        },
      ],
    },
    {
      proposed: {
        proposed_name: "حساب @influencer_demo",
        proposed_role: "مؤثر اجتماعي",
        proposed_country: "الإمارات",
      },
      evidence_urls: [
        {
          platform: "youtube" as const,
          url: "https://yt.example/inf-1",
          title: "تحدي 24 ساعة في فندق سبع نجوم",
          snippet: "محتوى ترفيهي ترويجي.",
          fetched_at: new Date().toISOString(),
        },
      ],
    },
  ]

  const verdicts = []
  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i]
    const result = await verifyCandidate({
      proposed_name: sc.proposed.proposed_name,
      proposed_role: sc.proposed.proposed_role,
      proposed_country: sc.proposed.proposed_country,
      archetype: {
        id: "quiet_expert_witness",
        name: "الشاهد الهادئ",
        description: "خبير هادئ بتحول حقيقي.",
        target_signals: ["شاهد عيان", "خبرة عميقة", "تحول"],
        expected_traits: ["تواضع", "صدق"],
      },
      evidence_urls: sc.evidence_urls,
    })
    if (result.ok) {
      verdicts.push({
        id: `gen-${i}-${slug(sc.proposed.proposed_name)}`,
        example: {
          evidence_summary: result.evidence_summary,
          story_signals: result.story_signals,
          editorial_fit_score: result.editorial_fit_score,
        } as Record<string, unknown>,
      })
    }
  }
  return {
    candidates: verdicts,
    promptVersion: DISCOVERY_VERIFY_PROMPT_VERSION,
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
