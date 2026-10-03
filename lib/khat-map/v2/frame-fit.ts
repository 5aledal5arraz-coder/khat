/**
 * Does a returned card honour the exploration slot it was assigned?
 *
 * The exploration map (exploration.ts) assigns slot i a field × audience
 * segment × territory × archetype. Until 2026-10-03 that was a prompt
 * instruction only — nothing compared the output with the slot. This module
 * is the check, and it is SOFT on purpose: a card that drifted is already
 * paid for and may still be the best idea in the batch, so a mismatch lowers
 * its rank and is flagged on the card; it never drops it.
 *
 *   archetype  — must equal the slot's archetype ("The slot's archetype is
 *                the topic's archetype").
 *   segment    — must equal the slot's audience segment.
 *   field_door — the prompt lets the model swap a field for another of the
 *                SAME door, so only a change of door counts.
 *
 * An echo we cannot RESOLVE — an unknown field, an empty or label-only
 * segment, a missing archetype — is "unverifiable": recorded on the card,
 * never penalised. Penalising what we can't read would punish our own
 * matcher, not the model. Arabic is folded before matching (tashkeel,
 * أإآ→ا, ة→ه, ى→ي, digits; parentheticals and «» dropped).
 *
 * The card is matched to its slot by the `slot` number it echoes, falling
 * back to its position in the reply. Pure.
 */

import type { ExplorationFrame } from "./exploration"
import { KHAT_FIELDS } from "@/lib/khat-map/core/constitution"
import { foldVerbatim } from "@/lib/studio/verbatim"

export type FrameMismatch = "archetype" | "segment" | "field_door"
export type FrameUnverifiable = "archetype" | "segment" | "field"

export interface FrameFit {
  mismatches: FrameMismatch[]
  unverifiable: FrameUnverifiable[]
}

/** Rank penalty per mismatched dimension, on the selector's 0-10 scale. */
export const FRAME_MISMATCH_PENALTY = 0.75
/** A penalised card stays selectable — 0 means "court-rejected" upstream. */
const MIN_PENALISED_SCORE = 0.1

export interface FrameEcho {
  slot?: number | null
  archetype?: string | null
  segment?: string | null
  field?: string | null
}

/** Fold Arabic and drop parentheticals / quote marks before comparing. */
function fold(v: string | null | undefined): string {
  return foldVerbatim((v ?? "").replace(/\([^)]*\)/g, " ").replace(/[«»"']/g, " "))
}

const FIELD_DOOR_BY_KEY = new Map<string, string>()
for (const f of KHAT_FIELDS) {
  FIELD_DOOR_BY_KEY.set(fold(f.label_ar), f.door)
  FIELD_DOOR_BY_KEY.set(f.id.toLowerCase(), f.door)
}

/** "2035" / "3560", or null when the echo carries no segment we can read. */
function segmentKey(v: string | null | undefined): string | null {
  const digits = fold(v).replace(/\D/g, "")
  return digits === "2035" || digits === "3560" ? digits : null
}

function fieldDoor(v: string | null | undefined): string | null {
  const raw = (v ?? "").trim()
  if (!raw) return null
  return FIELD_DOOR_BY_KEY.get(raw.toLowerCase()) ?? FIELD_DOOR_BY_KEY.get(fold(raw)) ?? null
}

export function frameFit(
  echo: FrameEcho,
  frames: readonly ExplorationFrame[] | null | undefined,
  index: number,
): FrameFit {
  const out: FrameFit = { mismatches: [], unverifiable: [] }
  if (!frames || frames.length === 0) return out
  const slot = Number(echo.slot)
  const frame =
    Number.isInteger(slot) && slot >= 1 && slot <= frames.length
      ? frames[slot - 1]
      : frames[index]
  if (!frame) return out

  const archetype = (echo.archetype ?? "").trim().toLowerCase()
  if (!archetype) out.unverifiable.push("archetype")
  else if (archetype !== frame.archetype) out.mismatches.push("archetype")

  const seg = segmentKey(echo.segment)
  if (seg === null) out.unverifiable.push("segment")
  else if (seg !== segmentKey(frame.segment.id)) out.mismatches.push("segment")

  const door = fieldDoor(echo.field)
  if (door === null) out.unverifiable.push("field")
  else if (door !== frame.field.door) out.mismatches.push("field_door")

  return out
}

export function applyFramePenalty(score: number, mismatches: readonly FrameMismatch[]): number {
  if (score <= 0 || mismatches.length === 0) return score
  return Math.max(MIN_PENALISED_SCORE, score - FRAME_MISMATCH_PENALTY * mismatches.length)
}
