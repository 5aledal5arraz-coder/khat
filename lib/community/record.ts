/** The community contribution record — submission + AI triage + relationship history. */

import { getCommunityContributionById } from "./queries"
import { getActivities, getNotes, getTasks } from "@/lib/crm"
import type { CommunityContribution, CrmActivity, CrmNote, CrmTask } from "@/types/database"

export interface CommunityRecord {
  contribution: CommunityContribution
  activities: CrmActivity[]
  notes: CrmNote[]
  tasks: CrmTask[]
}

export async function getCommunityRecord(id: string): Promise<CommunityRecord | null> {
  const contribution = await getCommunityContributionById(id)
  if (!contribution) return null
  const [activities, notes, tasks] = await Promise.all([
    getActivities("community", id),
    getNotes("community", id),
    getTasks("community", id),
  ])
  return { contribution, activities, notes, tasks }
}
