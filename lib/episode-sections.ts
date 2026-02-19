import { createConfigStore } from "@/lib/config-store"
import { pool, USE_DB } from "@/lib/db"
import type { EpisodeSectionsConfig } from "@/types/episodes"

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
  if (USE_DB) {
    try {
      const [sectionsRes, assignmentsRes, visibilityRes] = await Promise.all([
        pool!.query(`SELECT id, label, "order", color, hidden FROM episode_sections ORDER BY "order"`),
        pool!.query(`SELECT episode_id, section_id FROM episode_section_assignments`),
        pool!.query(`SELECT episode_id, visibility FROM episode_visibility`),
      ])

      if (sectionsRes.rows.length > 0) {
        const sections = sectionsRes.rows.map((s) => ({
          id: s.id,
          label: s.label,
          order: s.order,
          color: s.color ?? undefined,
          hidden: s.hidden,
        }))

        const assignments: Record<string, string> = {}
        for (const row of assignmentsRes.rows) {
          assignments[row.episode_id] = row.section_id
        }

        const hiddenEpisodes: string[] = []
        const deletedEpisodes: string[] = []
        for (const row of visibilityRes.rows) {
          if (row.visibility === "hidden") hiddenEpisodes.push(row.episode_id)
          else if (row.visibility === "deleted") deletedEpisodes.push(row.episode_id)
        }

        return { sections, assignments, hiddenEpisodes, deletedEpisodes }
      }
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
  if (USE_DB) {
    try {
      // Use a single client for transaction
      const client = await pool!.connect()
      try {
        await client.query("BEGIN")

        // 1. Upsert sections (delete removed ones)
        const { rows: existingSections } = await client.query(`SELECT id FROM episode_sections`)
        const newIds = new Set(config.sections.map((s) => s.id))
        const toDelete = existingSections.filter((s) => !newIds.has(s.id)).map((s) => s.id)

        if (toDelete.length > 0) {
          await client.query(`DELETE FROM episode_sections WHERE id = ANY($1)`, [toDelete])
        }
        for (const s of config.sections) {
          await client.query(
            `INSERT INTO episode_sections (id, label, "order", color, hidden)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               label = EXCLUDED.label,
               "order" = EXCLUDED."order",
               color = EXCLUDED.color,
               hidden = EXCLUDED.hidden`,
            [s.id, s.label, s.order, s.color || null, s.hidden || false]
          )
        }

        // 2. Replace assignments
        await client.query(`DELETE FROM episode_section_assignments`)
        const assignEntries = Object.entries(config.assignments)
        if (assignEntries.length > 0) {
          const values: unknown[] = []
          const placeholders: string[] = []
          let i = 1
          for (const [episodeId, sectionId] of assignEntries) {
            placeholders.push(`($${i}, $${i + 1})`)
            values.push(episodeId, sectionId)
            i += 2
          }
          await client.query(
            `INSERT INTO episode_section_assignments (episode_id, section_id) VALUES ${placeholders.join(", ")}`,
            values
          )
        }

        // 3. Replace visibility
        await client.query(`DELETE FROM episode_visibility`)
        const visRows = [
          ...(config.hiddenEpisodes || []).map((id) => ({ episode_id: id, visibility: "hidden" })),
          ...(config.deletedEpisodes || []).map((id) => ({ episode_id: id, visibility: "deleted" })),
        ]
        if (visRows.length > 0) {
          const values: unknown[] = []
          const placeholders: string[] = []
          let i = 1
          for (const v of visRows) {
            placeholders.push(`($${i}, $${i + 1})`)
            values.push(v.episode_id, v.visibility)
            i += 2
          }
          await client.query(
            `INSERT INTO episode_visibility (episode_id, visibility) VALUES ${placeholders.join(", ")}`,
            values
          )
        }

        await client.query("COMMIT")
        return
      } catch (txErr) {
        await client.query("ROLLBACK")
        throw txErr
      } finally {
        client.release()
      }
    } catch (e) {
      console.error("saveSectionsConfig DB exception:", e)
    }
  }
  await store.write(config)
}
