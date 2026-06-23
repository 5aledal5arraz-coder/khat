/**
 * Guest knowledge runner (Studio redesign, Goal 2).
 *
 * Aggregates a guest's accumulated signals (identity profile) + their episodes
 * (via the multi-guest junction AND the legacy guest_id) + their canonical
 * quotes, synthesizes the public knowledge doc, and persists it to
 * guest_identity_profiles.public_knowledge. Powers the public guest page.
 */

import { db } from "@/lib/db"
import { eq, inArray } from "drizzle-orm"
import { episodes } from "@/lib/db/schema/episodes"
import { quotes as quotesTable } from "@/lib/db/schema/episodes"
import { guests } from "@/lib/db/schema/guests"
import { getGuestIdentityProfile, updateGuestIdentityProfile } from "@/lib/guests/canonical"
import { getEpisodesForGuest } from "@/lib/episodes/episode-graph"
import { generateGuestKnowledge } from "@/lib/ai/guest-knowledge"
import type {
  GuestPublicKnowledge,
  GuestStudioSignals,
  GuestStoryArcs,
  GuestSpeakingStyle,
} from "@/lib/db/schema/guest-identity"

export async function runGuestKnowledgeForGuest(
  guestId: string,
): Promise<{ success: boolean; data?: GuestPublicKnowledge; error?: string }> {
  if (!db) return { success: false, error: "Database not available" }

  const guestRows = await db.select().from(guests).where(eq(guests.id, guestId)).limit(1)
  const guest = guestRows[0]
  if (!guest) return { success: false, error: "الضيف غير موجود" }

  const profile = await getGuestIdentityProfile(guestId)

  // Episodes: union of the multi-guest junction and the legacy primary link.
  const junctionIds = await getEpisodesForGuest(guestId)
  const primaryRows = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.guest_id, guestId))
  const episodeIds = Array.from(new Set([...junctionIds, ...primaryRows.map((r) => r.id)]))

  const episodeTitles =
    episodeIds.length > 0
      ? (
          await db
            .select({ title: episodes.title, release_date: episodes.release_date })
            .from(episodes)
            .where(inArray(episodes.id, episodeIds))
        )
          .sort((a, b) => (b.release_date > a.release_date ? 1 : -1))
          .map((r) => r.title)
      : []

  const quoteRows = await db
    .select({ text: quotesTable.text, theme: quotesTable.theme })
    .from(quotesTable)
    .where(eq(quotesTable.guest_id, guestId))

  const studio = (profile?.studio_signals ?? null) as GuestStudioSignals | null
  const arcs = (profile?.story_arcs ?? null) as GuestStoryArcs | null
  const style = (profile?.speaking_style ?? null) as GuestSpeakingStyle | null

  const result = await generateGuestKnowledge({
    guestName: guest.name,
    episodeTitles,
    detectedBio: studio?.detected_bio ?? null,
    keyPositions: studio?.key_positions ?? [],
    storyArcs: arcs,
    speakingStyle: style,
    quotes: quoteRows.map((q) => ({ text: q.text, theme: q.theme })),
    existingBio: guest.bio ?? null,
  })

  if (!result.success || !result.data) {
    return { success: false, error: result.error || "فشل توليد معرفة الضيف" }
  }

  const knowledge: GuestPublicKnowledge = {
    ...result.data,
    generated_at: new Date().toISOString(),
  }

  await updateGuestIdentityProfile(guestId, { public_knowledge: knowledge })
  return { success: true, data: knowledge }
}

/** Read the persisted public knowledge for a guest, if any. */
export async function getGuestPublicKnowledge(guestId: string): Promise<GuestPublicKnowledge | null> {
  const profile = await getGuestIdentityProfile(guestId)
  return (profile?.public_knowledge as GuestPublicKnowledge | null) ?? null
}
