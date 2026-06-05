/**
 * Phase 1.3 — Zod schemas for ai_runs.input_snapshot and output_snapshot.
 *
 * Both columns are typed `Record<string, unknown>` in the source schema.
 * That is intentional — the AI Router writes whatever the caller hands
 * it. Strict-shaping these columns would treat normal use as drift.
 *
 * Lenient stance: assert "is a JSON object" and stop. The wrapper still
 * runs (so any future tightening can layer on top), but every realistic
 * value passes.
 */

import { z } from "zod"

export const AI_RUNS_TABLE = "ai_runs"
export const AI_RUNS_INPUT_SNAPSHOT_COLUMN = "input_snapshot"
export const AI_RUNS_OUTPUT_SNAPSHOT_COLUMN = "output_snapshot"

/**
 * Lenient: any plain object passes. Arrays, primitives, and null fail.
 * The router uses `clipSnapshot()` to coerce non-object inputs into
 * objects (e.g. `{ _truncated: true, ... }`), so this contract holds.
 */
export const aiRunsInputSnapshotSchema = z.record(z.string(), z.unknown())
export const aiRunsOutputSnapshotSchema = z.record(z.string(), z.unknown())
