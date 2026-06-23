/**
 * Growth package — orchestrator.
 *
 * Assembles the copy-ready YouTube growth deliverable from a small set of
 * focused generators, all synthesizing from the shared GlobalEpisodeIntelligence
 * (P0). Packaging + distribution + social run concurrently; the marketing
 * strategy runs LAST so it can synthesize over what the others produced.
 *
 * Resilient by design: each slice is independently guarded — a failed slice
 * leaves its part empty and records the error in `meta.errors`, but never
 * aborts the package.
 */

import { generatePackagingAssets } from "./packaging"
import { generateDistributionPlan } from "./distribution"
import { generateSocialBundle } from "./social"
import { generateMarketingStrategy } from "./marketing"
import { emptyGrowthPackage, type GrowthPackage } from "./types"
import type { GrowthGenInput } from "./shared"

export * from "./types"
export type { GrowthGenInput, GrowthChapter } from "./shared"
export { generatePackagingAssets } from "./packaging"
export { generateDistributionPlan } from "./distribution"
export { generateSocialBundle } from "./social"
export { generateMarketingStrategy } from "./marketing"

export type GrowthProgress = (slice: string) => void

export async function generateGrowthPackage(
  input: GrowthGenInput,
  onProgress?: GrowthProgress,
): Promise<{ success: boolean; data: GrowthPackage; error?: string }> {
  const pkg = emptyGrowthPackage()
  const errors: Record<string, string> = {}
  const runIds: Record<string, string | undefined> = {}

  // Controversy angles come straight from the shared intelligence (free).
  pkg.controversy_angles = input.intelligence.controversy_moments.slice(0, 8)

  // Slices 1-3 run concurrently — they're independent.
  onProgress?.("packaging")
  onProgress?.("distribution")
  onProgress?.("social")
  const [packaging, distribution, social] = await Promise.all([
    generatePackagingAssets(input),
    generateDistributionPlan(input),
    generateSocialBundle(input),
  ])

  if (packaging.success && packaging.data) {
    pkg.thumbnail_concepts = packaging.data.thumbnail_concepts
    pkg.opening_hook = packaging.data.opening_hook
    runIds.packaging = packaging.runId
  } else if (packaging.error) {
    errors.packaging = packaging.error
  }

  if (distribution.success && distribution.data) {
    pkg.sponsor_placements = distribution.data.sponsor_placements
    pkg.best_publish_time = distribution.data.best_publish_time
    pkg.retention_recommendations = distribution.data.retention_recommendations
    runIds.distribution = distribution.runId
  } else if (distribution.error) {
    errors.distribution = distribution.error
  }

  if (social.success && social.data) {
    pkg.social_posts = social.data.social_posts
    pkg.short_form_ideas = social.data.short_form_ideas
    runIds.social = social.runId
  } else if (social.error) {
    errors.social = social.error
  }

  // Slice 4 — synthesis over the assembled package.
  onProgress?.("marketing")
  const marketing = await generateMarketingStrategy(input, pkg)
  if (marketing.success && marketing.data) {
    pkg.marketing_strategy = marketing.data
    runIds.marketing = marketing.runId
  } else if (marketing.error) {
    errors.marketing = marketing.error
  }

  pkg.meta = { run_ids: runIds, errors: Object.keys(errors).length ? errors : undefined }

  // The package "succeeds" if at least one substantive slice produced output.
  const hasAny =
    pkg.thumbnail_concepts.length > 0 ||
    pkg.opening_hook !== null ||
    pkg.sponsor_placements.length > 0 ||
    pkg.social_posts.length > 0 ||
    pkg.marketing_strategy !== null

  return {
    success: hasAny,
    data: pkg,
    error: hasAny ? undefined : Object.values(errors)[0] || "فشل توليد حزمة النمو",
  }
}
