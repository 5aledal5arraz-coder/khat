/**
 * Client-safe types + labels for push preview.
 *
 * Split out from `push-preview.ts` so client components (PushButton)
 * can import labels + types without dragging server-only modules
 * (revalidatePath, drizzle queries) into the browser bundle.
 *
 * The server helper `getPushPreview` lives in `push-preview.ts` and
 * imports types from here; the result it returns is `PushPreview` which
 * client components can also reference safely from this file.
 */

export type PushPreviewField =
  | "title"
  | "description"
  | "hero_summary"
  | "full_summary"
  | "takeaways"
  | "quotes"
  | "resources"
  | "timestamps"

export const PUSH_FIELD_LABEL_AR: Record<PushPreviewField, string> = {
  title: "العنوان",
  description: "الوصف",
  hero_summary: "الملخّص الرئيسي",
  full_summary: "الملخّص الكامل",
  takeaways: "النقاط الرئيسية",
  quotes: "الاقتباسات",
  resources: "المراجع",
  timestamps: "الفهرس الزمني",
}

export interface PushPreview {
  ok: boolean
  reason?:
    | "no_session"
    | "no_package"
    | "package_not_ready"
    | "no_episode"
    | "db_unavailable"
  message?: string
  /** Fields the package has data for — one click would push these. */
  pushableFields: PushPreviewField[]
  /** Subset that would replace non-empty values already on the episode. */
  overwritingFields: PushPreviewField[]
  episodeId: string | null
}
