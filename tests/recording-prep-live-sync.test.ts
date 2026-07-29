/**
 * Regression: a live recording room must keep re-reading prep_v2.
 *
 * The incident (2026-07-29, room 74db84a7): the room was created and its
 * link shared at 18:40, the director's page was server-rendered at ~18:42
 * — while the prep_v2 pipeline was still on pass 4 — and the payload only
 * landed at 18:43:41. The page rendered prep_v2 from its one-shot server
 * snapshot and nothing ever re-read it, so the director sat on
 * «لا توجد بنية إعداد (prep_v2) لهذه الحلقة بعد» for the whole session
 * even though the data had existed since seconds before he joined.
 *
 * Two independent guarantees are asserted here:
 *   1. PULL — every room snapshot (i.e. every SSE connect/reconnect)
 *      carries the preparation's prep_v2 as of that moment.
 *   2. PUSH — persisting prep_v2 broadcasts `prep_update` to every room
 *      on that preparation, so clients already connected don't wait.
 *
 * Both fail against the pre-fix code: (1) the snapshot had no prep_v2
 * field at all, (2) nothing was broadcast on persist.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "./db-mock"
vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

// rooms.ts pulls in the EIR walker on import; none of it runs in these tests.
vi.mock("@/lib/khat-brain", () => ({
  getEirIdForPreparation: vi.fn(async () => null),
  syncEirFromRoomStatus: vi.fn(async () => {}),
  walkForwardIfBehind: vi.fn(async () => {}),
}))

import { getRoomSnapshot } from "@/lib/collaboration/rooms"
import { broadcastPrepV2Update } from "@/lib/collaboration/prep-live"
import { subscribe } from "@/lib/collaboration/broadcast"
import type { PrepV2Payload } from "@/lib/preparation/v2/types"

const ROOM_ID = "room-1"
const PREP_ID = "prep-1"

function prepV2Payload(): PrepV2Payload {
  return {
    thesis: "أطروحة",
    axes_of_tension: [],
    guest_extraction_strategy: "",
    episode_sections: [
      {
        kind: "opening",
        intent: "نية",
        target_emotion: "فضول",
        estimated_minutes: 10,
        transition_goal: "",
      },
    ],
    question_bank: [],
    host_guidance: { overall_tone: "", do_list: [], dont_list: [], energy_curve: "" },
    director_guidance: { shot_priorities: [], silence_moments: [], cut_warnings: [] },
    sensitive_zones: [],
    opening_options: [],
    closing_options: [],
    total_estimated_minutes: 60,
    generator_version: "v2.1",
    generated_at: "2026-07-29T18:43:41.944Z",
    ai_run_ids: {
      pass1_research: null,
      pass2_structure: null,
      pass3_questions: null,
      pass4_critique: null,
      pass5_insights: null,
    },
  }
}

/** Queue the select results getRoomSnapshot consumes, in call order. */
function queueSnapshotSelects(prep_v2: PrepV2Payload | null) {
  const now = new Date()
  mockSelectResult([
    {
      id: ROOM_ID,
      preparation_id: PREP_ID,
      name: "غرفة",
      status: "live",
      phase: "recording",
      energy_level: 3,
      host_notes: "",
      recording_elapsed_ms: 0,
      completed_question_ids: [],
      created_by: "u1",
      created_at: now,
      updated_at: now,
    },
  ])
  mockSelectResult([{ prep_v2 }]) // the preparation re-read
  mockSelectResult([])            // interview cards (none → materials skipped)
  mockSelectResult([])            // participants
  mockSelectResult([])            // card states
  mockSelectResult([])            // notes
  mockSelectResult([])            // session markers
}

describe("live recording room — prep_v2 stays current (PULL)", () => {
  beforeEach(() => resetMock())

  it("carries the preparation's prep_v2 on the room snapshot", async () => {
    const payload = prepV2Payload()
    queueSnapshotSelects(payload)

    const snap = await getRoomSnapshot(ROOM_ID)

    expect(snap).not.toBeNull()
    expect(snap!.prep_v2).toEqual(payload)
    expect(snap!.prep_v2!.episode_sections).toHaveLength(1)
  })

  it("reports prep_v2 as null (not undefined) while generation is still running", async () => {
    queueSnapshotSelects(null)

    const snap = await getRoomSnapshot(ROOM_ID)

    // `null` is a real answer the client can act on; `undefined` would be
    // indistinguishable from "this snapshot doesn't talk about prep".
    expect(snap!.prep_v2).toBeNull()
  })
})

describe("live recording room — prep_v2 arrival is pushed (PUSH)", () => {
  beforeEach(() => resetMock())

  it("broadcasts prep_update to every room on the preparation", async () => {
    const written: string[] = []
    const fakeWriter = {
      write: vi.fn(async (bytes: Uint8Array) => {
        written.push(new TextDecoder().decode(bytes))
      }),
    } as unknown as WritableStreamDefaultWriter<Uint8Array>
    const unsubscribe = subscribe(ROOM_ID, fakeWriter)

    try {
      mockSelectResult([{ id: ROOM_ID }]) // rooms attached to this preparation
      const payload = prepV2Payload()

      const notified = await broadcastPrepV2Update(PREP_ID, payload)

      expect(notified).toEqual([ROOM_ID])
      expect(written).toHaveLength(1)
      const event = JSON.parse(written[0].replace(/^data: /, "").trim())
      expect(event.type).toBe("prep_update")
      expect(event.data).toEqual(payload)
    } finally {
      unsubscribe()
    }
  })

  it("is a no-op when the preparation has no rooms", async () => {
    mockSelectResult([])
    await expect(broadcastPrepV2Update(PREP_ID, prepV2Payload())).resolves.toEqual([])
  })
})
