import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { Guest } from "@/types/database"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

// episodeId -> guestId
export type GuestAssignments = Record<string, string>

const store = createConfigStore<GuestAssignments>("episode-guest-assignments.json", {})

export async function getGuestAssignments(): Promise<GuestAssignments> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from("episode_guest_assignments")
        .select("episode_id, guest_id")

      if (!error && data) {
        const assignments: GuestAssignments = {}
        for (const row of data) {
          assignments[row.episode_id] = row.guest_id
        }
        return assignments
      }
      if (error) console.error("getGuestAssignments DB error:", error.message)
    } catch (e) {
      console.error("getGuestAssignments DB exception:", e)
    }
  }
  return store.read()
}

export async function saveGuestAssignments(assignments: GuestAssignments): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      // Replace all
      await supabase.from("episode_guest_assignments").delete().neq("episode_id", "")
      const rows = Object.entries(assignments).map(([episodeId, guestId]) => ({
        episode_id: episodeId,
        guest_id: guestId,
      }))
      if (rows.length > 0) {
        const { error } = await supabase.from("episode_guest_assignments").upsert(rows)
        if (error) console.error("saveGuestAssignments DB error:", error.message)
        else return
      } else {
        return
      }
    } catch (e) {
      console.error("saveGuestAssignments DB exception:", e)
    }
  }
  await store.write(assignments)
}

export async function assignGuestToEpisode(episodeId: string, guestId: string | null): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      if (guestId) {
        const { error } = await supabase.from("episode_guest_assignments").upsert({
          episode_id: episodeId,
          guest_id: guestId,
        })
        if (!error) return
        console.error("assignGuestToEpisode DB error:", error.message)
      } else {
        const { error } = await supabase
          .from("episode_guest_assignments")
          .delete()
          .eq("episode_id", episodeId)
        if (!error) return
        console.error("assignGuestToEpisode DB error:", error.message)
      }
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
