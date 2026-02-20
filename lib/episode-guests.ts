import { createConfigStore } from "@/lib/config-store"
import { db, USE_DB } from "@/lib/db"
import { episodeGuestAssignments } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { Guest } from "@/types/database"

// episodeId -> guestId
export type GuestAssignments = Record<string, string>

const store = createConfigStore<GuestAssignments>("episode-guest-assignments.json", {})

export async function getGuestAssignments(): Promise<GuestAssignments> {
  if (USE_DB) {
    try {
      const rows = await db!.select().from(episodeGuestAssignments)
      const assignments: GuestAssignments = {}
      for (const row of rows) {
        assignments[row.episode_id] = row.guest_id
      }
      return assignments
    } catch (e) {
      console.error("getGuestAssignments DB exception:", e)
    }
  }
  return store.read()
}

export async function saveGuestAssignments(assignments: GuestAssignments): Promise<void> {
  if (USE_DB) {
    try {
      // Replace all
      await db!.delete(episodeGuestAssignments)
      const entries = Object.entries(assignments)
      if (entries.length > 0) {
        await db!.insert(episodeGuestAssignments).values(
          entries.map(([episodeId, guestId]) => ({
            episode_id: episodeId,
            guest_id: guestId,
          }))
        )
      }
      return
    } catch (e) {
      console.error("saveGuestAssignments DB exception:", e)
    }
  }
  await store.write(assignments)
}

export async function assignGuestToEpisode(episodeId: string, guestId: string | null): Promise<void> {
  if (USE_DB) {
    try {
      if (guestId) {
        await db!.insert(episodeGuestAssignments).values({
          episode_id: episodeId,
          guest_id: guestId,
        }).onConflictDoUpdate({
          target: episodeGuestAssignments.episode_id,
          set: { guest_id: guestId },
        })
      } else {
        await db!.delete(episodeGuestAssignments)
          .where(eq(episodeGuestAssignments.episode_id, episodeId))
      }
      return
    } catch (e) {
      console.error("assignGuestToEpisode DB exception:", e)
    }
  }

  const assignments = await store.read()
  if (guestId) {
    assignments[episodeId] = guestId
  } else {
    delete assignments[episodeId]
  }
  await store.write(assignments)
}

/**
 * Apply admin guest assignments to episodes.
 * If an episode has an admin-assigned guest, it overrides the auto-detected one.
 */
export function applyGuestAssignments<T extends { id: string; guest_id?: string | null; guest?: Guest | null }>(
  episodes: T[],
  assignments: GuestAssignments,
  guestList: Guest[]
): T[] {
  if (Object.keys(assignments).length === 0) return episodes

  const guestMap = new Map(guestList.map((g) => [g.id, g]))

  return episodes.map((ep) => {
    const assignedGuestId = assignments[ep.id]
    if (assignedGuestId) {
      const guest = guestMap.get(assignedGuestId)
      if (guest) {
        return { ...ep, guest_id: guest.id, guest }
      }
    }
    return ep
  })
}
