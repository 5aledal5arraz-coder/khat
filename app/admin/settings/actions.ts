"use server"

import { revalidatePath } from "next/cache"
import { getSiteSettings, saveSiteSettings } from "@/lib/site-settings"
import { requireAdmin } from "@/lib/api-utils"
import { writeAiRuntimeOverride, type AiRuntimeConfig } from "@/lib/ai-router/runtime-config"
import {
  writeAiModelOverride,
  type TaskModelOverride,
} from "@/lib/ai-router/model-selection"
import { getModelCatalog } from "@/lib/ai-router/model-catalog"
import { createBenchmarkRow } from "@/lib/ai-router/benchmark/store"
import { SUITE_VERSION, tierBaselineModel } from "@/lib/ai-router/benchmark/run"
import { enqueueJob } from "@/lib/jobs/queue"
import type { BenchmarkTier } from "@/lib/db/schema/model-benchmarks"
import type { AiTaskKind } from "@/lib/ai-router/types"
import type { SiteMetadata, SEODefaults, FeatureFlags } from "@/types/site-settings"

export async function updateSiteMetadata(metadata: SiteMetadata) {
  await requireAdmin()
  const settings = await getSiteSettings()
  settings.metadata = metadata
  await saveSiteSettings(settings)
  revalidatePath("/admin/settings")
  // Metadata drives site-wide <title>/description and the contact page.
  revalidatePath("/", "layout")
  revalidatePath("/contact")
}

export async function updateSEODefaults(seo: SEODefaults) {
  await requireAdmin()
  const settings = await getSiteSettings()
  settings.seo = seo
  await saveSiteSettings(settings)
  revalidatePath("/admin/settings")
  revalidatePath("/", "layout")
}

export async function updateFeatureFlags(featureFlags: FeatureFlags) {
  await requireAdmin()
  const settings = await getSiteSettings()
  settings.featureFlags = featureFlags
  await saveSiteSettings(settings)
  revalidatePath("/admin/settings")
  // Flags gate real surfaces: maintenance (layout), guest funnel, studio.
  revalidatePath("/", "layout")
  revalidatePath("/guest")
  revalidatePath("/admin/studio")
}

export async function updateAiRuntimeConfig(cfg: AiRuntimeConfig) {
  await requireAdmin()
  await writeAiRuntimeOverride(cfg)
  // The AI router reads this live; the ops dashboard reflects it.
  revalidatePath("/admin/settings")
  revalidatePath("/admin/ops")
}

export async function updateAiModelOverride(
  taskKind: AiTaskKind,
  override: TaskModelOverride | null,
) {
  await requireAdmin()
  await writeAiModelOverride(taskKind, override)
  // The router reads overrides live (15s cache); settings re-renders the table.
  revalidatePath("/admin/settings")
}

export async function refreshAiModelsCatalog() {
  await requireAdmin()
  await getModelCatalog({ forceRefresh: true })
  revalidatePath("/admin/settings")
}

export async function startModelBenchmark(input: {
  candidate: string
  tier: BenchmarkTier
  baseline?: string | null
}) {
  await requireAdmin()
  const baseline = input.baseline?.trim() || tierBaselineModel(input.tier)
  const candidate = input.candidate.trim()
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(candidate)) throw new Error("invalid model id")
  const benchmarkId = await createBenchmarkRow({
    tier: input.tier,
    baseline_model: baseline,
    candidate_model: candidate,
    suite_version: SUITE_VERSION,
    triggered_by: "manual",
  })
  // Runs in the worker — the row shows "running" until it lands.
  await enqueueJob("model.benchmark", {
    benchmark_id: benchmarkId,
    tier: input.tier,
    candidate_model: candidate,
    baseline_model: baseline,
    triggered_by: "manual",
  })
  revalidatePath("/admin/settings")
  return { benchmarkId }
}
