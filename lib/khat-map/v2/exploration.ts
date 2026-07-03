/**
 * Exploration frames — structured variety at GENERATION time.
 *
 * Root cause of "every batch feels the same": both engines let the model choose
 * its own ground, and an LLM's unguided picks collapse to the same attractors
 * (the hybrid engine literally cross-multiplied 7 frozen market-cluster words ×
 * 12 introspective lenses). Post-hoc selection can only reorder what generation
 * produced — it can never create range that was never generated.
 *
 * The fix: each batch gets an EXPLORATION MAP — one frame per slot, each frame a
 * (territory × archetype) assignment sampled by the HARNESS, not the model:
 *
 *   • territories = the 192 Knowledge-Universe subcategories + the corpus
 *     white-space themes (resonant, under-explored — weighted 3×), MINUS the
 *     territories this season's candidates already used → sampling WITHOUT
 *     replacement across batches, so every generation explores new ground.
 *   • per-category cap (2) inside a batch, so frames spread across categories.
 *   • archetypes round-robin from a shuffled deck, so a batch spans shapes by
 *     construction.
 *
 * Pure + deterministic under an injected RNG (unit-tested). DB loaders for the
 * two inputs live here too and are fire-safe.
 */

import { and, eq, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { khatMapEpisodeCandidates } from "@/lib/db/schema/khat-map"
import { corpusThemes } from "@/lib/db/schema/corpus"
import { SEASON_CATEGORIES } from "./categories"
import { KNOWLEDGE_UNIVERSE } from "./knowledge-universe"
import { ARCHETYPE_IDS, type ArchetypeId } from "./creative-brief"
import type { SeasonCategoryId } from "./categories"

export interface ExplorationTerritory {
  /** Subcategory id (universe) or corpus-theme slug (white_space). */
  id: string
  label_ar: string
  /** Generative hint — what kinds of episodes live here. */
  hint_ar: string
  /** Owning category id for universe territories; "corpus" for white space. */
  category: string
  kind: "universe" | "white_space"
}

export interface ExplorationFrame {
  territory: ExplorationTerritory
  archetype: ArchetypeId
}

export interface WhiteSpaceTheme {
  slug: string
  label_ar: string
  description_ar: string | null
}

const WHITE_SPACE_WEIGHT = 3
const PER_CATEGORY_CAP = 2

interface Weighted extends ExplorationTerritory {
  weight: number
}

function universePool(): Weighted[] {
  const out: Weighted[] = []
  for (const cat of SEASON_CATEGORIES) {
    const subs = KNOWLEDGE_UNIVERSE[cat.id as SeasonCategoryId] ?? []
    for (const s of subs) {
      out.push({
        id: s.id,
        label_ar: s.label_ar,
        hint_ar: s.scope_ar,
        category: cat.id,
        kind: "universe",
        weight: 1,
      })
    }
  }
  return out
}

/** Fisher–Yates with injected rng. */
function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** One weighted draw from `pool`; removes and returns the drawn item. */
function drawWeighted(pool: Weighted[], rng: () => number): Weighted {
  const total = pool.reduce((s, x) => s + x.weight, 0)
  let r = rng() * total
  for (let i = 0; i < pool.length; i++) {
    r -= pool[i].weight
    if (r <= 0) return pool.splice(i, 1)[0]
  }
  return pool.pop()!
}

export interface BuildFramesOptions {
  count: number
  /** Territories (subcategory ids / theme slugs) already explored this season. */
  usedTerritoryIds?: ReadonlySet<string>
  /** Corpus white-space themes — weighted toward selection. */
  whiteSpace?: WhiteSpaceTheme[]
  /** Injected RNG for determinism in tests. Defaults to Math.random. */
  rng?: () => number
}

export function buildExplorationFrames(opts: BuildFramesOptions): ExplorationFrame[] {
  const rng = opts.rng ?? Math.random
  const used = opts.usedTerritoryIds ?? new Set<string>()
  const count = Math.max(0, opts.count)
  if (count === 0) return []

  const whiteSpace: Weighted[] = (opts.whiteSpace ?? []).map((w) => ({
    id: w.slug,
    label_ar: w.label_ar,
    hint_ar: w.description_ar ?? "",
    category: "corpus",
    kind: "white_space" as const,
    weight: WHITE_SPACE_WEIGHT,
  }))

  // Fresh territories first; if the season has explored nearly everything,
  // refill with used ones rather than under-delivering frames.
  let pool = [...universePool(), ...whiteSpace].filter((t) => !used.has(t.id))
  if (pool.length < count) {
    const usedPool = [...universePool(), ...whiteSpace].filter((t) => used.has(t.id))
    pool = [...pool, ...usedPool]
  }

  const picked: ExplorationTerritory[] = []
  const perCategory = new Map<string, number>()
  while (picked.length < count && pool.length > 0) {
    // Respect the per-category cap while alternatives exist.
    const eligible = pool.filter((t) => (perCategory.get(t.category) ?? 0) < PER_CATEGORY_CAP)
    const target = eligible.length > 0 ? eligible : pool
    const chosen = drawWeighted(target, rng)
    // drawWeighted spliced from `target`; if target was the filtered view, also
    // remove from the real pool.
    if (target !== pool) {
      const idx = pool.findIndex((t) => t.id === chosen.id)
      if (idx >= 0) pool.splice(idx, 1)
    }
    picked.push(chosen)
    perCategory.set(chosen.category, (perCategory.get(chosen.category) ?? 0) + 1)
  }

  // Archetypes: shuffled deck, round-robin — a batch spans shapes by construction.
  const deck = shuffle([...ARCHETYPE_IDS], rng)
  return picked.map((territory, i) => ({
    territory,
    archetype: deck[i % deck.length],
  }))
}

/** Render the per-slot exploration map for a generation prompt. */
export function renderExplorationBlock(frames: ExplorationFrame[]): string {
  if (frames.length === 0) return ""
  const lines = frames.map((f, i) => {
    const hint = f.territory.hint_ar ? ` — ${f.territory.hint_ar}` : ""
    const ws = f.territory.kind === "white_space" ? " (white space — under-explored, resonant)" : ""
    return `  slot ${i + 1}: territory «${f.territory.label_ar}»${ws}${hint}\n           archetype: ${f.archetype}`
  })
  return [
    "# Exploration map for THIS batch (one topic per slot — assigned, not chosen)",
    "Each slot names a TERRITORY (where the idea lives) and an ARCHETYPE (its shape).",
    "Dig into the territory until you find the specific, surprising, human episode inside",
    "it — never a generic overview of the territory itself. If a slot's territory is",
    "genuinely infertile for a great episode, you may swap to a NEIGHBORING territory you",
    "haven't used in this batch — but never collapse two slots into similar ideas.",
    "",
    ...lines,
  ].join("\n")
}

// ─── DB loaders (fire-safe) ───────────────────────────────────────────────────

/** Territories this season's candidates already covered (subcategory ids). */
export async function loadUsedTerritoryIds(seasonId: string | null): Promise<Set<string>> {
  if (!db || !seasonId) return new Set()
  try {
    const rows = await db
      .select({ sub: khatMapEpisodeCandidates.topic_subcategory })
      .from(khatMapEpisodeCandidates)
      .where(
        and(
          eq(khatMapEpisodeCandidates.season_id, seasonId),
          isNotNull(khatMapEpisodeCandidates.topic_subcategory),
        ),
      )
    return new Set(rows.map((r) => r.sub as string).filter(Boolean))
  } catch {
    return new Set()
  }
}

/** Corpus white-space themes (resonant + under-explored), best first. */
export async function loadWhiteSpaceThemes(limit = 12): Promise<WhiteSpaceTheme[]> {
  if (!db) return []
  try {
    const rows = await db
      .select({
        slug: corpusThemes.slug,
        label_ar: corpusThemes.label_ar,
        description_ar: corpusThemes.description_ar,
        resonance: corpusThemes.resonance_score,
      })
      .from(corpusThemes)
      .where(eq(corpusThemes.is_white_space, true))
    return rows
      .sort((a, b) => (b.resonance ?? 0) - (a.resonance ?? 0))
      .slice(0, limit)
      .map((r) => ({ slug: r.slug, label_ar: r.label_ar, description_ar: r.description_ar }))
  } catch {
    return []
  }
}
