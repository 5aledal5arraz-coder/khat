/**
 * Phase 0 — Smoke check for the eval substrate.
 *
 *   npx tsx scripts/smoke-phase0-evals.ts
 *
 * Validates everything that does NOT require live AI / DB:
 *   • All 5 golden sets load and validate.
 *   • Golden hashes are stable across two loads.
 *   • The scorer produces sane output for fabricated rankings.
 *   • The pool shuffler is deterministic for a fixed seed.
 *   • EVAL_FEATURES matches the directory layout.
 *
 * Does NOT exercise: runGenerator (live AI), callJudge (live AI),
 * writeReport (file system side effects). Those require operator
 * baseline runs.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import {
  EVAL_FEATURES,
  loadGoldenSet,
  hashGoldenSet,
  scoreEval,
  shufflePool,
  type RankPoolItem,
} from "../lib/evals"

const EVALS_ROOT = path.resolve(process.cwd(), "evals")

let failed = 0
function ok(label: string) {
  console.log("ok:  " + label)
}
function bad(label: string, detail?: unknown) {
  console.error("FAIL: " + label, detail ?? "")
  failed++
}

async function main() {
  // 1. Filesystem layout
  for (const f of EVAL_FEATURES) {
    const file = path.join(EVALS_ROOT, f, "golden.json")
    try {
      await fs.access(file)
      ok(`golden.json exists for ${f}`)
    } catch {
      bad(`golden.json MISSING for ${f}: ${file}`)
    }
  }

  // 2. Each golden set loads + validates
  for (const f of EVAL_FEATURES) {
    try {
      const set = await loadGoldenSet(f)
      ok(`golden.json loads for ${f} (pos=${set.positive.length}, neg=${set.negative.length})`)
      if (set.positive.length === 0) {
        bad(`golden.json for ${f} has zero positives`)
      }
      if (set.negative.length === 0) {
        bad(`golden.json for ${f} has zero negatives`)
      }
    } catch (err) {
      bad(`golden.json failed to load for ${f}`, err)
    }
  }

  // 3. Golden hash is stable across two loads
  for (const f of EVAL_FEATURES) {
    try {
      const a = await loadGoldenSet(f)
      const b = await loadGoldenSet(f)
      const ha = hashGoldenSet(a)
      const hb = hashGoldenSet(b)
      if (ha === hb && ha.length === 16) {
        ok(`hash stable for ${f}: ${ha}`)
      } else {
        bad(`hash unstable for ${f}: ${ha} vs ${hb}`)
      }
    } catch (err) {
      bad(`hash failed for ${f}`, err)
    }
  }

  // 4. Scorer math
  {
    const set = await loadGoldenSet("hybrid-topics")
    const candidateIds = ["c1", "c2"]
    const rankings = [
      { candidate_id: "c1", rank: 1, reason: "top" },
      { candidate_id: set.positive[0].id, rank: 2, reason: "ref" },
      { candidate_id: "c2", rank: 3, reason: "mid" },
      ...set.positive.slice(1).map((p, i) => ({
        candidate_id: p.id,
        rank: 4 + i,
        reason: "lower",
      })),
    ]
    const scored = scoreEval({ candidateIds, rankings, goldenSet: set })
    // c1 ranked 1 of N → normalized = 1.0
    // c2 ranked 3 of N
    if (scored.quality_score > 0 && scored.quality_score <= 1) {
      ok(`scorer output in [0,1]: ${scored.quality_score}`)
    } else {
      bad(`scorer output out of range: ${scored.quality_score}`)
    }
    if (scored.per_candidate[0].normalized === 1.0) {
      ok(`top candidate gets normalized 1.0`)
    } else {
      bad(`top candidate normalized != 1.0: ${scored.per_candidate[0].normalized}`)
    }
  }

  // 5. Pool shuffle determinism + no undefined items
  {
    const pool: RankPoolItem[] = [
      { id: "a", example: {}, _kind: "candidate" },
      { id: "b", example: {}, _kind: "candidate" },
      { id: "c", example: {}, _kind: "positive" },
      { id: "d", example: {}, _kind: "positive" },
      { id: "e", example: {}, _kind: "positive" },
    ]
    const seeds = [
      "seed-1",
      "hybrid-topics",
      "a1c0d6e97c2ffbc9hybrid-topics", // real shape — golden_hash + feature
      "original-thinking",
      "discovery-archetypes",
    ]
    for (const seed of seeds) {
      const shuffled = shufflePool(pool, seed)
      if (shuffled.length !== pool.length) {
        bad(`shuffle length mismatch for seed "${seed}"`, shuffled.length)
        continue
      }
      const allDefined = shuffled.every((x) => x && typeof x.id === "string")
      if (!allDefined) bad(`shuffle produced undefined item for seed "${seed}"`)
      else ok(`shuffle stable for seed "${seed}": ${shuffled.map((x) => x.id).join(",")}`)
    }
    const a = shufflePool(pool, "seed-1")
    const b = shufflePool(pool, "seed-1")
    const c = shufflePool(pool, "seed-2")
    const sameAB = a.map((x) => x.id).join(",") === b.map((x) => x.id).join(",")
    const sameAC = a.map((x) => x.id).join(",") === c.map((x) => x.id).join(",")
    if (sameAB) ok("shuffle is deterministic for the same seed")
    else bad("shuffle not deterministic", { a, b })
    if (!sameAC) ok("shuffle differs for different seeds")
    else bad("shuffle ignored different seed", { a, c })
  }

  // 6. EVAL_FEATURES vs filesystem
  try {
    const dirs = await fs.readdir(EVALS_ROOT, { withFileTypes: true })
    const found = dirs
      .filter((d) => d.isDirectory() && d.name !== "results")
      .map((d) => d.name)
      .sort()
    const expected = [...EVAL_FEATURES].sort()
    const missing = expected.filter((e) => !found.includes(e))
    const extra = found.filter((f) => !(expected as readonly string[]).includes(f))
    if (missing.length === 0) ok(`every EVAL_FEATURES entry has a directory`)
    else bad(`missing directories: ${missing.join(", ")}`)
    if (extra.length === 0) ok(`no orphan eval directories`)
    else console.log(`note: extra directories under evals/ (informational): ${extra.join(", ")}`)
  } catch (err) {
    bad("filesystem layout check failed", err)
  }

  console.log("")
  if (failed === 0) {
    console.log("Phase 0 eval substrate: ALL CHECKS PASSED")
    process.exit(0)
  } else {
    console.error(`Phase 0 eval substrate: ${failed} CHECK(S) FAILED`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("smoke fatal:", err)
  process.exit(1)
})
