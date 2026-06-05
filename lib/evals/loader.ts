/**
 * Khat Brain — Golden-set loader.
 *
 * Reads evals/<feature>/golden.json from disk, validates the schema
 * envelope, and returns a typed GoldenSet. The loader does NOT validate
 * the per-feature `example` payload — that's the judge's job.
 */

import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import {
  GOLDEN_SCHEMA_VERSION,
  type EvalFeature,
  type GoldenSet,
} from "./types"

export class GoldenSetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GoldenSetError"
  }
}

const EVALS_ROOT = path.resolve(process.cwd(), "evals")

export function pathToGolden(feature: EvalFeature): string {
  return path.join(EVALS_ROOT, feature, "golden.json")
}

export async function loadGoldenSet(
  feature: EvalFeature,
): Promise<GoldenSet> {
  const file = pathToGolden(feature)
  let raw: string
  try {
    raw = await fs.readFile(file, "utf8")
  } catch (err) {
    throw new GoldenSetError(
      `Cannot read golden set for "${feature}" at ${file}: ${(err as Error).message}`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new GoldenSetError(
      `golden.json for "${feature}" is not valid JSON: ${(err as Error).message}`,
    )
  }
  validateGoldenShape(parsed, feature)
  return parsed as GoldenSet
}

/**
 * Stable hash of a golden set. Reports include this so a quality
 * comparison between runs is invalid if the golden set itself changed
 * underneath them.
 */
export function hashGoldenSet(set: GoldenSet): string {
  const h = createHash("sha256")
  // Use JSON.stringify with sorted keys for stability.
  h.update(stableJson(set))
  return h.digest("hex").slice(0, 16)
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return "[" + value.map(stableJson).join(",") + "]"
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + stableJson(obj[k])).join(",") +
    "}"
  )
}

function validateGoldenShape(
  parsed: unknown,
  feature: EvalFeature,
): asserts parsed is GoldenSet {
  if (!parsed || typeof parsed !== "object") {
    throw new GoldenSetError(`golden.json for "${feature}" must be an object`)
  }
  const o = parsed as Record<string, unknown>
  if (o.$schema_version !== GOLDEN_SCHEMA_VERSION) {
    throw new GoldenSetError(
      `golden.json for "${feature}" has $schema_version="${o.$schema_version}", expected "${GOLDEN_SCHEMA_VERSION}"`,
    )
  }
  if (o.feature !== feature) {
    throw new GoldenSetError(
      `golden.json for "${feature}" has feature="${o.feature}", expected "${feature}"`,
    )
  }
  if (o.language !== "ar" && o.language !== "en") {
    throw new GoldenSetError(
      `golden.json for "${feature}" has invalid language "${o.language}"`,
    )
  }
  if (!Array.isArray(o.positive)) {
    throw new GoldenSetError(
      `golden.json for "${feature}" must have positive[] array`,
    )
  }
  if (!Array.isArray(o.negative)) {
    throw new GoldenSetError(
      `golden.json for "${feature}" must have negative[] array`,
    )
  }
  for (const arr of [o.positive, o.negative] as Array<Record<string, unknown>[]>) {
    for (const entry of arr) {
      if (!entry.id || typeof entry.id !== "string") {
        throw new GoldenSetError(
          `golden.json for "${feature}" has entry without string id`,
        )
      }
      if (!entry.source || typeof entry.source !== "string") {
        throw new GoldenSetError(
          `golden.json for "${feature}" entry "${entry.id}" missing source`,
        )
      }
      if (!entry.evidence || typeof entry.evidence !== "string") {
        throw new GoldenSetError(
          `golden.json for "${feature}" entry "${entry.id}" missing evidence`,
        )
      }
      if (!entry.example || typeof entry.example !== "object") {
        throw new GoldenSetError(
          `golden.json for "${feature}" entry "${entry.id}" missing example`,
        )
      }
    }
  }
}
