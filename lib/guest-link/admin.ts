/**
 * «نسخة الضيف» — the admin panel's read model.
 *
 * Projects its own columns: the token hash never leaves the server, and the
 * questionnaire is returned as-is to ADMIN eyes only (this runs behind the
 * admin page's requireAdmin()).
 */

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { guestEpisodeSuggestions } from "@/lib/db/schema/guest-episode-links"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { guests } from "@/lib/db/schema/guests"
import type {
  GuestEpisodeSuggestion,
  GuestLinkQuestionnaire,
  GuestPrepView,
  GuestSuggestionStatus,
  GuestSuggestionTargetKind,
  GuestSuggestionType,
} from "@/types/database"
import type { PrepV2Payload, SectionKind } from "@/lib/preparation/v2/types"
import { effectiveExpiry, linkAccess, type GuestLinkAccess } from "./access"
import { getActiveLinkForEir, type GuestLinkRow } from "./service"
import {
  guestSectionLabel,
  isGuestSafeQuestion,
  parseGuestPrepView,
  parseGuestRefMap,
  parseSampleOverrides,
  toGuestPrepView,
  type SampleOverrides,
  type ToGuestPrepViewResult,
} from "./view"

export type StaleReason = "prep" | "schedule" | "location" | "content"

export interface SampleCandidate {
  id: string
  section: SectionKind
  section_label: string
  text: string
  must_ask: boolean
  hidden: boolean
  pinned: boolean
  override_text: string | null
  /** In the current preview (after caps). */
  included: boolean
}

export interface GuestLinkAdminState {
  eirId: string
  defaultDisplayName: string
  guestId: string | null
  prepId: string | null
  hasPrepV2: boolean
  link: null | {
    id: string
    guest_display_name: string
    access: GuestLinkAccess
    expires_at: string
    created_at: string
    location_label: string | null
    address: string | null
    map_url: string | null
    has_house_photo: boolean
    show_schedule: boolean
    questionnaire: GuestLinkQuestionnaire | null
    questionnaire_submitted_at: string | null
    has_draft: boolean
    published_at: string | null
    first_opened_at: string | null
    last_opened_at: string | null
    open_count: number
  }
  preview: GuestPrepView | null
  published: GuestPrepView | null
  stale: StaleReason[]
  /** Guest answers arrived after the current prep was generated. */
  answersAfterPrep: boolean
  candidates: SampleCandidate[]
  suggestions: (GuestEpisodeSuggestion & {
    target_label: string | null
    /** Prep section an axis suggestion points at (for «أضف للإعداد»). */
    target_section: SectionKind | null
  })[]
  sections: { kind: SectionKind; label: string }[]
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

/** Pure — which parts of the published snapshot are out of date. */
export function publishStaleness(params: {
  row: Pick<
    GuestLinkRow,
    | "published_at"
    | "published_view"
    | "published_source_prep_id"
    | "published_source_prep_updated_at"
    | "published_schedule_at"
    | "location_updated_at"
  >
  prepId: string | null
  prepUpdatedAt: Date | null
  recordingAt: Date | null
  preview: GuestPrepView | null
}): StaleReason[] {
  const { row } = params
  if (!row.published_at) return []
  const out: StaleReason[] = []
  const t = (d: Date | null | undefined) => (d ? d.getTime() : null)
  if (
    params.prepId !== row.published_source_prep_id ||
    (params.prepUpdatedAt && t(params.prepUpdatedAt) !== t(row.published_source_prep_updated_at))
  ) {
    out.push("prep")
  }
  if (t(params.recordingAt) !== t(row.published_schedule_at)) out.push("schedule")
  if (row.location_updated_at && row.location_updated_at.getTime() > row.published_at.getTime()) {
    out.push("location")
  }
  if (out.length === 0 && params.preview) {
    const pub = parseGuestPrepView(row.published_view)
    if (JSON.stringify(pub) !== JSON.stringify(params.preview)) out.push("content")
  }
  return out
}

export function buildPreview(
  row: GuestLinkRow,
  prep: PrepV2Payload | null,
  recordingAt: Date | null,
): ToGuestPrepViewResult {
  return toGuestPrepView({
    prep,
    overrides: parseSampleOverrides(row.sample_overrides),
    schedule_at: recordingAt,
    show_schedule: row.show_schedule,
    location: {
      location_label: row.location_label,
      address: row.address,
      map_url: row.map_url,
      house_photo: row.house_photo,
    },
  })
}

function sampleCandidates(
  prep: PrepV2Payload | null,
  overrides: SampleOverrides,
  included: Set<string>,
): SampleCandidate[] {
  if (!prep?.question_bank) return []
  return prep.question_bank
    .filter((q) => isGuestSafeQuestion(q))
    .map((q) => ({
      id: q.id,
      section: q.section,
      section_label: guestSectionLabel(prep, q.section),
      text: q.text,
      must_ask: q.priority === "must_ask",
      hidden: Boolean(overrides[q.id]?.hidden),
      pinned: Boolean(overrides[q.id]?.pinned),
      override_text: overrides[q.id]?.text ?? null,
      included: included.has(q.id),
    }))
}

export async function loadEirLinkContext(eirId: string): Promise<{
  guestId: string | null
  guestName: string | null
  recordingAt: Date | null
  prep: { id: string; prep_v2: PrepV2Payload | null; updated_at: Date; guest_name: string | null } | null
} | null> {
  if (!db) return null
  const [eir] = await db
    .select({
      guest_id: episodeIntelligenceRecords.guest_id,
      recording_scheduled_at: episodeIntelligenceRecords.recording_scheduled_at,
      guest_name: guests.name,
    })
    .from(episodeIntelligenceRecords)
    .leftJoin(guests, eq(guests.id, episodeIntelligenceRecords.guest_id))
    .where(eq(episodeIntelligenceRecords.id, eirId))
    .limit(1)
  if (!eir) return null
  const [prep] = await db
    .select({
      id: episodePreparations.id,
      prep_v2: episodePreparations.prep_v2,
      updated_at: episodePreparations.updated_at,
      guest_name: episodePreparations.guest_name,
    })
    .from(episodePreparations)
    .where(eq(episodePreparations.eir_id, eirId))
    .orderBy(desc(episodePreparations.updated_at))
    .limit(1)
  return {
    guestId: eir.guest_id ?? null,
    guestName: eir.guest_name ?? null,
    recordingAt: eir.recording_scheduled_at ?? null,
    prep: prep
      ? {
          id: prep.id,
          prep_v2: (prep.prep_v2 ?? null) as PrepV2Payload | null,
          updated_at: prep.updated_at,
          guest_name: prep.guest_name ?? null,
        }
      : null,
  }
}

export async function getGuestLinkAdminState(eirId: string): Promise<GuestLinkAdminState | null> {
  const ctx = await loadEirLinkContext(eirId)
  if (!ctx || !db) return null
  const prep = ctx.prep?.prep_v2 ?? null
  const row = await getActiveLinkForEir(eirId)

  const sections = (prep?.episode_sections ?? []).map((s) => ({
    kind: s.kind,
    label: guestSectionLabel(prep!, s.kind),
  }))

  const base: GuestLinkAdminState = {
    eirId,
    defaultDisplayName: ctx.guestName ?? ctx.prep?.guest_name ?? "",
    guestId: ctx.guestId,
    prepId: ctx.prep?.id ?? null,
    hasPrepV2: Boolean(prep),
    link: null,
    preview: null,
    published: null,
    stale: [],
    answersAfterPrep: false,
    candidates: [],
    suggestions: [],
    sections,
  }
  if (!row) return base

  const { view: preview, refs } = buildPreview(row, prep, ctx.recordingAt)
  const included = new Set(Object.values(refs.samples).map((s) => s.question_id))
  const overrides = parseSampleOverrides(row.sample_overrides)

  const suggestionRows = await db
    .select()
    .from(guestEpisodeSuggestions)
    .where(eq(guestEpisodeSuggestions.link_id, row.id))
    .orderBy(desc(guestEpisodeSuggestions.created_at))
    .limit(200)

  const refMap = parseGuestRefMap(row.published_ref_map)
  const generatedAt = prep?.generated_at ? new Date(prep.generated_at) : null
  const submittedAt = row.questionnaire_submitted_at

  return {
    ...base,
    link: {
      id: row.id,
      guest_display_name: row.guest_display_name,
      access: linkAccess(row, ctx.recordingAt),
      expires_at: effectiveExpiry(ctx.recordingAt, row.expires_at).toISOString(),
      created_at: row.created_at.toISOString(),
      location_label: row.location_label,
      address: row.address,
      map_url: row.map_url,
      has_house_photo: Boolean(row.house_photo),
      show_schedule: row.show_schedule,
      questionnaire: (row.questionnaire ?? null) as GuestLinkQuestionnaire | null,
      questionnaire_submitted_at: iso(submittedAt),
      has_draft: Boolean(row.questionnaire_draft),
      published_at: iso(row.published_at),
      first_opened_at: iso(row.first_opened_at),
      last_opened_at: iso(row.last_opened_at),
      open_count: row.open_count,
    },
    preview,
    published: parseGuestPrepView(row.published_view),
    stale: publishStaleness({
      row,
      prepId: ctx.prep?.id ?? null,
      prepUpdatedAt: ctx.prep?.updated_at ?? null,
      recordingAt: ctx.recordingAt,
      preview,
    }),
    answersAfterPrep: Boolean(
      submittedAt && generatedAt && !isNaN(generatedAt.getTime()) && submittedAt > generatedAt,
    ),
    candidates: sampleCandidates(prep, overrides, included),
    suggestions: suggestionRows.map((s) => ({
      id: s.id,
      link_id: s.link_id,
      eir_id: s.eir_id,
      target_kind: s.target_kind as GuestSuggestionTargetKind,
      target_ref: s.target_ref,
      original_text: s.original_text,
      suggestion_type: s.suggestion_type as GuestSuggestionType,
      body: s.body,
      status: s.status as GuestSuggestionStatus,
      decided_by: s.decided_by,
      decided_at: iso(s.decided_at),
      created_at: s.created_at.toISOString(),
      target_label: s.original_text,
      target_section: s.target_ref ? (refMap.axes[s.target_ref]?.section ?? null) : null,
    })),
  }
}
