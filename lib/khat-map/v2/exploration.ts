/**
 * Exploration frames — structured variety at GENERATION time.
 *
 * Root cause of "every batch feels the same": both engines let the model choose
 * its own ground, and an LLM's unguided picks collapse to the same attractors
 * (the hybrid engine literally cross-multiplied 7 frozen market-cluster words ×
 * 12 introspective lenses). Post-hoc selection can only reorder what generation
 * produced — it can never create range that was never generated.
 *
 * The fix: each batch gets an EXPLORATION MAP — one frame per slot, each frame an
 * assignment sampled by the HARNESS, not the model. Since the constitution
 * (2026-09-28) a slot is (audience segment × life-stage concern × field from
 * the constitution's 50+ list × archetype), with a Knowledge-Universe
 * territory kept as texture + the coverage tag:
 *
 *   • fields = KHAT_DOORS (lib/khat-map/core/constitution.ts). Doors are dealt
 *     from a shuffled deck, so a batch spreads across the 7 doors; no field
 *     repeats inside a batch.
 *   • segments alternate (٢٠–٣٥ / ٣٥–٦٠), so both are represented whenever a
 *     batch has ≥ 2 slots; each slot draws a concern of its segment without
 *     repeats. No ratios beyond "varied" (Khaled: the only rule is variety).
 *
 *   • territories = the Knowledge-Universe subcategories the constitution
 *     ALLOWS (FORBIDDEN_TERRITORY_IDS are never sampled) weighted by their
 *     category's lens fit, + the corpus white-space themes (weighted 3×),
 *     MINUS the territories this season's candidates already used → sampling
 *     WITHOUT replacement across batches.
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
import { FORBIDDEN_TERRITORY_IDS, KNOWLEDGE_UNIVERSE, lensFit } from "./knowledge-universe"
import { lexiconPolicyHits } from "@/lib/khat-map/core/policy"
import { ARCHETYPE_IDS, type ArchetypeId } from "./creative-brief"
import {
  KHAT_DOORS,
  KHAT_SEGMENTS,
  type KhatDoorId,
  type KhatSegmentId,
} from "@/lib/khat-map/core/constitution"
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
  /** The constitution field this slot's lived experience lives in. */
  field: { id: string; label_ar: string; door: KhatDoorId; door_label_ar: string }
  /** The audience segment the slot speaks to, and one of its life-stage concerns. */
  segment: { id: KhatSegmentId; label_ar: string; concern_ar: string }
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
      // The constitution's forbidden territories are never in the pool.
      if (FORBIDDEN_TERRITORY_IDS.has(s.id)) continue
      out.push({
        id: s.id,
        label_ar: s.label_ar,
        hint_ar: s.scope_ar,
        category: cat.id,
        kind: "universe",
        weight: lensFit(cat.id),
      })
    }
  }
  return out
}

/** A corpus theme the constitution allows (see buildExplorationFrames). */
export function isAllowedWhiteSpace(w: WhiteSpaceTheme): boolean {
  if (FORBIDDEN_TERRITORY_IDS.has(w.slug.trim().toLowerCase())) return false
  return lexiconPolicyHits(`${w.label_ar}. ${w.description_ar ?? ""}`).length === 0
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

  // "3×" means three times an AVERAGE territory — universe weights now carry
  // the lens fit (0.5–3), so a flat 3 would have sunk white space below a
  // human-stories territory.
  const universe = universePool()
  const meanWeight = universe.reduce((sum, t) => sum + t.weight, 0) / Math.max(1, universe.length)
  // Corpus white-space themes obey the same policy as the universe: a slug
  // that IS a forbidden territory, or a label/description that hits the
  // policy lexicon, is never sampled (QA 2026-09-28: «السياسة الكويتية ومجلس
  // الأمة» was drawn 118 times in 200 because this path skipped the check).
  const whiteSpace: Weighted[] = (opts.whiteSpace ?? []).filter(isAllowedWhiteSpace).map((w) => ({
    id: w.slug,
    label_ar: w.label_ar,
    hint_ar: w.description_ar ?? "",
    category: "corpus",
    kind: "white_space" as const,
    weight: WHITE_SPACE_WEIGHT * meanWeight,
  }))

  // Fresh territories first; if the season has explored nearly everything,
  // refill with used ones rather than under-delivering frames.
  let pool = [...universe, ...whiteSpace].filter((t) => !used.has(t.id))
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
  const fields = assignFields(picked.length, rng)
  const segments = assignSegments(picked.length, rng)
  return picked.map((territory, i) => ({
    territory,
    archetype: deck[i % deck.length],
    field: fields[i],
    segment: segments[i],
  }))
}

/**
 * One field per slot: doors dealt from a shuffled deck (a batch of ≥ 7 slots
 * touches every door), a random unused field of that door, and never the
 * same field twice in a batch while any unused field exists.
 */
function assignFields(count: number, rng: () => number): ExplorationFrame["field"][] {
  const doors = shuffle([...KHAT_DOORS], rng)
  const used = new Set<string>()
  const out: ExplorationFrame["field"][] = []
  for (let i = 0; i < count; i++) {
    const door = doors[i % doors.length]
    let pool = door.fields.filter((f) => !used.has(f.id)).map((f) => ({ f, d: door }))
    if (pool.length === 0) {
      pool = KHAT_DOORS.flatMap((d) => d.fields.filter((f) => !used.has(f.id)).map((f) => ({ f, d })))
    }
    if (pool.length === 0) {
      used.clear() // more slots than fields: start a second pass
      pool = door.fields.map((f) => ({ f, d: door }))
    }
    const pick = pool[Math.floor(rng() * pool.length)]
    used.add(pick.f.id)
    out.push({ id: pick.f.id, label_ar: pick.f.label_ar, door: pick.d.id, door_label_ar: pick.d.label_ar })
  }
  return out
}

/**
 * Segments alternate from a random start, so a batch of ≥ 2 slots always has
 * both; each draws its concerns from a shuffled deck (no repeat until the
 * segment's concerns run out).
 */
function assignSegments(count: number, rng: () => number): ExplorationFrame["segment"][] {
  const start = Math.floor(rng() * KHAT_SEGMENTS.length)
  const decks = new Map(KHAT_SEGMENTS.map((s) => [s.id, shuffle([...s.concerns_ar], rng)]))
  const dealt = new Map<KhatSegmentId, number>()
  const out: ExplorationFrame["segment"][] = []
  for (let i = 0; i < count; i++) {
    const seg = KHAT_SEGMENTS[(start + i) % KHAT_SEGMENTS.length]
    const deck = decks.get(seg.id)!
    const n = dealt.get(seg.id) ?? 0
    dealt.set(seg.id, n + 1)
    out.push({ id: seg.id, label_ar: seg.label_ar, concern_ar: deck[n % deck.length] })
  }
  return out
}

/** Render the per-slot exploration map for a generation prompt. */
export function renderExplorationBlock(frames: ExplorationFrame[]): string {
  if (frames.length === 0) return ""
  const lines = frames.map((f, i) => {
    const hint = f.territory.hint_ar ? ` — ${f.territory.hint_ar}` : ""
    const ws = f.territory.kind === "white_space" ? " (white space — under-explored, resonant)" : ""
    return [
      `  slot ${i + 1}: field «${f.field.label_ar}» (door: ${f.field.door_label_ar})`,
      `           audience: ${f.segment.label_ar} — concern «${f.segment.concern_ar}»`,
      `           territory (texture + coverage tag): «${f.territory.label_ar}»${ws}${hint}`,
      `           archetype: ${f.archetype}`,
    ].join("\n")
  })
  return [
    "# Exploration map for THIS batch (one topic per slot — assigned, not chosen)",
    "Each slot names a FIELD (the lived experience at its heart), an AUDIENCE segment and",
    "the life-stage concern it answers, a TERRITORY (texture + the coverage tag) and an",
    "ARCHETYPE (its shape). Find the specific real person's experience inside the field",
    "that speaks to that concern — never a generic overview of the field. If a slot is",
    "genuinely infertile, you may swap its field for another field of the SAME door you",
    "haven't used in this batch — but never collapse two slots into similar ideas, and",
    "never drift into politics, religious dispute, scandal or someone else's privacy.",
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
