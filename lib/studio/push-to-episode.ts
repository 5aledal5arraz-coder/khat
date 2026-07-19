/**
 * UX-4 — Single source of truth for "push studio package → episode."
 *
 * Refactor of the inner body of /api/admin/studio/[id]/push/route.ts
 * into a pure helper. Both the legacy API route AND the new Episode
 * Workspace action call this so push behaviour cannot drift between
 * surfaces.
 *
 * Inputs: studio session id + a per-field selection map (which slices
 * of the website package to write into the episode).
 *
 * Side effects (mirrors the legacy route 1:1):
 *   1. Loads the website package via getWebsitePackageForSession.
 *      The package MUST be ready and have a linked_episode_id.
 *   2. Loads the existing episode override (if any) so we don't wipe
 *      previously-set custom titles/descriptions.
 *   3. Builds the four RPC payloads (override / quotes / enrichment /
 *      log) and calls push_episode_data() in one transactional shot.
 *   4. Auto-links the guest_package onto the canonical guest via
 *      autoLinkGuestForEpisode (Phase 7).
 *   5. Stamps episodes.eir_id from the session's resolved EIR and
 *      walks the EIR forward (syncEirOnStudioPushed +
 *      syncEirOnEpisodePublish when the episode is already published).
 *   6. Invalidates caches + revalidates public/admin paths.
 *
 * Throws when: package missing, package not ready, package has no
 * linked_episode_id, DB unavailable, or push_episode_data fails. The
 * EIR-propagation block is non-fatal (errors logged, push still
 * succeeds).
 */

import { eq, sql } from "drizzle-orm"
import { revalidatePath, revalidateTag } from "next/cache"
import { db } from "@/lib/db"
import { episodes as episodesTable } from "@/lib/db/schema/episodes"
import { invalidate } from "@/lib/cache"
import { TEASER_CACHE_TAG } from "@/lib/teaser"
import { invalidateEpisodeCache } from "@/lib/cache/episode-cache"
import { getEpisodeOverride } from "@/lib/episodes/overrides"
// P2.4.c — canonical service is the single source of truth. The
// Phase 7 `autoLinkGuestForEpisode` shim was retired; the studio push
// path now invokes the canonical surface directly:
//   ensureGuest(...)              — match-or-create the canonical guest
//   assignGuestToEpisode(...)     — bind it to the episode
//   updateGuestIdentityProfile()  — write studio_signals + studio source
// The `guestLink` return value preserves the exact shape callers
// downstream of `pushPackageToEpisode` consume.
import {
  ensureGuest,
  updateGuestIdentityProfile,
} from "@/lib/guests/canonical"
import { assignGuestToEpisode } from "@/lib/episodes/guests"
import { guests as guestsTable } from "@/lib/db/schema/guests"
import { fetchAllEpisodes } from "@/lib/youtube/queries"
import {
  getEirIdForStudioSession,
  syncEirOnStudioPushed,
  syncEirOnEpisodePublish,
} from "@/lib/khat-brain"
import { getWebsitePackageForSession } from "@/lib/studio"

export interface StudioPushFields {
  title?: boolean
  description?: boolean
  hero_summary?: boolean
  full_summary?: boolean
  takeaways?: boolean
  quotes?: boolean
  resources?: boolean
  timestamps?: boolean
}

export interface StudioPushResult {
  episodeId: string | null
  pushedFields: string[]
  guestLink: {
    linked: boolean
    guestId?: string
    guestName?: string
    guestSlug?: string
    created?: boolean
  } | null
}

export class StudioPushError extends Error {
  code:
    | "package_missing"
    | "package_not_ready"
    | "package_unlinked"
    | "db_unavailable"
  constructor(
    message: string,
    code:
      | "package_missing"
      | "package_not_ready"
      | "package_unlinked"
      | "db_unavailable",
  ) {
    super(message)
    this.code = code
    this.name = "StudioPushError"
  }
}

export async function runStudioPushToEpisode(input: {
  sessionId: string
  fields: StudioPushFields
}): Promise<StudioPushResult> {
  const { sessionId, fields } = input

  // ── 1. Load + validate the website package ──────────────────────
  const pkg = await getWebsitePackageForSession(sessionId)
  if (!pkg) {
    throw new StudioPushError("لا توجد حزمة موقع لهذه الجلسة", "package_missing")
  }
  if (pkg.status !== "ready") {
    throw new StudioPushError(
      "حزمة الموقع ليست جاهزة (status != ready)",
      "package_not_ready",
    )
  }
  if (!pkg.linked_episode_id) {
    throw new StudioPushError(
      "الحزمة غير مرتبطة بحلقة — اربطها أولاً.",
      "package_unlinked",
    )
  }
  if (!db) {
    throw new StudioPushError("قاعدة البيانات غير متوفرة", "db_unavailable")
  }

  const episodeId = pkg.linked_episode_id
  const pushedFields: string[] = []

  // Episode title fallback for override + log
  let episodeTitle = ""
  try {
    const eps = await fetchAllEpisodes()
    const ep = eps.find((e) => e.id === episodeId)
    episodeTitle = ep?.title || episodeId
  } catch {
    episodeTitle = episodeId
  }

  // ── 2. Build RPC payloads ───────────────────────────────────────
  let rpcOverride: Record<string, unknown> | null = null
  let rpcQuotes: Record<string, unknown> | null = null
  let rpcEnrichment: Record<string, unknown> | null = null

  if (fields.title && pkg.custom_title) {
    const existing = await getEpisodeOverride(episodeId)
    rpcOverride = {
      original_title: existing?.originalTitle || episodeTitle,
      custom_title: pkg.custom_title,
      custom_description: existing?.customDescription || null,
    }
    pushedFields.push("title")
  }

  if (fields.description && pkg.full_summary) {
    const existing = await getEpisodeOverride(episodeId)
    rpcOverride = {
      ...(rpcOverride || {}),
      original_title:
        rpcOverride?.original_title || existing?.originalTitle || episodeTitle,
      custom_title:
        rpcOverride?.custom_title || existing?.customTitle || episodeTitle,
      custom_description: pkg.full_summary,
    }
    pushedFields.push("description")
  }

  if (fields.quotes && pkg.quotes.length > 0) {
    const selectedIndices = pkg.selected_quote_indices
      ? new Set(pkg.selected_quote_indices)
      : null
    const quotesToPush = selectedIndices
      ? pkg.quotes.filter((_, i) => selectedIndices.has(i))
      : pkg.quotes
    if (quotesToPush.length > 0) {
      rpcQuotes = {
        episode_title: episodeTitle,
        quotes: quotesToPush.map((q) => ({
          id: `studio-quote-${crypto.randomUUID()}`,
          text: q.text,
          theme: q.theme,
          speaker: q.speaker,
        })),
        status: "published",
        generated_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
      }
      pushedFields.push("quotes")
    }
  }

  const enrichmentFields: Record<string, unknown> = {}
  let hasEnrichment = false
  if (fields.hero_summary && pkg.hero_summary) {
    enrichmentFields.hero_summary = pkg.hero_summary
    hasEnrichment = true
    pushedFields.push("hero_summary")
  }
  if (fields.full_summary && pkg.full_summary) {
    enrichmentFields.full_summary = pkg.full_summary
    hasEnrichment = true
    pushedFields.push("full_summary")
  }
  if (fields.takeaways && pkg.takeaways.length > 0) {
    const selectedIndices = pkg.selected_takeaway_indices
      ? new Set(pkg.selected_takeaway_indices)
      : null
    const takeawaysToPush = selectedIndices
      ? pkg.takeaways.filter((_, i) => selectedIndices.has(i))
      : pkg.takeaways
    if (takeawaysToPush.length > 0) {
      enrichmentFields.takeaways = takeawaysToPush
      hasEnrichment = true
      pushedFields.push("takeaways")
    }
  }
  if (fields.resources && pkg.resources.length > 0) {
    enrichmentFields.resources = pkg.resources
    hasEnrichment = true
    pushedFields.push("resources")
  }
  if (fields.timestamps && pkg.timestamps.length > 0) {
    enrichmentFields.timestamps = pkg.timestamps
    hasEnrichment = true
    pushedFields.push("timestamps")
  }
  if (hasEnrichment) rpcEnrichment = enrichmentFields

  const rpcOverrideJson = rpcOverride ? JSON.stringify(rpcOverride) : null
  const rpcQuotesJson = rpcQuotes ? JSON.stringify(rpcQuotes) : null
  const rpcEnrichmentJson = rpcEnrichment ? JSON.stringify(rpcEnrichment) : null
  const logJson = JSON.stringify({
    session_id: sessionId,
    episode_title: episodeTitle,
    pushed_fields: pushedFields,
    pushed_at: new Date().toISOString(),
  })

  // ── 3. Atomic push via RPC ──────────────────────────────────────
  await db.execute(sql`
    SELECT push_episode_data(
      ${episodeId},
      ${rpcOverrideJson}::jsonb,
      ${rpcQuotesJson}::jsonb,
      ${rpcEnrichmentJson}::jsonb,
      ${logJson}::jsonb
    )
  `)

  // ── 4. Auto-link guest if extracted by AI ───────────────────────
  let guestLink: StudioPushResult["guestLink"] = null
  const guestPkg = pkg.guest_package as
    | {
        guest_name: string
        guest_bio: string
        guest_photo_url: string | null
        guest_external_links: Record<string, string>
      }
    | null
  const rawResponse = pkg.raw_openai_response as Record<string, unknown> | null
  const guestName =
    guestPkg?.guest_name || (rawResponse?.guest_name as string | undefined)
  const guestBio =
    guestPkg?.guest_bio || (rawResponse?.guest_bio as string | undefined)
  const guestPhotoUrl = guestPkg?.guest_photo_url || null
  const guestExternalLinks =
    guestPkg?.guest_external_links &&
    Object.keys(guestPkg.guest_external_links).length > 0
      ? guestPkg.guest_external_links
      : null
  if (guestName && guestName.trim()) {
    let studioSignals:
      | {
          detected_bio?: string | null
          speaking_style?: string | null
          key_positions?: string[]
          notable_quotes?: Array<{ text: string; context?: string }>
        }
      | null = null
    try {
      const { getGuestIntelligenceForSession } = await import(
        "@/lib/studio/guest-intelligence"
      )
      const gi = await getGuestIntelligenceForSession(sessionId)
      if (gi) {
        studioSignals = {
          detected_bio: gi.detected_bio,
          speaking_style: gi.speaking_style,
          key_positions: gi.key_positions ?? [],
          notable_quotes: (gi.notable_quotes ?? []).map((q) => ({
            text: q.text,
            context: q.context,
          })),
        }
      }
    } catch (err) {
      console.error("[studio push] guest_intelligence read failed:", err)
    }
    // P2.4.c — inline replacement for the retired shim. Three
    // canonical calls (match-or-create → bind → write studio profile
    // section). Preserves the `{ linked, guestId, guestName,
    // guestSlug, created, error, requires_review }` shape callers
    // downstream of pushPackageToEpisode consume.
    try {
      const ensure = await ensureGuest(
        {
          name: guestName,
          bio: guestBio || null,
          photo_url: guestPhotoUrl,
          external_links: guestExternalLinks ?? undefined,
        },
        { acceptance: "auto" },
      )
      if (ensure.requires_review) {
        // Surface the failure for log diagnostics; the narrow
        // `StudioPushResult["guestLink"]` shape (set by the existing
        // interface) doesn't carry an `error` or `requires_review`
        // field, so we log here and return the minimal shape — same
        // observable behavior as the retired shim, where those wider
        // fields silently dropped on assignment.
        console.warn(
          `[studio push] guest match requires review for "${guestName}" — ${ensure.reasons.join(" · ")}`,
        )
        guestLink = { linked: false }
      } else {
        await assignGuestToEpisode(episodeId, ensure.guest_id)
        if (studioSignals) {
          try {
            await updateGuestIdentityProfile(ensure.guest_id, {
              studio_signals: {
                detected_bio: studioSignals.detected_bio ?? null,
                speaking_style: studioSignals.speaking_style ?? null,
                key_positions: studioSignals.key_positions ?? [],
                notable_quotes: studioSignals.notable_quotes ?? [],
              },
              source_summary: {
                studio: { sessions: 1, last_seen: new Date().toISOString() },
              },
              last_analyzed_at: new Date(),
            })
          } catch (err) {
            console.error(
              "[studio push] studio_signals profile update failed:",
              err,
            )
          }
        }
        // Fetch name + slug to preserve the legacy response shape that
        // downstream consumers of pushPackageToEpisode read.
        const guestRow = await db
          .select({ id: guestsTable.id, name: guestsTable.name, slug: guestsTable.slug })
          .from(guestsTable)
          .where(eq(guestsTable.id, ensure.guest_id))
          .limit(1)
        guestLink = {
          linked: true,
          guestId: ensure.guest_id,
          guestName: guestRow[0]?.name,
          guestSlug: guestRow[0]?.slug,
          created: ensure.created,
        }
      }
    } catch (err) {
      // Same diagnostic surface as the retired shim — log, then store
      // the minimal failure shape allowed by StudioPushResult.guestLink.
      console.error("autoLinkGuestForEpisode error:", err)
      guestLink = { linked: false }
    }
  }

  // ── 5. EIR propagation (non-fatal) ──────────────────────────────
  try {
    const sessionEirId = await getEirIdForStudioSession(sessionId)
    if (sessionEirId) {
      const [updated] = await db
        .update(episodesTable)
        .set({ eir_id: sessionEirId, updated_at: new Date() })
        .where(eq(episodesTable.id, episodeId))
        .returning({ status: episodesTable.status })
      await syncEirOnStudioPushed({ eirId: sessionEirId })
      if (updated?.status === "published") {
        await syncEirOnEpisodePublish({ eirId: sessionEirId })
      }
    }
  } catch (err) {
    console.error("[khat-brain] studio push EIR propagation failed:", err)
  }

  // ── 6. Cache invalidation ───────────────────────────────────────
  // Non-fatal — these calls require a Next.js request context. When
  // the helper runs from a tsx script (smoke / cron) the request store
  // doesn't exist; the caches will simply rebuild on next read.
  await safeNoop(() => invalidateEpisodeCache())
  safeSync(() => invalidate("episodes"))
  safeSync(() => invalidate("guests"))
  safeSync(() => revalidatePath("/"))
  safeSync(() => revalidatePath("/episodes"))
  safeSync(() => revalidatePath("/admin/episodes"))
  safeSync(() => revalidatePath(`/admin/episodes/${episodeId}`))
  // Drop the homepage teaser cache: once this push advances the linked EIR to
  // `published`, getActiveTeaserForDisplay must re-evaluate and hide the teaser
  // (acceptance م4 / Sara note 14). Safe to run on every push — a still-upcoming
  // EIR simply rebuilds the same result.
  safeSync(() => revalidateTag(TEASER_CACHE_TAG, { expire: 0 }))

  return {
    episodeId,
    pushedFields,
    guestLink,
  }
}

function safeSync(fn: () => void): void {
  try {
    fn()
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[studio push] cache invalidate skipped:",
        (err as Error)?.message,
      )
    }
  }
}
async function safeNoop(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[studio push] cache invalidate skipped:",
        (err as Error)?.message,
      )
    }
  }
}
