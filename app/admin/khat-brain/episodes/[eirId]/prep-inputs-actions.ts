"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { getAdminAuthUser, requireActionRole } from "@/lib/api-utils"
import { db } from "@/lib/db"
import { episodePreparations } from "@/lib/db/schema/preparation"

export type PrepInputsField =
  | "title"
  | "guest_name"
  | "short_description"
  | "episode_goal"
  | "key_questions"

export interface SavePrepInputsInput {
  preparationId: string
  /** Partial patch — only the fields that changed are sent. */
  patch: Partial<{
    title: string
    guest_name: string | null
    short_description: string | null
    episode_goal: string | null
    key_questions: string[]
  }>
}

export type SavePrepInputsResult =
  | { ok: true; updatedAt: string }
  | { ok: false; code: "validation"; message: string; field?: PrepInputsField }
  | { ok: false; code: "not_found"; message: string }
  | { ok: false; code: "server_error"; message: string }

/**
 * UX-7 Phase B — workspace-native prep inputs save.
 *
 * Writes to `episode_preparations` columns (title / guest_name /
 * short_description / episode_goal / key_questions). Validates each
 * field at the action boundary so the legacy page and the workspace
 * tab share the same write contract.
 *
 * Triggers `revalidatePath` for both the workspace AND the legacy
 * preparation page so the two surfaces stay in sync regardless of
 * which one the operator is using.
 */
export async function savePrepInputsAction(
  input: SavePrepInputsInput,
): Promise<SavePrepInputsResult> {
  try {
    const gate = await requireActionRole("EDITOR")
    if (!gate.ok) return { ok: false, code: "server_error", message: gate.error }
    const admin = await getAdminAuthUser()
    if (!db) return { ok: false, code: "server_error", message: "DB unavailable" }

    const row = await db
      .select({
        id: episodePreparations.id,
        eir_id: episodePreparations.eir_id,
      })
      .from(episodePreparations)
      .where(eq(episodePreparations.id, input.preparationId))
      .limit(1)
    if (!row[0]) {
      return { ok: false, code: "not_found", message: "Preparation not found" }
    }

    const patch: Record<string, unknown> = {}
    if (input.patch.title !== undefined) {
      const t = input.patch.title.trim()
      if (t.length === 0) {
        return {
          ok: false,
          code: "validation",
          field: "title",
          message: "العنوان لا يمكن أن يكون فارغاً",
        }
      }
      if (t.length > 200) {
        return {
          ok: false,
          code: "validation",
          field: "title",
          message: "العنوان طويل جداً (الحد 200 حرف)",
        }
      }
      patch.title = t
    }
    if (input.patch.guest_name !== undefined) {
      const v = input.patch.guest_name?.trim() ?? null
      patch.guest_name = v && v.length > 0 ? v : null
    }
    if (input.patch.short_description !== undefined) {
      patch.short_description = input.patch.short_description?.trim() || null
    }
    if (input.patch.episode_goal !== undefined) {
      patch.episode_goal = input.patch.episode_goal?.trim() || null
    }
    if (input.patch.key_questions !== undefined) {
      const cleaned = input.patch.key_questions
        .map((q) => (typeof q === "string" ? q.trim() : ""))
        .filter((q) => q.length > 0)
      if (cleaned.length > 50) {
        return {
          ok: false,
          code: "validation",
          field: "key_questions",
          message: "عدد الأسئلة يتجاوز الحد الأعلى (50)",
        }
      }
      patch.key_questions = cleaned
    }

    if (Object.keys(patch).length === 0) {
      // No-op save — return ok so the autosave manager clears state.
      return { ok: true, updatedAt: new Date().toISOString() }
    }

    patch.updated_at = new Date()
    void admin // reserved for an audit log hook in a future phase

    await db
      .update(episodePreparations)
      .set(patch)
      .where(eq(episodePreparations.id, input.preparationId))

    if (row[0].eir_id) {
      revalidatePath(`/admin/khat-brain/episodes/${row[0].eir_id}`)
    }
    revalidatePath(`/admin/preparation/${input.preparationId}`)

    return { ok: true, updatedAt: new Date().toISOString() }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}
