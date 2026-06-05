/**
 * Push preview — server helper used by the workspace Publish tab to
 * tell the operator, before they click confirm, exactly which fields
 * the studio package will write into the episode and which of those
 * fields already hold non-empty values (and therefore will be
 * replaced).
 *
 * Mirrors the field detection in `runStudioPushToEpisode` so the
 * preview cannot drift from what actually happens on confirm.
 *
 * Phase B audit fix: types + labels live in `push-preview-types.ts`
 * so client components (PushButton) can import them without dragging
 * `revalidatePath` + drizzle into the browser bundle. This file holds
 * the server-only logic (`getPushPreview`).
 */

import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { studioSessions } from "@/lib/db/schema/studio"
import { getWebsitePackageForSession } from "@/lib/studio"
import { getEpisodeOverride } from "@/lib/episodes/overrides"
import { getEpisodeEnrichment } from "@/lib/episodes/enrichments"
import type {
  PushPreview,
  PushPreviewField,
} from "./push-preview-types"

export {
  PUSH_FIELD_LABEL_AR,
  type PushPreview,
  type PushPreviewField,
} from "./push-preview-types"

export async function getPushPreview(eirId: string): Promise<PushPreview> {
  const empty = (
    reason: NonNullable<PushPreview["reason"]>,
    message: string,
  ): PushPreview => ({
    ok: false,
    reason,
    message,
    pushableFields: [],
    overwritingFields: [],
    episodeId: null,
  })

  if (!db) return empty("db_unavailable", "قاعدة البيانات غير متوفرة.")

  const [session] = await db
    .select({ id: studioSessions.id })
    .from(studioSessions)
    .where(eq(studioSessions.eir_id, eirId))
    .orderBy(desc(studioSessions.updated_at))
    .limit(1)
  if (!session) return empty("no_session", "لا توجد جلسة استديو لهذه الحلقة.")

  const pkg = await getWebsitePackageForSession(session.id)
  if (!pkg) return empty("no_package", "لا توجد حزمة موقع.")
  if (pkg.status !== "ready")
    return empty("package_not_ready", "حزمة الموقع ليست جاهزة بعد.")
  if (!pkg.linked_episode_id)
    return empty("no_episode", "الحزمة غير مرتبطة بحلقة.")

  const episodeId = pkg.linked_episode_id
  const [override, enrichment] = await Promise.all([
    getEpisodeOverride(episodeId),
    getEpisodeEnrichment(episodeId),
  ])

  const pushable: PushPreviewField[] = []
  const overwriting: PushPreviewField[] = []

  if (pkg.custom_title) {
    pushable.push("title")
    if (override?.customTitle && override.customTitle.trim().length > 0) {
      overwriting.push("title")
    }
  }
  if (pkg.full_summary) {
    pushable.push("description")
    if (
      override?.customDescription &&
      override.customDescription.trim().length > 0
    ) {
      overwriting.push("description")
    }
  }
  if (pkg.hero_summary) {
    pushable.push("hero_summary")
    if (enrichment?.hero_summary && enrichment.hero_summary.trim().length > 0) {
      overwriting.push("hero_summary")
    }
  }
  if (pkg.full_summary) {
    pushable.push("full_summary")
    if (enrichment?.full_summary && enrichment.full_summary.trim().length > 0) {
      overwriting.push("full_summary")
    }
  }
  if (pkg.takeaways && pkg.takeaways.length > 0) {
    pushable.push("takeaways")
    if (enrichment?.takeaways && enrichment.takeaways.length > 0) {
      overwriting.push("takeaways")
    }
  }
  if (pkg.quotes && pkg.quotes.length > 0) {
    pushable.push("quotes")
    // Quote overwrite detection is intentionally skipped — quotes live
    // in episode_quotes (separate table); the operator-visible warning
    // covers override/enrichment fields which is where the destructive
    // surprise actually happens.
  }
  if (pkg.resources && pkg.resources.length > 0) {
    pushable.push("resources")
    if (enrichment?.resources && enrichment.resources.length > 0) {
      overwriting.push("resources")
    }
  }
  if (pkg.timestamps && pkg.timestamps.length > 0) {
    pushable.push("timestamps")
    if (enrichment?.timestamps && enrichment.timestamps.length > 0) {
      overwriting.push("timestamps")
    }
  }

  return {
    ok: true,
    pushableFields: pushable,
    overwritingFields: overwriting,
    episodeId,
  }
}
