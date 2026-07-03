/**
 * Corpus intelligence (Phase B3) — derive LIVING themes + resonance / saturation
 * / white-space signals from corpus_episodes.
 *
 * Pipeline:
 *   1. embed every episode's title(+desc) — text-embedding-3-small.
 *   2. spherical k-means over the embeddings → k clusters.
 *   3. LLM-label each cluster from its representative titles.
 *   4. assign each episode its theme; persist corpus_themes.
 *   5. compute per-theme signals: resonance (median engagement), saturation
 *      (episode count × source breadth), white-space (resonant + under-covered,
 *      or a Khat gap), Khat coverage.
 *
 * A projection: recomputable from the corpus, never hand-authored — so it grows
 * as the corpus grows. B4 reads these; Phase C's Living Knowledge Universe
 * evolves from them.
 */

import { eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { corpusEpisodes, corpusThemes } from "@/lib/db/schema/corpus"
import { batchEmbed } from "@/lib/khat-map/learning/embeddings"
import { runAiTask } from "@/lib/ai-router"

// ─── 1. Embed ──────────────────────────────────────────────────────────────────

export async function embedCorpus(): Promise<number> {
  if (!db) return 0
  const rows = await db
    .select({ id: corpusEpisodes.id, title: corpusEpisodes.title, description: corpusEpisodes.description })
    .from(corpusEpisodes)
    .where(isNull(corpusEpisodes.embedding))
  if (rows.length === 0) return 0
  const texts = rows.map((r) => `${r.title}\n${(r.description ?? "").slice(0, 300)}`)
  const vectors = await batchEmbed(texts)
  for (let i = 0; i < rows.length; i++) {
    await db
      .update(corpusEpisodes)
      .set({ embedding: vectors[i], analyzed_at: new Date() })
      .where(eq(corpusEpisodes.id, rows[i].id))
  }
  return rows.length
}

// ─── 2. Spherical k-means ──────────────────────────────────────────────────────

function normalize(v: number[]): number[] {
  let mag = 0
  for (const x of v) mag += x * x
  mag = Math.sqrt(mag) || 1
  return v.map((x) => x / mag)
}
function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

interface EpisodeVec {
  id: string
  source_slug: string
  is_khat: boolean
  title: string
  engagement: number | null
  vec: number[]
}

/** Deterministic-ish k-means (seeded farthest-first init; no Math.random). */
function kmeans(points: EpisodeVec[], k: number, iters = 25): number[] {
  const dim = points[0].vec.length
  // Farthest-first initialization: start at index 0, then repeatedly pick the
  // point least similar to any chosen centroid.
  const centroidIdx: number[] = [0]
  while (centroidIdx.length < k) {
    let worst = -1
    let worstSim = Infinity
    for (let i = 0; i < points.length; i++) {
      let best = -Infinity
      for (const ci of centroidIdx) best = Math.max(best, dot(points[i].vec, points[ci].vec))
      if (best < worstSim) {
        worstSim = best
        worst = i
      }
    }
    if (worst < 0) break
    centroidIdx.push(worst)
  }
  let centroids = centroidIdx.map((i) => points[i].vec.slice())
  const assign = new Array(points.length).fill(0)

  for (let it = 0; it < iters; it++) {
    let moved = 0
    for (let i = 0; i < points.length; i++) {
      let best = -Infinity
      let bestC = 0
      for (let c = 0; c < centroids.length; c++) {
        const s = dot(points[i].vec, centroids[c])
        if (s > best) {
          best = s
          bestC = c
        }
      }
      if (assign[i] !== bestC) moved++
      assign[i] = bestC
    }
    // Recompute centroids as the normalized mean of members.
    const sums = centroids.map(() => new Float64Array(dim))
    const counts = new Array(centroids.length).fill(0)
    for (let i = 0; i < points.length; i++) {
      const c = assign[i]
      counts[c]++
      const v = points[i].vec
      const s = sums[c]
      for (let d = 0; d < dim; d++) s[d] += v[d]
    }
    centroids = sums.map((s, c) => {
      if (counts[c] === 0) return centroids[c]
      const arr = Array.from(s, (x) => x / counts[c])
      return normalize(arr)
    })
    if (moved === 0 && it > 0) break
  }
  return assign
}

// ─── 3. LLM labeling ───────────────────────────────────────────────────────────

interface ClusterLabel {
  index: number
  slug: string
  label_ar: string
  description_ar: string
}

async function labelClusters(
  clusters: Array<{ index: number; titles: string[] }>,
): Promise<ClusterLabel[]> {
  const menu = clusters
    .map((c) => `#${c.index}\n${c.titles.slice(0, 12).map((t) => `  - ${t.slice(0, 90)}`).join("\n")}`)
    .join("\n\n")
  const system = [
    "You label clusters of Arabic-podcast episode titles. For EACH cluster, name the",
    "editorial THEME it represents — the subject/tension the episodes share, at the",
    'right altitude (not too broad like "المجتمع", not one specific episode).',
    "Return a slug (kebab, ascii), an Arabic label (2-4 words), and a one-line Arabic",
    "description of what the theme covers.",
    'Output JSON only: {"themes":[{"index":<n>,"slug":"...","label_ar":"...","description_ar":"..."}]}',
    "One entry per input cluster, echoing its index.",
  ].join("\n")
  const r = await runAiTask<{ themes?: ClusterLabel[] } | ClusterLabel[]>({
    taskKind: "editorial",
    promptVersion: "corpus-theme-label-v1",
    input: { clusters: clusters.length },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: menu },
    ],
    expectJson: true,
    timeoutMs: 180_000,
    providerOptions: { temperature: 0.3 },
  })
  const parsed = r.parsed as { themes?: ClusterLabel[] } | ClusterLabel[] | null
  const list = Array.isArray(parsed) ? parsed : parsed?.themes ?? []
  return list.filter((x) => typeof x?.index === "number" && x.slug && x.label_ar)
}

// ─── 4+5. Orchestrate: cluster, label, assign, compute signals ─────────────────

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export interface AnalyzeResult {
  embedded: number
  clusters: number
  themes: number
}

export async function analyzeCorpus(opts: { k?: number } = {}): Promise<AnalyzeResult> {
  if (!db) throw new Error("no db")
  const embedded = await embedCorpus()

  const rows = await db
    .select({
      id: corpusEpisodes.id,
      source_slug: corpusEpisodes.source_slug,
      is_khat: corpusEpisodes.is_khat,
      title: corpusEpisodes.title,
      engagement: corpusEpisodes.engagement_index,
      embedding: corpusEpisodes.embedding,
    })
    .from(corpusEpisodes)
  const points: EpisodeVec[] = rows
    .filter((r) => Array.isArray(r.embedding) && r.embedding.length > 0)
    .map((r) => ({
      id: r.id,
      source_slug: r.source_slug,
      is_khat: r.is_khat,
      title: r.title,
      engagement: r.engagement,
      vec: normalize(r.embedding as number[]),
    }))
  if (points.length === 0) throw new Error("no embedded episodes — run embedCorpus first")

  const k = Math.min(opts.k ?? 40, Math.floor(points.length / 8) || 1)
  const assign = kmeans(points, k)

  // Group members per cluster.
  const members: EpisodeVec[][] = Array.from({ length: k }, () => [])
  points.forEach((p, i) => members[assign[i]].push(p))

  // Representative titles = highest-engagement members (so labels reflect what lands).
  const clustersForLabel = members
    .map((m, index) => ({
      index,
      titles: [...m].sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0)).map((x) => x.title),
    }))
    .filter((c) => c.titles.length > 0)

  const labels = await labelClusters(clustersForLabel)
  const labelByIndex = new Map(labels.map((l) => [l.index, l]))

  // Wipe + rewrite corpus_themes (a projection), then assign episodes.
  await db.delete(corpusThemes)
  // Pass 1 — build per-theme stats in memory (so resonance can be rank-normalized).
  interface ThemeStat {
    slug: string
    label_ar: string
    description_ar: string | null
    example_titles: string[]
    centroid: number[]
    ids: string[]
    episode_count: number
    source_count: number
    khat_count: number
    mean_engagement: number
    median_engagement: number
    saturation: number
  }
  const stats: ThemeStat[] = []
  const usedSlugs = new Set<string>()
  for (let c = 0; c < k; c++) {
    const m = members[c]
    if (m.length === 0) continue
    const label = labelByIndex.get(c)
    let slug = label?.slug?.replace(/[^a-z0-9-]/gi, "-").toLowerCase() || `theme-${c}`
    while (usedSlugs.has(slug)) slug = `${slug}-${c}`
    usedSlugs.add(slug)

    const engagements = m.map((x) => x.engagement).filter((e): e is number => e != null)
    const sources = new Set(m.filter((x) => !x.is_khat).map((x) => x.source_slug))
    const dim = m[0].vec.length
    const csum = new Float64Array(dim)
    for (const x of m) for (let d = 0; d < dim; d++) csum[d] += x.vec[d]

    stats.push({
      slug,
      label_ar: label?.label_ar ?? `مجموعة ${c}`,
      description_ar: label?.description_ar ?? null,
      example_titles: clustersForLabel.find((x) => x.index === c)?.titles.slice(0, 5) ?? [],
      centroid: normalize(Array.from(csum, (x) => x / m.length)),
      ids: m.map((x) => x.id),
      episode_count: m.length,
      source_count: sources.size,
      khat_count: m.filter((x) => x.is_khat).length,
      mean_engagement: engagements.length ? engagements.reduce((a, b) => a + b, 0) / engagements.length : 0,
      median_engagement: median(engagements),
      saturation: Math.max(0, Math.min(1, (m.length / (points.length / k)) * 0.5 + (sources.size / 5) * 0.5)),
    })
  }

  // Resonance = percentile rank of median engagement across themes (discriminating,
  // robust to the absolute scale). White space = resonant + under-covered, or a Khat gap.
  const sortedByMed = [...stats].sort((a, b) => a.median_engagement - b.median_engagement)
  const rankOf = new Map(sortedByMed.map((s, i) => [s.slug, stats.length > 1 ? i / (stats.length - 1) : 1]))

  let themeCount = 0
  for (const s of stats) {
    const resonance = rankOf.get(s.slug) ?? 0
    const isWhiteSpace = resonance >= 0.55 && (s.saturation < 0.45 || s.khat_count === 0)
    await db.insert(corpusThemes).values({
      slug: s.slug,
      label_ar: s.label_ar,
      description_ar: s.description_ar,
      example_titles: s.example_titles,
      centroid: s.centroid,
      episode_count: s.episode_count,
      source_count: s.source_count,
      khat_count: s.khat_count,
      mean_engagement: s.mean_engagement,
      median_engagement: s.median_engagement,
      resonance_score: resonance,
      saturation_score: s.saturation,
      is_white_space: isWhiteSpace,
    })
    themeCount++
    if (s.ids.length) {
      await db.update(corpusEpisodes).set({ themes: [s.slug] }).where(inArray(corpusEpisodes.id, s.ids))
    }
  }

  return { embedded, clusters: k, themes: themeCount }
}
