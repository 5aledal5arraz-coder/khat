/**
 * The recording server actions, driven through the real action module with
 * its collaborators mocked — so the assertions are about what the ACTIONS do
 * with a result, which is where the 2026-09-28 bugs were:
 *
 *   - `createMarkerAction` wrote the host's flag and never broadcast it, so the
 *     director and the editor never saw a single host flag;
 *   - `setCurrentQuestionAction` wrote a prep_v2 id into an FK to
 *     interview_cards (23503, swallowed), so «الآن» never left the host;
 *   - every gate THREW, and production strips thrown action messages, so an
 *     expired session was indistinguishable from any other failure;
 *   - transport actions returned no row, so the host could not adopt the
 *     truth after an `already_started`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/api-utils", () => ({
  requireActionRole: vi.fn(),
  getAdminAuthUser: vi.fn(),
}))
vi.mock("@/lib/collaboration/broadcast", () => ({ broadcast: vi.fn() }))
vi.mock("@/lib/collaboration/rooms", () => ({ getRoomById: vi.fn() }))
vi.mock("@/lib/recording-v2/checklist", () => ({ setChecklistItem: vi.fn() }))
vi.mock("@/lib/admin/team-identity", () => ({ resolveMemberName: () => "المقدم" }))
vi.mock("@/lib/collaboration/room-roles", () => ({ resolveRoomRole: () => "host" }))
vi.mock("@/lib/recording-v2/actions-impl", () => ({
  ALLOWED_MARKER_TYPES: ["highlight", "clip", "quote", "insight_used"],
  startTimer: vi.fn(),
  pauseTimer: vi.fn(),
  resumeTimer: vi.fn(),
  resetTimer: vi.fn(),
  endTimer: vi.fn(),
  setCurrentSection: vi.fn(),
  saveDirectorNotes: vi.fn(),
  createMarker: vi.fn(),
  toggleQuestionDone: vi.fn(),
  setTakeCameraOffset: vi.fn(),
  recordChecklistOverride: vi.fn(),
  recordTakeStartMarker: vi.fn(),
  setCurrentQuestion: vi.fn(),
}))

import { requireActionRole, getAdminAuthUser } from "@/lib/api-utils"
import { broadcast } from "@/lib/collaboration/broadcast"
import { getRoomById } from "@/lib/collaboration/rooms"
import * as impl from "@/lib/recording-v2/actions-impl"
import {
  createMarkerAction,
  pauseTimerAction,
  setCurrentQuestionAction,
  startTimerAction,
} from "@/app/admin/recording/[roomId]/v2/actions"

const USER = { id: "u-host", role: "ADMIN", is_active: true, job_title: "host" }
const ROOM = { id: "room-1", status: "live", updated_at: "2026-09-28T10:00:00.000Z" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireActionRole).mockResolvedValue({ ok: true, user: USER } as never)
  vi.mocked(getAdminAuthUser).mockResolvedValue(USER as never)
  vi.mocked(getRoomById).mockResolvedValue(ROOM as never)
})

describe("createMarkerAction — the host's flag reaches the room", () => {
  it("broadcasts `marker_added` with the inserted row", async () => {
    const marker = { id: "m1", marker_type: "highlight", net_recording_ms: 12_000 }
    vi.mocked(impl.createMarker).mockResolvedValue({
      ok: true,
      marker_id: "m1",
      net_recording_ms: 12_000,
      marker,
    } as never)

    const r = await createMarkerAction({ roomId: "room-1", markerType: "highlight", label: "highlight" })

    expect(r.ok).toBe(true)
    expect(broadcast).toHaveBeenCalledWith(
      "room-1",
      expect.objectContaining({ type: "marker_added", data: marker }),
    )
  })

  it("broadcasts nothing when the insert was refused", async () => {
    vi.mocked(impl.createMarker).mockResolvedValue({ ok: false, error: "recording_not_started" } as never)
    await createMarkerAction({ roomId: "room-1", markerType: "highlight", label: "highlight" })
    expect(broadcast).not.toHaveBeenCalled()
  })
})

describe("setCurrentQuestionAction — «الآن» has its own column", () => {
  it("writes through setCurrentQuestion (current_question_id) and broadcasts the room", async () => {
    vi.mocked(impl.setCurrentQuestion).mockResolvedValue({ ok: true } as never)
    const r = await setCurrentQuestionAction({ roomId: "room-1", questionId: "s-c1" })
    expect(r).toEqual({ ok: true })
    expect(impl.setCurrentQuestion).toHaveBeenCalledWith({ roomId: "room-1", questionId: "s-c1" })
    expect(broadcast).toHaveBeenCalledWith(
      "room-1",
      expect.objectContaining({ type: "room_update", data: ROOM }),
    )
  })

  it("RETURNS a failure instead of pretending — the cockpit can say so", async () => {
    vi.mocked(impl.setCurrentQuestion).mockResolvedValue({ ok: false, error: "room_not_found" } as never)
    const r = await setCurrentQuestionAction({ roomId: "room-1", questionId: "s-c1" })
    expect(r).toEqual({ ok: false, error: "room_not_found" })
    expect(broadcast).not.toHaveBeenCalled()
  })
})

describe("gate failures are VALUES (they survive production error-stripping)", () => {
  it("expired session → { ok:false, error:'unauthorized' }, nothing written", async () => {
    vi.mocked(requireActionRole).mockResolvedValue({ ok: false, error: "يجب تسجيل الدخول أولاً" })
    vi.mocked(getAdminAuthUser).mockResolvedValue(null)
    await expect(pauseTimerAction("room-1")).resolves.toEqual({ ok: false, error: "unauthorized" })
    expect(impl.pauseTimer).not.toHaveBeenCalled()
  })

  it("signed in without the role → 'forbidden'", async () => {
    vi.mocked(requireActionRole).mockResolvedValue({ ok: false, error: "ليس لديك صلاحية لهذا الإجراء" })
    vi.mocked(getAdminAuthUser).mockResolvedValue({ ...USER, role: "VIEWER" } as never)
    await expect(
      createMarkerAction({ roomId: "room-1", markerType: "highlight", label: "x" }),
    ).resolves.toEqual({ ok: false, error: "forbidden" })
    expect(impl.createMarker).not.toHaveBeenCalled()
  })
})

describe("transport actions return the row they broadcast", () => {
  it("startTimerAction on a take the director already started carries the live row", async () => {
    vi.mocked(impl.startTimer).mockResolvedValue({ ok: true, already_started: true } as never)
    const r = await startTimerAction("room-1")
    expect(r).toMatchObject({ ok: true, already_started: true, room: ROOM })
    // The loser of a two-press race must not log a second start.
    expect(impl.recordTakeStartMarker).not.toHaveBeenCalled()
  })
})
