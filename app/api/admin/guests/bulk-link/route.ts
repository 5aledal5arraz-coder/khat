import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { requireAdminAPI } from "@/lib/api-utils"
import { db, USE_DB } from "@/lib/db"
import { episodes } from "@/lib/db/schema/episodes"
import { guests } from "@/lib/db/schema/guests"
import { studioAnalysisRecords } from "@/lib/db/schema/studio-analysis"
import { eq, and } from "drizzle-orm"
import { fetchAllEpisodes } from "@/lib/youtube/queries"
// P2.4.c — canonical service is the single source of truth.
// The Phase 7 `autoLinkGuestForEpisode` shim was retired; this route
// now invokes the canonical surface directly:
//   ensureGuest(...)         — match-or-create the canonical guest
//   assignGuestToEpisode(...) — bind it to the episode
// No studio signals on this call path (bulk-link is a website-package
// flow, not a studio push), so updateGuestIdentityProfile is not
// invoked here.
import { ensureGuest } from "@/lib/guests/canonical"
import { assignGuestToEpisode } from "@/lib/episodes/guests"
import { invalidate } from "@/lib/cache"

interface BulkLinkPreviewItem {
  episodeId: string
  episodeTitle: string
  guestName: string
  guestBio: string | null
  alreadyLinked: boolean
  /**
   * True when the episode already has a guest, but the linked guest's name
   * does not match the package's inferred guest_name. The operator should
   * reconcile manually instead of auto-overwriting.
   */
  guestMismatch?: boolean
  currentGuestName?: string | null
}

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
}

/**
 * Read all "ready" website_package records from studio_analysis_records
 * (Phase 5 — consolidated table) and extract the (episode_id, guest_name,
 * guest_bio) triples needed by the bulk-link flow.
 *
 * Guest data lives in two places depending on which generator wrote the
 * package:
 *   1. data.guest_package = { guest_name, guest_bio, ... }    (newer flow)
 *   2. raw_provider_response.guest_name / .guest_bio          (legacy)
 * We try both.
 */
interface ExtractedPackage {
  episode_id: string
  guest_name: string
  guest_bio: string | null
}

async function readReadyWebsitePackages(): Promise<ExtractedPackage[]> {
  const rows = await db!
    .select({
      data: studioAnalysisRecords.data,
      raw: studioAnalysisRecords.raw_provider_response,
    })
    .from(studioAnalysisRecords)
    .where(
      and(
        eq(studioAnalysisRecords.kind, "website_package"),
        eq(studioAnalysisRecords.status, "ready"),
      ),
    )

  const out: ExtractedPackage[] = []
  for (const r of rows) {
    const data = (r.data ?? {}) as {
      linked_episode_id?: string | null
      guest_package?: { guest_name?: string; guest_bio?: string | null } | null
    }
    const raw = (r.raw ?? null) as Record<string, unknown> | null

    const episodeId = data.linked_episode_id ?? null
    if (!episodeId) continue

    const guestName =
      data.guest_package?.guest_name ?? (raw?.guest_name as string | undefined)
    if (!guestName || !guestName.trim()) continue

    const guestBio =
      data.guest_package?.guest_bio ??
      (raw?.guest_bio as string | undefined) ??
      null

    out.push({
      episode_id: episodeId,
      guest_name: guestName.trim(),
      guest_bio: guestBio,
    })
  }
  return out
}

/**
 * GET /api/admin/guests/bulk-link — preview what would be linked
 */
export async function GET() {
  const authError = await requireAdminAPI()
  if (authError) return authError
  if (!USE_DB) return NextResponse.json({ error: "يتطلب قاعدة بيانات" }, { status: 400 })

  try {
    const packages = await readReadyWebsitePackages()

    // Pull the current (episode, guest_name) pairs so we can detect
    // mismatches — an episode already linked to a *different* guest is
    // NOT "already linked" for this package and should be surfaced.
    const linkRows = await db!
      .select({
        episodeId: episodes.id,
        guestId: episodes.guest_id,
        guestName: guests.name,
      })
      .from(episodes)
      .leftJoin(guests, eq(guests.id, episodes.guest_id))
    const currentByEpisodeId = new Map<
      string,
      { guestId: string | null; guestName: string | null }
    >()
    for (const r of linkRows) {
      currentByEpisodeId.set(r.episodeId, {
        guestId: r.guestId ?? null,
        guestName: r.guestName ?? null,
      })
    }

    const allEpisodes = await fetchAllEpisodes()
    const episodeMap = new Map(allEpisodes.map((e) => [e.id, e]))

    const preview: BulkLinkPreviewItem[] = packages.map((p) => {
      const cur = currentByEpisodeId.get(p.episode_id)
      const hasGuest = Boolean(cur?.guestId)
      const namesMatch =
        hasGuest &&
        cur?.guestName != null &&
        normalizeName(cur.guestName) === normalizeName(p.guest_name)
      return {
        episodeId: p.episode_id,
        episodeTitle: episodeMap.get(p.episode_id)?.title ?? p.episode_id,
        guestName: p.guest_name,
        guestBio: p.guest_bio,
        alreadyLinked: namesMatch,
        guestMismatch: hasGuest && !namesMatch,
        currentGuestName: cur?.guestName ?? null,
      }
    })

    const linkedCount = preview.filter((p) => p.alreadyLinked).length
    const mismatchCount = preview.filter((p) => p.guestMismatch).length
    const toLinkCount = preview.length - linkedCount - mismatchCount

    return NextResponse.json({
      total: preview.length,
      alreadyLinked: linkedCount,
      mismatch: mismatchCount,
      toLink: toLinkCount,
      items: preview,
    })
  } catch (error) {
    console.error("Bulk link preview error:", error)
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 })
  }
}

/**
 * POST /api/admin/guests/bulk-link — execute bulk linking
 */
export async function POST() {
  const authError = await requireAdminAPI()
  if (authError) return authError
  if (!USE_DB) return NextResponse.json({ error: "يتطلب قاعدة بيانات" }, { status: 400 })

  try {
    const packages = await readReadyWebsitePackages()

    const linkRows = await db!
      .select({
        episodeId: episodes.id,
        guestId: episodes.guest_id,
        guestName: guests.name,
      })
      .from(episodes)
      .leftJoin(guests, eq(guests.id, episodes.guest_id))
    const currentByEpisodeId = new Map<
      string,
      { guestId: string | null; guestName: string | null }
    >()
    for (const r of linkRows) {
      currentByEpisodeId.set(r.episodeId, {
        guestId: r.guestId ?? null,
        guestName: r.guestName ?? null,
      })
    }

    const results: {
      episodeId: string
      guestName: string
      linked: boolean
      created: boolean
      skipped?: "already_correct" | "guest_mismatch"
      error?: string
    }[] = []

    for (const pkg of packages) {
      const cur = currentByEpisodeId.get(pkg.episode_id)
      if (cur?.guestId) {
        const namesMatch =
          cur.guestName != null &&
          normalizeName(cur.guestName) === normalizeName(pkg.guest_name)
        if (namesMatch) {
          results.push({
            episodeId: pkg.episode_id,
            guestName: pkg.guest_name,
            linked: false,
            created: false,
            skipped: "already_correct",
          })
          continue
        }
        // Different guest already linked — do not overwrite. Surface
        // so the operator can reconcile manually.
        results.push({
          episodeId: pkg.episode_id,
          guestName: pkg.guest_name,
          linked: false,
          created: false,
          skipped: "guest_mismatch",
          error: `الحلقة مرتبطة بضيف مختلف (${cur.guestName ?? "بدون اسم"}) — راجع يدويًا.`,
        })
        continue
      }
      // P2.4.c — inline replacement for the retired
      // `autoLinkGuestForEpisode` shim. Same DB behavior:
      // ensureGuest match-or-create → assignGuestToEpisode binding.
      // Same error semantics (Arabic message + requires_review
      // surfacing) preserved for the caller's response shape.
      let linkResult: { linked: boolean; created: boolean; error?: string }
      try {
        const ensure = await ensureGuest(
          {
            name: pkg.guest_name,
            bio: pkg.guest_bio ?? null,
          },
          { acceptance: "auto" },
        )
        if (ensure.requires_review) {
          linkResult = {
            linked: false,
            created: false,
            error: "تعذّر تأكيد هوية الضيف — يحتاج مراجعة",
          }
        } else {
          await assignGuestToEpisode(pkg.episode_id, ensure.guest_id)
          linkResult = { linked: true, created: ensure.created }
        }
      } catch (err) {
        console.error("autoLink (bulk-link) error:", err)
        linkResult = {
          linked: false,
          created: false,
          error: err instanceof Error ? err.message : "خطأ غير متوقع",
        }
      }
      results.push({
        episodeId: pkg.episode_id,
        guestName: pkg.guest_name,
        linked: linkResult.linked,
        created: linkResult.created || false,
        error: linkResult.error,
      })
    }

    const linked = results.filter((r) => r.linked)
    const failed = results.filter((r) => !r.linked && !r.skipped)
    const skippedMismatch = results.filter(
      (r) => r.skipped === "guest_mismatch",
    )
    const created = results.filter((r) => r.created)

    if (linked.length > 0) {
      invalidate("guests")
      invalidate("episodes")
      revalidatePath("/")
      revalidatePath("/episodes")
      revalidatePath("/guests")
      revalidatePath("/admin/guests")
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalProcessed: results.length,
        linked: linked.length,
        guestsCreated: created.length,
        failed: failed.length,
        skippedMismatch: skippedMismatch.length,
      },
      results,
    })
  } catch (error) {
    console.error("Bulk link error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء الربط" }, { status: 500 })
  }
}
