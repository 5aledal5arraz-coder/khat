/**
 * Phase X Step 5 — Live Recording V2 read service.
 *
 *   loadRecordingV2(roomId)
 *     reads the room, the linked preparation, prep_v2 (when present),
 *     legacy fallback questions, recent markers, and the EIR phase.
 *     Returns a single LiveV2Snapshot the page renders.
 */

import { and, eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  collaborationRooms,
  roomSessionMarkers,
  roomParticipants,
  roomTakes,
} from "@/lib/db/schema/collaboration"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { getChecklistEntries } from "./checklist"
import { withCameraMs } from "./camera-time"
import { hasChecklistOverride } from "./actions-impl"
import { deriveChecklistModel, type ChecklistEntry } from "./preflight-checklist"
import type {
  PrepV2Payload,
  PrepV2Question,
  SectionKind,
} from "@/lib/preparation/v2/types"

export interface LiveV2Marker {
  id: string
  marker_type: string
  label: string
  note: string | null
  /** NET recording time (pauses excluded) — cockpit display only. */
  net_recording_ms: number
  /** Which take this marker belongs to. */
  take_number: number
  /**
   * CAMERA time — what the exports actually contain, and therefore what the wrap
   * screen must display. `null` when the take has no anchor, in which case the
   * marker cannot be placed on a timeline and is left OUT of the EDL.
   */
  camera_ms: number | null
  section_key: string | null
  created_at: string
  author_name: string | null
}

export interface LiveV2RoomSnapshot {
  id: string
  name: string
  status: "waiting" | "live" | "paused" | "ended"
  recording_started_at: string | null
  recording_ended_at: string | null
  recording_paused_at: string | null
  recording_elapsed_ms: number
  /** Current recording attempt. Bumped by "إعادة ضبط لتسجيل جديد". */
  take_number: number
  /**
   * Camera-sync correction for the CURRENT take, in ms. Null when the take has
   * no anchor row yet (never started) — which is also why the wrap screen can
   * only offer the input after a take has run.
   */
  camera_offset_ms: number | null
  /** Pre-shoot checklist rows for the CURRENT take. */
  checklist: ChecklistEntry[]
  /**
   * True when the gate was already overridden for this take. Derived from the
   * audit marker, not held in component state, so a page reload cannot silently
   * forget that the crew chose to shoot unverified.
   */
  checklist_overridden: boolean
  /**
   * Whether the PREVIOUS take's checklist was fully resolved. Shown as a context
   * line on a re-shoot: state is never copied forward (a re-shoot usually means
   * the studio was struck, so old confirmations are unsafe), but the director
   * still deserves to know whether last time was signed off.
   */
  checklist_previous_take_complete: boolean
  director_notes: string
  energy_level: number
  current_section_key: SectionKind | null
  current_section_index: number | null
  completed_question_ids: string[]
  preparation_id: string
  eir_id: string | null
  eir_phase: string | null
}

export interface LiveV2PreparationSnapshot {
  id: string
  title: string
  guest_name: string | null
  /** When prep_v2 is present, the full structured payload. */
  prep_v2: PrepV2Payload | null
  /** Legacy questions as a flat fallback when prep_v2 is null. */
  legacy_questions: string[]
}

export interface LiveV2Snapshot {
  room: LiveV2RoomSnapshot
  preparation: LiveV2PreparationSnapshot
  markers: LiveV2Marker[]
}

export async function loadLiveV2(roomId: string): Promise<LiveV2Snapshot | null> {
  const [room] = await db!
    .select()
    .from(collaborationRooms)
    .where(eq(collaborationRooms.id, roomId))
    .limit(1)
  if (!room) return null

  const [prep] = await db!
    .select({
      id: episodePreparations.id,
      title: episodePreparations.title,
      guest_name: episodePreparations.guest_name,
      key_questions: episodePreparations.key_questions,
      prep_v2: episodePreparations.prep_v2,
    })
    .from(episodePreparations)
    .where(eq(episodePreparations.id, room.preparation_id))
    .limit(1)

  let eir_phase: string | null = null
  if (room.eir_id) {
    const [eir] = await db!
      .select({ phase: episodeIntelligenceRecords.phase })
      .from(episodeIntelligenceRecords)
      .where(eq(episodeIntelligenceRecords.id, room.eir_id))
      .limit(1)
    eir_phase = eir?.phase ?? null
  }

  const [currentTake] = await db!
    .select({
      take_number: roomTakes.take_number,
      anchor_at: roomTakes.anchor_at,
      camera_offset_ms: roomTakes.camera_offset_ms,
    })
    .from(roomTakes)
    .where(
      and(
        eq(roomTakes.room_id, roomId),
        eq(roomTakes.take_number, room.take_number),
      ),
    )
    .limit(1)

  const [checklist, checklistOverridden, previousChecklist] = await Promise.all([
    getChecklistEntries(roomId, room.take_number),
    hasChecklistOverride(roomId, room.take_number),
    room.take_number > 1
      ? getChecklistEntries(roomId, room.take_number - 1)
      : Promise.resolve([]),
  ])

  const markers = await db!
    .select({
      id: roomSessionMarkers.id,
      marker_type: roomSessionMarkers.marker_type,
      label: roomSessionMarkers.label,
      note: roomSessionMarkers.note,
      net_recording_ms: roomSessionMarkers.net_recording_ms,
      take_number: roomSessionMarkers.take_number,
      wall_time: roomSessionMarkers.wall_time,
      section_key: roomSessionMarkers.section_key,
      created_at: roomSessionMarkers.created_at,
      author_name: roomParticipants.display_name,
    })
    .from(roomSessionMarkers)
    .leftJoin(
      roomParticipants,
      eq(roomParticipants.id, roomSessionMarkers.author_id),
    )
    // Scoped to the CURRENT take: the cockpit timeline plots the take being
    // recorded now, so a re-shoot must not repaint the scrapped take's pins
    // (their offsets restart from zero and would interleave meaninglessly).
    // Earlier takes stay in the DB and belong to the export, not to this view.
    .where(
      and(
        eq(roomSessionMarkers.room_id, roomId),
        eq(roomSessionMarkers.take_number, room.take_number),
      ),
    )
    .orderBy(desc(roomSessionMarkers.net_recording_ms))
    .limit(50)

  return {
    room: {
      id: room.id,
      name: room.name,
      status: room.status as LiveV2RoomSnapshot["status"],
      recording_started_at: room.recording_started_at?.toISOString() ?? null,
      recording_ended_at: room.recording_ended_at?.toISOString() ?? null,
      recording_paused_at: room.recording_paused_at?.toISOString() ?? null,
      recording_elapsed_ms: room.recording_elapsed_ms,
      take_number: room.take_number,
      camera_offset_ms: currentTake?.camera_offset_ms ?? null,
      checklist,
      checklist_overridden: checklistOverridden,
      checklist_previous_take_complete:
        room.take_number > 1 && deriveChecklistModel(previousChecklist).isComplete,
      director_notes: room.director_notes ?? "",
      energy_level: room.energy_level ?? 3,
      current_section_key: (room.current_section_key as SectionKind | null) ?? null,
      current_section_index: room.current_section_index ?? null,
      completed_question_ids: (room.completed_question_ids as string[] | null) ?? [],
      preparation_id: room.preparation_id,
      eir_id: room.eir_id ?? null,
      eir_phase,
    },
    preparation: {
      id: prep?.id ?? room.preparation_id,
      title: prep?.title ?? "",
      guest_name: prep?.guest_name ?? null,
      prep_v2: (prep?.prep_v2 as PrepV2Payload | null) ?? null,
      legacy_questions: (prep?.key_questions as string[] | null) ?? [],
    },
    // Camera time derived here (server-side, where the anchor is) so the wrap
    // screen shows the SAME clock the exported files use. Displaying net time
    // beside two buttons that emit camera time was a guaranteed mismatch that
    // grows with every break.
    markers: withCameraMs(
      markers,
      currentTake ? [currentTake] : [],
    ).map((m) => ({
      id: m.id,
      marker_type: m.marker_type,
      label: m.label,
      note: m.note,
      net_recording_ms: m.net_recording_ms,
      take_number: m.take_number,
      camera_ms: m.camera_ms,
      section_key: m.section_key,
      created_at: m.created_at.toISOString(),
      author_name: m.author_name,
    })),
  }
}

/** Helper for components: questions for the current section, must_ask first. */
export function questionsForSection(
  payload: PrepV2Payload | null,
  section: SectionKind | null,
): PrepV2Question[] {
  if (!payload || !section) return []
  const inSection = payload.question_bank.filter((q) => q.section === section)
  const mustAsk = inSection.filter((q) => q.priority === "must_ask")
  const ifTime = inSection.filter((q) => q.priority === "if_time")
  return [...mustAsk, ...ifTime]
}
