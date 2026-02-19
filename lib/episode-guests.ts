import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
import type { Guest } from "@/types/database"

// episodeId -> guestId
export type GuestAssignments = Record<string, string>

const store = createConfigStore<GuestAssignments>("episode-guest-assignments.json", {})

export async function getGuestAssignments(): Promise<GuestAssignments> {
  if (USE_DB) {
    try {
      const { rows } = await pool!.query(
        `SELECT episode_id, guest_id FROM episode_guest_assignments`
      )
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
      await pool!.query(`DELETE FROM episode_guest_assignments`)
      const entries = Object.entries(assignments)
      if (entries.length > 0) {
        const values: unknown[] = []
        const placeholders: string[] = []
        let i = 1
        for (const [episodeId, guestId] of entries) {
          placeholders.push(`($${i}, $${i + 1})`)
          values.push(episodeId, guestId)
          i += 2
        }
        await pool!.query(
          `INSERT INTO episode_guest_assignments (episode_id, guest_id) VALUES ${placeholders.join(", ")}`,
          values
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
        await pool!.query(
          `INSERT INTO episode_guest_assignments (episode_id, guest_id)
           VALUES ($1, $2)
           ON CONFLICT (episode_id) DO UPDATE SET guest_id = EXCLUDED.guest_id`,
          [episodeId, guestId]
        )
      } else {
        await pool!.query(
          `DELETE FROM episode_guest_assignments WHERE episode_id = $1`,
          [episodeId]
        )
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
