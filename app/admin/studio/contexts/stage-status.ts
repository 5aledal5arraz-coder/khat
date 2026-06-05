/**
 * Canonical Studio stage status used across all client contexts and UI surfaces.
 *
 * One vocabulary, one source of truth — replaces the previous mix of
 * `not_fetched|fetching|...` and `idle|generating|...` and `idle|processing|...`
 * vocabularies that each context invented for itself.
 */
export type StudioStageStatus = "idle" | "generating" | "ready" | "error"

/**
 * Normalize a raw status string from the database (or any other source) into the
 * canonical StudioStageStatus. Used at API/DB boundaries — never inside the UI.
 */
export function normalizeStageStatus(raw: string | null | undefined): StudioStageStatus {
  if (!raw) return "idle"
  if (raw === "ready") return "ready"
  if (raw === "error") return "error"
  if (raw === "generating" || raw === "fetching" || raw === "processing") return "generating"
  return "idle"
}
