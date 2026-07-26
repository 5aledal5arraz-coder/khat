/**
 * Blind judgment panel — the human instrument for the one question the
 * automated benchmark cannot answer.
 *
 * `lib/ai-router/benchmark/` measures whether a model COMPLIES: does it
 * return the planted facts, cite its sources, keep its JSON shape, stay
 * consistent across three runs, and what did it cost. Those are the right
 * things to automate and they are not the product. Whether an Arabic episode
 * title is worth publishing is a judgment about taste, and the benchmark's
 * model judge is not qualified to make it — a fact nobody has ever tested,
 * even though that same judge produces the `quality_net` number that decides
 * adoptions.
 *
 * So this panel does two things at once:
 *   1. Asks Khaled to choose blind between the current and candidate model on
 *      20 pairs of real published-episode titles and descriptions.
 *   2. Scores the MODEL JUDGE against those choices — at zero weight in the
 *      decision. The judge runs only so it can be measured.
 *
 * ── Module layout, and why it matters ───────────────────────────────────────
 * This barrel is SERVER-ONLY: it re-exports `store.ts`, which imports
 * `lib/db.ts` → `pg`. A client component that imports anything from here —
 * even one constant — drags the Postgres driver into the browser bundle and
 * the page dies on `Can't resolve 'dns'`, with the server HTML still
 * rendering fine so it looks like a dead button rather than a build error.
 *
 *   types.ts    — types only, no imports          → client-safe
 *   enabled.ts  — the local-only gate, no imports → client-safe
 *   stats.ts    — pure arithmetic                 → client-safe
 *   store.ts    — config_store IO + the blinding  → SERVER ONLY
 *   index.ts    — this barrel                     → SERVER ONLY
 *
 * Client components import from the three leaves by path. Server components
 * and scripts may use this barrel.
 */

export * from "./types"
export * from "./enabled"
export * from "./stats"
export * from "./store"
