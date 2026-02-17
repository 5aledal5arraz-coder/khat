import { createConfigStore } from "@/lib/config-store"
import { createClient } from "@/lib/supabase/server"
import type { EpisodeSectionsConfig } from "@/types/episodes"

const USE_SUPABASE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
)

const defaultConfig: EpisodeSectionsConfig = {
  sections: [
    { id: "season-1", label: "الموسم الأول", order: 0, color: "#3b82f6" },
    { id: "season-2", label: "الموسم الثاني", order: 1, color: "#8b5cf6" },
    { id: "clips", label: "مقاطع", order: 2, color: "#f59e0b" },
    { id: "unpublished", label: "محتوى غير منشور", order: 3, color: "#6b7280" },
  ],
  assignments: {},
  hiddenEpisodes: [],
  deletedEpisodes: [],
}

const store = createConfigStore<EpisodeSectionsConfig>("episode-sections.json", defaultConfig)

export async function getSectionsConfig(): Promise<EpisodeSectionsConfig> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()
      const [sectionsRes, assignmentsRes, visibilityRes] = await Promise.all([
        supabase.from("episode_sections").select("id, label, \"order\", color, hidden").order("order"),
        supabase.from("episode_section_assignments").select("episode_id, section_id"),
        supabase.from("episode_visibility").select("episode_id, visibility"),
      ])

      if (!sectionsRes.error && sectionsRes.data) {
        const sections = sectionsRes.data.map((s) => ({
          id: s.id,
          label: s.label,
          order: s.order,
          color: s.color ?? undefined,
          hidden: s.hidden,
        }))

        const assignments: Record<string, string> = {}
        if (!assignmentsRes.error && assignmentsRes.data) {
          for (const row of assignmentsRes.data) {
            assignments[row.episode_id] = row.section_id
          }
        }

        const hiddenEpisodes: string[] = []
        const deletedEpisodes: string[] = []
        if (!visibilityRes.error && visibilityRes.data) {
          for (const row of visibilityRes.data) {
            if (row.visibility === "hidden") hiddenEpisodes.push(row.episode_id)
            else if (row.visibility === "deleted") deletedEpisodes.push(row.episode_id)
          }
        }

        return { sections, assignments, hiddenEpisodes, deletedEpisodes }
      }
      if (sectionsRes.error) console.error("getSectionsConfig DB error:", sectionsRes.error.message)
    } catch (e) {
      console.error("getSectionsConfig DB exception:", e)
    }
  }

  const config = await store.read()
  if (!config.hiddenEpisodes) config.hiddenEpisodes = []
  if (!config.deletedEpisodes) config.deletedEpisodes = []
  return config
}

export async function getHiddenEpisodeIds(): Promise<Set<string>> {
  const config = await getSectionsConfig()
  const hidden = new Set([...config.hiddenEpisodes, ...config.deletedEpisodes])
  // Also collect episodes assigned to hidden sections
  const hiddenSectionIds = new Set(
    config.sections.filter((s) => s.hidden).map((s) => s.id)
  )
  for (const [epId, secId] of Object.entries(config.assignments)) {
    if (hiddenSectionIds.has(secId)) {
      hidden.add(epId)
    }
  }
  return hidden
}

export async function saveSectionsConfig(config: EpisodeSectionsConfig): Promise<void> {
  if (USE_SUPABASE) {
    try {
      const supabase = await createClient()

      // 1. Upsert sections (delete removed ones)
      const sectionRows = config.sections.map((s) => ({
        id: s.id,
        label: s.label,
        order: s.order,
        color: s.color || null,
        hidden: s.hidden || false,
      }))

      // Get existing section IDs to find deleted ones
      const { data: existingSections } = await supabase.from("episode_sections").select("id")
      const newIds = new Set(config.sections.map((s) => s.id))
      const toDelete = (existingSections || []).filter((s) => !newIds.has(s.id)).map((s) => s.id)

      if (toDelete.length > 0) {
        await supabase.from("episode_sections").delete().in("id", toDelete)
      }
      if (sectionRows.length > 0) {
        const { error: secErr } = await supabase.from("episode_sections").upsert(sectionRows)
        if (secErr) console.error("saveSectionsConfig sections error:", secErr.message)
      }

      // 2. Replace assignments
      await supabase.from("episode_section_assignments").delete().neq("episode_id", "")
      const assignRows = Object.entries(config.assignments).map(([episodeId, sectionId]) => ({
        episode_id: episodeId,
        section_id: sectionId,
      }))
      if (assignRows.length > 0) {
        const { error: assErr } = await supabase.from("episode_section_assignments").upsert(assignRows)
        if (assErr) console.error("saveSectionsConfig assignments error:", assErr.message)
      }

      // 3. Replace visibility
      await supabase.from("episode_visibility").delete().neq("episode_id", "")
      const visRows = [
        ...(config.hiddenEpisodes || []).map((id) => ({ episode_id: id, visibility: "hidden" as const })),
        ...(config.deletedEpisodes || []).map((id) => ({ episode_id: id, visibility: "deleted" as const })),
      ]
      if (visRows.length > 0) {
        const { error: visErr } = await supabase.from("episode_visibility").upsert(visRows)
        if (visErr) console.error("saveSectionsConfig visibility error:", visErr.message)
      }

      return
    } catch (e) {
      console.error("saveSectionsConfig DB exception:", e)
    }
  }
  await store.write(config)
}
