/**
 * «نسخة الضيف» — data access for the guest link.
 *
 * Guest-side functions take a link row the route already resolved from the
 * token, and every write repeats the "still usable" condition in its WHERE
 * (status active, not revoked) so a link revoked between read and write
 * cannot be written through.
 *
 * Nothing here returns the token hash to a caller that renders; the admin
 * summary (lib/guest-link/admin.ts) projects its own columns.
 */

import { and, desc, eq, isNull, sql, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { guestEpisodeLinks, guestEpisodeSuggestions } from "@/lib/db/schema/guest-episode-links"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import type {
  GuestLinkQuestionnaire,
  GuestLinkQuestionnaireDraft,
  GuestOwnSuggestion,
  GuestPrepView,
} from "@/types/database"
import {
  fallbackExpiry,
  generateGuestLinkToken,
  hashGuestLinkToken,
  isPlausibleToken,
} from "./access"
import { parseGuestRefMap } from "./view"
import { GUEST_SUGGESTION_LIMITS, type GuestSuggestionInput } from "@/lib/validation/guest-link"

export type GuestLinkRow = typeof guestEpisodeLinks.$inferSelect

export interface ResolvedGuestLink {
  row: GuestLinkRow
  recordingAt: Date | null
}

function requireDb() {
  if (!db) throw new Error("Database not available")
  return db
}

/** Still-usable condition, repeated in every guest-side write. */
function usable(linkId: string) {
  return and(
    eq(guestEpisodeLinks.id, linkId),
    eq(guestEpisodeLinks.status, "active"),
    isNull(guestEpisodeLinks.revoked_at),
  )
}

// ─── Resolve ─────────────────────────────────────────────────────────────

export async function findGuestLinkByToken(raw: string): Promise<ResolvedGuestLink | null> {
  if (!db || !isPlausibleToken(raw)) return null
  const rows = await db
    .select({
      link: guestEpisodeLinks,
      recording_scheduled_at: episodeIntelligenceRecords.recording_scheduled_at,
    })
    .from(guestEpisodeLinks)
    .leftJoin(
      episodeIntelligenceRecords,
      eq(episodeIntelligenceRecords.id, guestEpisodeLinks.eir_id),
    )
    .where(eq(guestEpisodeLinks.token_hash, hashGuestLinkToken(raw)))
    .limit(1)
  const r = rows[0]
  if (!r) return null
  return { row: r.link, recordingAt: r.recording_scheduled_at ?? null }
}

/** Counts an open. The caller reads the previous `last_opened_at` off the row it already has. */
export async function recordGuestOpen(linkId: string): Promise<void> {
  await requireDb()
    .update(guestEpisodeLinks)
    .set({
      open_count: sql`${guestEpisodeLinks.open_count} + 1`,
      first_opened_at: sql`COALESCE(${guestEpisodeLinks.first_opened_at}, now())`,
      last_opened_at: new Date(),
    })
    .where(usable(linkId))
}

// ─── Questionnaire ──────────────────────────────────────────────────────

export async function saveGuestDraft(
  linkId: string,
  step: number,
  draft: GuestLinkQuestionnaireDraft,
): Promise<boolean> {
  const rows = await requireDb()
    .update(guestEpisodeLinks)
    .set({
      questionnaire_draft: draft as Record<string, unknown>,
      questionnaire_draft_step: step,
      updated_at: new Date(),
    })
    .where(usable(linkId))
    .returning({ id: guestEpisodeLinks.id })
  return rows.length > 0
}

export async function submitGuestQuestionnaire(
  linkId: string,
  q: GuestLinkQuestionnaire,
): Promise<boolean> {
  const rows = await requireDb()
    .update(guestEpisodeLinks)
    .set({
      questionnaire: q as unknown as Record<string, unknown>,
      questionnaire_submitted_at: new Date(),
      questionnaire_draft: null,
      questionnaire_draft_step: null,
      updated_at: new Date(),
    })
    .where(usable(linkId))
    .returning({ id: guestEpisodeLinks.id })
  return rows.length > 0
}

export async function markGuestWelcomeSeen(linkId: string): Promise<boolean> {
  const rows = await requireDb()
    .update(guestEpisodeLinks)
    .set({ welcome_seen_at: sql`COALESCE(${guestEpisodeLinks.welcome_seen_at}, now())` })
    .where(and(usable(linkId), sql`${guestEpisodeLinks.questionnaire_submitted_at} IS NOT NULL`))
    .returning({ id: guestEpisodeLinks.id })
  return rows.length > 0
}

// ─── Suggestions (guest side) ───────────────────────────────────────────

export type CreateSuggestionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_published" | "bad_target" | "too_many" | "gone" }

/**
 * Resolve the opaque target against the PUBLISHED snapshot and copy the text
 * the guest was looking at server-side — the client never supplies it.
 */
export function resolveSuggestionTarget(
  input: Pick<GuestSuggestionInput, "target_kind" | "target_ref">,
  refMapRaw: unknown,
): { ok: true; original_text: string | null } | { ok: false } {
  if (input.target_kind === "general") return { ok: true, original_text: null }
  const refs = parseGuestRefMap(refMapRaw)
  const axis = input.target_ref ? refs.axes[input.target_ref] : undefined
  if (!axis) return { ok: false }
  return { ok: true, original_text: axis.label }
}

export async function createGuestSuggestion(
  row: GuestLinkRow,
  input: GuestSuggestionInput,
): Promise<CreateSuggestionResult> {
  const d = requireDb()
  if (!row.published_view) return { ok: false, reason: "not_published" }
  const target = resolveSuggestionTarget(input, row.published_ref_map)
  if (!target.ok) return { ok: false, reason: "bad_target" }

  const [{ n }] = await d
    .select({ n: sql<string>`count(*)` })
    .from(guestEpisodeSuggestions)
    .where(
      and(
        eq(guestEpisodeSuggestions.link_id, row.id),
        eq(guestEpisodeSuggestions.status, "new"),
      ),
    )
  // `count()` comes back as a STRING from pg — Number() it, never trust the generic.
  if (Number(n) >= GUEST_SUGGESTION_LIMITS.MAX_PENDING_PER_LINK) {
    return { ok: false, reason: "too_many" }
  }

  const inserted = await d
    .insert(guestEpisodeSuggestions)
    .values({
      link_id: row.id,
      eir_id: row.eir_id,
      target_kind: input.target_kind,
      target_ref: input.target_ref,
      original_text: target.original_text,
      suggestion_type: input.suggestion_type,
      body: input.body,
      status: "new",
    })
    .returning({ id: guestEpisodeSuggestions.id })
  return inserted[0] ? { ok: true, id: inserted[0].id } : { ok: false, reason: "gone" }
}

/**
 * The guest's own suggestions, with the tag the guest may see. Rejection is
 * invisible: a rejected row simply carries no tag. «تم الأخذ باقتراحك» shows
 * once — the caller marks those rows notified after rendering them.
 */
export function ownSuggestionTag(s: {
  status: string
  guest_notified_at: Date | null
}): GuestOwnSuggestion["tag"] {
  if (s.status === "new") return "received"
  if (s.status === "accepted" && !s.guest_notified_at) return "taken"
  return null
}

export async function listOwnSuggestions(
  linkId: string,
): Promise<{ items: GuestOwnSuggestion[]; toNotify: string[] }> {
  const rows = await requireDb()
    .select({
      id: guestEpisodeSuggestions.id,
      original_text: guestEpisodeSuggestions.original_text,
      body: guestEpisodeSuggestions.body,
      status: guestEpisodeSuggestions.status,
      guest_notified_at: guestEpisodeSuggestions.guest_notified_at,
    })
    .from(guestEpisodeSuggestions)
    .where(eq(guestEpisodeSuggestions.link_id, linkId))
    .orderBy(desc(guestEpisodeSuggestions.created_at))
    .limit(GUEST_SUGGESTION_LIMITS.MAX_PENDING_PER_LINK)
  const items: GuestOwnSuggestion[] = rows.map((r) => ({
    id: r.id,
    target_label: r.original_text,
    body: r.body,
    tag: ownSuggestionTag(r),
  }))
  const toNotify = rows.filter((r) => ownSuggestionTag(r) === "taken").map((r) => r.id)
  return { items, toNotify }
}

export async function markSuggestionsNotified(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await requireDb()
    .update(guestEpisodeSuggestions)
    .set({ guest_notified_at: new Date() })
    .where(inArray(guestEpisodeSuggestions.id, ids))
}

// ─── Admin writes ───────────────────────────────────────────────────────

export async function getActiveLinkForEir(eirId: string): Promise<GuestLinkRow | null> {
  if (!db) return null
  const rows = await db
    .select()
    .from(guestEpisodeLinks)
    .where(and(eq(guestEpisodeLinks.eir_id, eirId), isNull(guestEpisodeLinks.revoked_at)))
    .orderBy(desc(guestEpisodeLinks.created_at))
    .limit(1)
  return rows[0] ?? null
}

export async function createGuestLink(params: {
  eirId: string
  guestId: string | null
  displayName: string
  createdBy: string | null
}): Promise<{ id: string; token: string } | { error: "exists" }> {
  const d = requireDb()
  const existing = await getActiveLinkForEir(params.eirId)
  if (existing) return { error: "exists" }
  const { token, hash } = generateGuestLinkToken()
  const now = new Date()
  const rows = await d
    .insert(guestEpisodeLinks)
    .values({
      eir_id: params.eirId,
      guest_id: params.guestId,
      guest_display_name: params.displayName,
      token_hash: hash,
      status: "active",
      expires_at: fallbackExpiry(now),
      created_by: params.createdBy,
    })
    .returning({ id: guestEpisodeLinks.id })
  return { id: rows[0].id, token }
}

/** New token on the same row — the old URL dies, the answers stay. */
export async function rotateGuestLink(linkId: string): Promise<{ token: string } | null> {
  const { token, hash } = generateGuestLinkToken()
  const rows = await requireDb()
    .update(guestEpisodeLinks)
    .set({ token_hash: hash, expires_at: fallbackExpiry(new Date()), updated_at: new Date() })
    .where(usable(linkId))
    .returning({ id: guestEpisodeLinks.id })
  return rows.length ? { token } : null
}

export async function revokeGuestLink(linkId: string): Promise<boolean> {
  const rows = await requireDb()
    .update(guestEpisodeLinks)
    .set({ status: "revoked", revoked_at: new Date(), updated_at: new Date() })
    .where(usable(linkId))
    .returning({ id: guestEpisodeLinks.id })
  return rows.length > 0
}

export async function updateGuestLinkFields(
  linkId: string,
  patch: Partial<
    Pick<
      GuestLinkRow,
      | "guest_display_name"
      | "location_label"
      | "address"
      | "map_url"
      | "house_photo"
      | "show_schedule"
      | "sample_overrides"
      | "location_updated_at"
    >
  >,
): Promise<boolean> {
  const rows = await requireDb()
    .update(guestEpisodeLinks)
    .set({ ...patch, updated_at: new Date() })
    .where(usable(linkId))
    .returning({ id: guestEpisodeLinks.id })
  return rows.length > 0
}

export async function writePublishedSnapshot(
  linkId: string,
  snap: {
    view: GuestPrepView
    refs: unknown
    by: string | null
    prepId: string | null
    prepUpdatedAt: Date | null
    scheduleAt: Date | null
  },
): Promise<boolean> {
  const rows = await requireDb()
    .update(guestEpisodeLinks)
    .set({
      published_view: snap.view as unknown as Record<string, unknown>,
      published_ref_map: snap.refs as Record<string, unknown>,
      published_at: new Date(),
      published_by: snap.by,
      published_source_prep_id: snap.prepId,
      published_source_prep_updated_at: snap.prepUpdatedAt,
      published_schedule_at: snap.scheduleAt,
      updated_at: new Date(),
    })
    .where(usable(linkId))
    .returning({ id: guestEpisodeLinks.id })
  return rows.length > 0
}

export async function decideGuestSuggestion(
  id: string,
  eirId: string,
  status: "accepted" | "rejected",
  by: string | null,
): Promise<typeof guestEpisodeSuggestions.$inferSelect | null> {
  const rows = await requireDb()
    .update(guestEpisodeSuggestions)
    .set({ status, decided_by: by, decided_at: new Date() })
    .where(
      and(
        eq(guestEpisodeSuggestions.id, id),
        eq(guestEpisodeSuggestions.eir_id, eirId),
        eq(guestEpisodeSuggestions.status, "new"),
      ),
    )
    .returning()
  return rows[0] ?? null
}
