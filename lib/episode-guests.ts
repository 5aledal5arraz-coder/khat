import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import type { Guest } from "@/types/database"

const ASSIGNMENTS_PATH = path.join(process.cwd(), "config", "episode-guest-assignments.json")

// episodeId -> guestId
export type GuestAssignments = Record<string, string>

export async function getGuestAssignments(): Promise<GuestAssignments> {
  try {
    const data = await readFile(ASSIGNMENTS_PATH, "utf-8")
    return JSON.parse(data) as GuestAssignments
  } catch {
    return {}
  }
}

export async function saveGuestAssignments(assignments: GuestAssignments): Promise<void> {
  const configDir = path.dirname(ASSIGNMENTS_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(ASSIGNMENTS_PATH, JSON.stringify(assignments, null, 2), "utf-8")
}

export async function assignGuestToEpisode(episodeId: string, guestId: string | null): Promise<void> {
  const assignments = await getGuestAssignments()
  if (guestId) {
    assignments[episodeId] = guestId
  } else {
    delete assignments[episodeId]
  }
  await saveGuestAssignments(assignments)
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
