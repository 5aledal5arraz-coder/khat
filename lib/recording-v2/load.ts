/**
 * Phase X Step 5 — Live Recording V2 read service.
 *
 *   loadRecordingV2(roomId)
 *     reads the room, the linked preparation, prep_v2 (when present),
 *     legacy fallback questions, recent markers, and the EIR phase.
 *     Returns a single LiveV2Snapshot the page renders.
 */

import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  collaborationRooms,
  roomSessionMarkers,
  roomParticipants,
} from "@/lib/db/schema/collaboration"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
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
  recording_ms: number
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
  director_notes: string
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

  const markers = await db!
    .select({
      id: roomSessionMarkers.id,
      marker_type: roomSessionMarkers.marker_type,
      label: roomSessionMarkers.label,
      note: roomSessionMarkers.note,
      recording_ms: roomSessionMarkers.recording_ms,
      section_key: roomSessionMarkers.section_key,
      created_at: roomSessionMarkers.created_at,
      author_name: roomParticipants.display_name,
    })
    .from(roomSessionMarkers)
    .leftJoin(
      roomParticipants,
      eq(roomParticipants.id, roomSessionMarkers.author_id),
    )
    .where(eq(roomSessionMarkers.room_id, roomId))
    .orderBy(desc(roomSessionMarkers.recording_ms))
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
      director_notes: room.director_notes ?? "",
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
    markers: markers.map((m) => ({
      id: m.id,
      marker_type: m.marker_type,
      label: m.label,
      note: m.note,
      recording_ms: m.recording_ms,
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
