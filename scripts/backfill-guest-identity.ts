/**
 * Khat Brain Phase 6 — guest identity unification backfill.
 *
 * Idempotent. Walks every existing guest fragment and consolidates
 * what we know into:
 *   - guests                 (existing rows preferred as canonical)
 *   - guest_identity_profiles (one per guest)
 *   - guest_discovery_links   (where a discovery candidate maps)
 *
 * For ambiguous matches (multiple guests share a normalized name and
 * we have no other signal), we report and skip rather than guessing.
 *
 *   npm run backfill:guest-identity
 */

import { eq, isNotNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { guests, guestApplications } from "@/lib/db/schema/guests"
import { guestCandidates } from "@/lib/db/schema/guest-candidates"
import { khatMapGuestCandidates } from "@/lib/db/schema/khat-map"
import { guestDiscoveryCandidates } from "@/lib/db/schema/discovery"
import {
  guestIdentityProfiles,
  guestDiscoveryLinks,
  type GuestApplicationSummary,
  type GuestSocialAccounts,
  type GuestSourceSummary,
  type GuestStudioSignals,
} from "@/lib/db/schema/guest-identity"
import { studioAnalysisRecords } from "@/lib/db/schema/studio-analysis"
import {
  ensureGuest,
  findGuestMatch,
  type IdentityHints,
} from "@/lib/guests/canonical"

interface Counters {
  profiles_created: number
  profiles_updated: number
  candidates_linked: number
  applications_linked: number
  studio_summarized: number
  ambiguous_skipped: number
}

const c: Counters = {
  profiles_created: 0,
  profiles_updated: 0,
  candidates_linked: 0,
  applications_linked: 0,
  studio_summarized: 0,
  ambiguous_skipped: 0,
}

async function ensureProfileForGuest(guestId: string): Promise<boolean> {
  const existing = await db!
    .select({ id: guestIdentityProfiles.id })
    .from(guestIdentityProfiles)
    .where(eq(guestIdentityProfiles.guest_id, guestId))
    .limit(1)
  if (existing[0]) return false
  await db!
    .insert(guestIdentityProfiles)
    .values({
      guest_id: guestId,
      source_summary: { manual: { last_seen: new Date().toISOString() } } as GuestSourceSummary,
      last_analyzed_at: new Date(),
    })
  c.profiles_created++
  return true
}

async function step1ProfilesForAllGuests() {
  console.log("\n— step 1: ensure profile row for every guest")
  const rows = await db!.select({ id: guests.id }).from(guests)
  for (const r of rows) {
    await ensureProfileForGuest(r.id)
  }
  console.log(`  walked=${rows.length}  created=${c.profiles_created}`)
}

async function step2LinkApplications() {
  console.log("\n— step 2: summarize accepted applications onto profiles")
  const apps = await db!
    .select()
    .from(guestApplications)
    .where(sql`${guestApplications.status} IN ('accepted','approved','linked')`)
  for (const app of apps) {
    const hints: IdentityHints = {
      name: app.name,
      country: app.country ?? null,
      website: null,
    }
    const match = await findGuestMatch(hints)
    if (match.confidence === "low" || match.confidence === "none") {
      c.ambiguous_skipped++
      continue
    }
    if (!match.guest_id) continue

    const summary: GuestApplicationSummary = {
      application_id: app.id,
      story_idea: app.story_idea,
      beyond_job_title: app.beyond_job_title,
      life_changing_moment: app.life_changing_moment,
      why_khat: app.why_khat,
      topics_to_avoid: app.topics_to_avoid,
    }

    const existing = await db!
      .select()
      .from(guestIdentityProfiles)
      .where(eq(guestIdentityProfiles.guest_id, match.guest_id))
      .limit(1)
    if (existing[0]) {
      await db!
        .update(guestIdentityProfiles)
        .set({
          application_summary: summary,
          source_summary: {
            ...((existing[0].source_summary ?? {}) as GuestSourceSummary),
            application: {
              id: app.id,
              received_at:
                app.created_at instanceof Date
                  ? app.created_at.toISOString()
                  : null,
            },
          },
          updated_at: new Date(),
        })
        .where(eq(guestIdentityProfiles.guest_id, match.guest_id))
      c.profiles_updated++
    } else {
      await db!
        .insert(guestIdentityProfiles)
        .values({
          guest_id: match.guest_id,
          application_summary: summary,
          source_summary: {
            application: {
              id: app.id,
              received_at:
                app.created_at instanceof Date
                  ? app.created_at.toISOString()
                  : null,
            },
          } as GuestSourceSummary,
        })
      c.profiles_created++
    }
    c.applications_linked++
  }
  console.log(
    `  walked=${apps.length}  linked=${c.applications_linked}  ambiguous_skipped=${c.ambiguous_skipped}`,
  )
}

async function step3LinkDiscoveryCandidates() {
  console.log("\n— step 3: link promoted discovery candidates to guests")
  const promoted = await db!
    .select()
    .from(guestDiscoveryCandidates)
    .where(eq(guestDiscoveryCandidates.status, "promoted"))
  for (const cand of promoted) {
    if (!cand.promoted_guest_id) continue
    // Make sure a link row exists.
    const existing = await db!
      .select({ id: guestDiscoveryLinks.id })
      .from(guestDiscoveryLinks)
      .where(eq(guestDiscoveryLinks.discovery_candidate_id, cand.id))
      .limit(1)
    if (existing[0]) continue

    await db!
      .insert(guestDiscoveryLinks)
      .values({
        guest_id: cand.promoted_guest_id,
        discovery_candidate_id: cand.id,
        discovery_run_id: cand.discovery_run_id ?? null,
        link_type: "backfill",
        confidence_score: cand.composite_score === null ? null : Number(cand.composite_score),
      })
    c.candidates_linked++
  }
  console.log(`  walked=${promoted.length}  linked=${c.candidates_linked}`)
}

async function step4SummarizeStudioGuestIntelligence() {
  console.log("\n— step 4: summarize studio guest_intelligence onto profiles")
  const records = await db!
    .select()
    .from(studioAnalysisRecords)
    .where(eq(studioAnalysisRecords.kind, "guest_intelligence"))
  for (const r of records) {
    const data = (r.data ?? {}) as {
      detected_name?: string | null
      detected_bio?: string | null
      speaking_style?: string | null
      key_positions?: string[]
      notable_quotes?: Array<{ text: string; context?: string }>
      linked_guest_id?: string | null
    }
    const hints: IdentityHints = {
      name: data.detected_name ?? null,
      bio: data.detected_bio ?? null,
    }
    let guestId: string | null = data.linked_guest_id ?? null
    if (!guestId) {
      const match = await findGuestMatch(hints)
      if (match.confidence === "low" || match.confidence === "none") {
        c.ambiguous_skipped++
        continue
      }
      guestId = match.guest_id
    }
    if (!guestId) continue

    const studio: GuestStudioSignals = {
      detected_bio: data.detected_bio ?? null,
      speaking_style: data.speaking_style ?? null,
      key_positions: data.key_positions ?? [],
      notable_quotes: data.notable_quotes ?? [],
    }
    const existing = await db!
      .select()
      .from(guestIdentityProfiles)
      .where(eq(guestIdentityProfiles.guest_id, guestId))
      .limit(1)
    if (existing[0]) {
      await db!
        .update(guestIdentityProfiles)
        .set({
          studio_signals: studio,
          source_summary: {
            ...((existing[0].source_summary ?? {}) as GuestSourceSummary),
            studio: { sessions: 1, last_seen: new Date().toISOString() },
          },
          updated_at: new Date(),
        })
        .where(eq(guestIdentityProfiles.guest_id, guestId))
      c.profiles_updated++
    } else {
      await db!.insert(guestIdentityProfiles).values({
        guest_id: guestId,
        studio_signals: studio,
        source_summary: {
          studio: { sessions: 1, last_seen: new Date().toISOString() },
        } as GuestSourceSummary,
      })
      c.profiles_created++
    }
    c.studio_summarized++
  }
  console.log(`  walked=${records.length}  summarized=${c.studio_summarized}`)
}

async function step5LinkKhatMapAndCandidates() {
  console.log("\n— step 5: optional pass over khat_map_guest_candidates + guest_candidates")
  // We don't auto-create from these — they're internal candidates,
  // not yet promoted. Just count for visibility.
  const km = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(khatMapGuestCandidates)
  const gc = await db!
    .select({ c: sql<number>`count(*)::int` })
    .from(guestCandidates)
    .where(isNotNull(guestCandidates.id))
  console.log(
    `  khat_map_guest_candidates=${km[0]?.c ?? 0}  guest_candidates=${gc[0]?.c ?? 0}  (skipped — not auto-linked)`,
  )
}

async function main() {
  console.log("Khat Brain Phase 6 — guest identity backfill\n")

  await step1ProfilesForAllGuests()
  await step2LinkApplications()
  await step3LinkDiscoveryCandidates()
  await step4SummarizeStudioGuestIntelligence()
  await step5LinkKhatMapAndCandidates()

  console.log("\n✅ Backfill complete.")
  console.log(`  profiles created:    ${c.profiles_created}`)
  console.log(`  profiles updated:    ${c.profiles_updated}`)
  console.log(`  candidates linked:   ${c.candidates_linked}`)
  console.log(`  applications linked: ${c.applications_linked}`)
  console.log(`  studio summarized:   ${c.studio_summarized}`)
  console.log(`  ambiguous skipped:   ${c.ambiguous_skipped}`)

  // Suppress unused-var lint
  void ensureGuest

  process.exit(0)
}

main().catch((e) => {
  console.error("❌ backfill failed:", e)
  process.exit(1)
})
