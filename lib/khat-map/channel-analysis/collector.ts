/**
 * Channel signal collector.
 *
 * This module is the sole grounding boundary for channel analysis — it reads
 * what Khat has actually published (episodes, enrichments, guests,
 * categories, quotes) and computes quantitative signals the Gemini pass
 * later reasons over.
 *
 * Design rule: the collector NEVER invents facts. When data is missing
 * (e.g. enrichment rows for old episodes, view counts that are zero) the
 * `coverage` object records the gap so the fingerprint surfaces it as a
 * coverage_note rather than pretending the channel is thinner than it is.
 *
 * The output is a compact, deterministic `ChannelSignals` payload that both
 * (a) feeds the Gemini prompt and (b) gets stored alongside the raw Gemini
 * output on the fingerprint row for future audit / diffing.
 */

import { db } from "@/lib/db"
import {
  episodes,
  episodeEnrichments,
  episodeOverrides,
  hiddenEpisodes,
  deletedEpisodes,
  guests,
  episodeCategories,
  quotes,
} from "@/lib/db/schema"
import { inArray, notInArray, sql } from "drizzle-orm"

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single episode row reshaped for the analyzer — titles resolved to their
 * admin override when one exists, enrichment + guest + category joined in.
 */
export interface EpisodeSignalRow {
  id: string
  title: string
  description: string | null
  summary: string | null
  hero_summary: string | null
  full_summary: string | null
  why_this_conversation: string | null
  central_question: string | null
  takeaways: string[]
  mood: string | null
  duration_minutes: number
  view_count: number
  release_date: string
  episode_number: number | null
  season: number | null
  guest_name: string | null
  guest_id: string | null
  category_name: string | null
  category_slug: string | null
  quote_count: number
}

export interface GuestAppearance {
  guest_id: string
  guest_name: string
  appearance_count: number
  total_views: number
  avg_views: number
  episode_ids: string[]
}

export interface KeywordFrequency {
  keyword: string
  count: number
  sample_episode_ids: string[]
}

export interface LengthBucket {
  label: string
  /** Inclusive lower bound in minutes. */
  min_minutes: number
  /** Exclusive upper bound in minutes, or null for open-ended. */
  max_minutes: number | null
  count: number
  avg_views: number
}

export interface CategoryDistribution {
  category_slug: string
  category_name: string
  episode_count: number
  avg_views: number
}

export interface ChannelCoverage {
  total_episodes: number
  non_hidden_episodes: number
  with_hero_summary: number
  with_full_summary: number
  with_takeaways: number
  with_guest_assigned: number
  with_category_assigned: number
  with_view_count: number
  with_any_enrichment: number
  earliest_release_date: string | null
  latest_release_date: string | null
  /** Human-readable coverage notes for the analyzer + UI. */
  notes: string[]
}

export interface ChannelSignals {
  coverage: ChannelCoverage
  /** Episodes with the highest view counts — bounded to top N. */
  top_viewed: EpisodeSignalRow[]
  /** Most recent episodes — context for current editorial direction. */
  most_recent: EpisodeSignalRow[]
  /** A representative sample covering the full archive time span. */
  representative_sample: EpisodeSignalRow[]
  /** All episodes with mood set, grouped under each mood. */
  by_mood: Record<string, EpisodeSignalRow[]>
  /** Guests who have appeared 2+ times — signal for repeat bookings. */
  repeat_guests: GuestAppearance[]
  /** Top N keywords appearing across titles (Arabic stopwords removed). */
  title_keywords: KeywordFrequency[]
  /** Distribution of episode lengths across buckets. */
  length_buckets: LengthBucket[]
  /** Episode count + avg views per category. */
  by_category: CategoryDistribution[]
}

// ─── Configuration ───────────────────────────────────────────────────────────

const TOP_VIEWED_LIMIT = 12
const MOST_RECENT_LIMIT = 10
const REPRESENTATIVE_SAMPLE_LIMIT = 30
const TITLE_KEYWORD_LIMIT = 40

const LENGTH_BUCKETS: Omit<LengthBucket, "count" | "avg_views">[] = [
  { label: "قصيرة (أقل من 30 دقيقة)", min_minutes: 0, max_minutes: 30 },
  { label: "متوسطة (30-60 دقيقة)", min_minutes: 30, max_minutes: 60 },
  { label: "طويلة (60-90 دقيقة)", min_minutes: 60, max_minutes: 90 },
  { label: "عميقة (90-120 دقيقة)", min_minutes: 90, max_minutes: 120 },
  { label: "طويلة جدًا (أكثر من 120 دقيقة)", min_minutes: 120, max_minutes: null },
]

/**
 * Arabic stopwords — intentionally compact. We're looking for THEMATIC
 * keywords (حياة, الكويت, خوف, ذاكرة, ...) not syntactic tokens.
 */
const ARABIC_STOPWORDS = new Set<string>([
  "في", "من", "إلى", "على", "عن", "مع", "أن", "إن", "أو", "لا", "ما", "كما",
  "قد", "هل", "ثم", "بل", "كل", "كان", "كانت", "هذه", "هذا", "ذلك", "التي",
  "الذي", "هي", "هو", "نحن", "هم", "هن", "انت", "أنت", "أنا", "يا", "أي",
  "غير", "بين", "عند", "حتى", "لكن", "لأن", "لم", "لن", "لقد", "قبل", "بعد",
  "تحت", "فوق", "أمام", "خلف", "حول", "هنا", "هناك", "الآن", "اليوم", "أيضا",
  "أيضًا", "لذلك", "كيف", "ماذا", "متى", "أين", "من هو", "هي التي",
  "مع مع", "باللغة", "العربية", "بودكاست", "حلقة", "الحلقة", "ضيف", "ضيفي",
  "|", "#", "-", "—", "–", "الجزء",
])

// Guard function names used by the downstream analyzer
export type CollectorResult = ChannelSignals

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeViewCount(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0
}

function asIsoDate(v: Date | string | null | undefined): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

/**
 * Tokenize a title into thematic keywords. The goal is not linguistically
 * perfect — it's "does this word appear enough times that it's a pattern?".
 */
function extractThematicTokens(title: string): string[] {
  // Strip punctuation, normalize Arabic variant characters, split on whitespace.
  const cleaned = title
    .normalize("NFKC")
    .replace(/[\u064B-\u0652\u0670]/g, "") // Arabic diacritics
    .replace(/[.,!?؟،:;'"“”()[\]{}<>\/\\|–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const tokens = cleaned.split(/\s+/).filter(Boolean)
  const out: string[] = []
  for (const raw of tokens) {
    const t = raw.trim()
    if (!t) continue
    if (t.length < 3) continue
    if (/^\d+$/.test(t)) continue
    if (ARABIC_STOPWORDS.has(t)) continue
    // Strip definite article so "الكويت" and "كويت" collapse.
    const stripped = t.startsWith("ال") && t.length > 4 ? t.slice(2) : t
    if (ARABIC_STOPWORDS.has(stripped)) continue
    out.push(stripped)
  }
  return out
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Read the full channel archive and produce the signals payload.
 *
 * Reads required:
 *   - episodes (filtered by hidden + tombstone)
 *   - episode_overrides (custom titles win over YouTube titles)
 *   - episode_enrichments (editorial summaries + takeaways)
 *   - guests (names for guest-repeat analysis)
 *   - episode_categories (category distribution)
 *   - quotes (count per episode, light signal)
 */
export async function collectChannelSignals(): Promise<ChannelSignals> {
  if (!db) {
    throw new Error("Database client is not configured")
  }

  // 1. Resolve the exclusion sets (hidden + tombstoned)
  const [hiddenRows, deletedRows] = await Promise.all([
    db.select({ episode_id: hiddenEpisodes.episode_id }).from(hiddenEpisodes),
    db.select({ episode_id: deletedEpisodes.episode_id }).from(deletedEpisodes),
  ])
  const hiddenSet = new Set(hiddenRows.map((r) => r.episode_id))
  const deletedSet = new Set(deletedRows.map((r) => r.episode_id))
  const excludedIds = [...new Set([...hiddenSet, ...deletedSet])]

  // 2. Pull the episode corpus
  const rawEpisodes = excludedIds.length
    ? await db
        .select()
        .from(episodes)
        .where(notInArray(episodes.id, excludedIds))
    : await db.select().from(episodes)

  const episodeIds = rawEpisodes.map((e) => e.id)
  if (episodeIds.length === 0) {
    return emptyChannelSignals()
  }

  // 3. Enrichments + overrides + quotes counts in parallel
  const [enrichments, overrides, guestsRows, categoriesRows, quoteCounts] =
    await Promise.all([
      db
        .select()
        .from(episodeEnrichments)
        .where(inArray(episodeEnrichments.episode_id, episodeIds)),
      db
        .select()
        .from(episodeOverrides)
        .where(inArray(episodeOverrides.episode_id, episodeIds)),
      db.select({ id: guests.id, name: guests.name }).from(guests),
      db.select().from(episodeCategories),
      db
        .select({
          episode_id: quotes.episode_id,
          count: sql<number>`count(*)::int`,
        })
        .from(quotes)
        .where(inArray(quotes.episode_id, episodeIds))
        .groupBy(quotes.episode_id),
    ])

  const enrichmentByEpisode = new Map(enrichments.map((e) => [e.episode_id, e]))
  const overrideByEpisode = new Map(overrides.map((o) => [o.episode_id, o]))
  const guestById = new Map(guestsRows.map((g) => [g.id, g.name]))
  const categoryById = new Map(categoriesRows.map((c) => [c.id, c]))
  const quoteCountByEpisode = new Map(
    quoteCounts.map((q) => [q.episode_id, Number(q.count) || 0]),
  )

  // 4. Reshape into signal rows
  const rows: EpisodeSignalRow[] = rawEpisodes.map((ep) => {
    const override = overrideByEpisode.get(ep.id)
    const enrichment = enrichmentByEpisode.get(ep.id)
    const title =
      override?.custom_title && override.custom_title.trim().length > 0
        ? override.custom_title
        : ep.title
    const description =
      override?.custom_description && override.custom_description.trim().length > 0
        ? override.custom_description
        : ep.description
    const categoryRow = ep.category_id ? categoryById.get(ep.category_id) : null
    const guestName = ep.guest_id ? guestById.get(ep.guest_id) ?? null : null

    return {
      id: ep.id,
      title,
      description: description ?? null,
      summary: ep.summary ?? null,
      hero_summary: enrichment?.hero_summary ?? null,
      full_summary: enrichment?.full_summary ?? null,
      why_this_conversation: enrichment?.why_this_conversation ?? null,
      central_question: enrichment?.central_question ?? null,
      takeaways: (enrichment?.takeaways as string[] | null) ?? [],
      mood: ep.mood ?? null,
      duration_minutes: ep.duration_minutes ?? 0,
      view_count: normalizeViewCount(ep.view_count),
      release_date: asIsoDate(ep.release_date) ?? "",
      episode_number: ep.episode_number ?? null,
      season: ep.season ?? null,
      guest_name: guestName,
      guest_id: ep.guest_id ?? null,
      category_name: categoryRow?.name ?? null,
      category_slug: categoryRow?.slug ?? null,
      quote_count: quoteCountByEpisode.get(ep.id) ?? 0,
    }
  })

  // 5. Coverage audit — what's missing?
  const coverage: ChannelCoverage = {
    total_episodes: rawEpisodes.length + hiddenSet.size,
    non_hidden_episodes: rows.length,
    with_hero_summary: rows.filter((r) => !!r.hero_summary).length,
    with_full_summary: rows.filter((r) => !!r.full_summary).length,
    with_takeaways: rows.filter((r) => r.takeaways.length > 0).length,
    with_guest_assigned: rows.filter((r) => !!r.guest_id).length,
    with_category_assigned: rows.filter((r) => !!r.category_slug).length,
    with_view_count: rows.filter((r) => r.view_count > 0).length,
    with_any_enrichment: rows.filter(
      (r) => !!(r.hero_summary || r.full_summary || r.takeaways.length),
    ).length,
    earliest_release_date: null,
    latest_release_date: null,
    notes: [],
  }
  const dated = rows
    .map((r) => r.release_date)
    .filter((d) => d && d.length >= 10)
    .sort()
  if (dated.length > 0) {
    coverage.earliest_release_date = dated[0]
    coverage.latest_release_date = dated[dated.length - 1]
  }
  if (coverage.non_hidden_episodes === 0) {
    coverage.notes.push("لا توجد حلقات ظاهرة في الأرشيف — لم يتم التحليل.")
  }
  if (coverage.with_any_enrichment === 0) {
    coverage.notes.push(
      "لا توجد ملخصات تحريرية لأي حلقة — التحليل يعتمد على العناوين والأوصاف فقط.",
    )
  } else if (
    coverage.with_any_enrichment / Math.max(1, coverage.non_hidden_episodes) <
    0.3
  ) {
    coverage.notes.push(
      `تغطية ملخصات محدودة (${coverage.with_any_enrichment} من ${coverage.non_hidden_episodes} حلقة). قد يكون التحليل سطحيًا للحلقات الأقدم.`,
    )
  }
  if (coverage.with_view_count / Math.max(1, coverage.non_hidden_episodes) < 0.5) {
    coverage.notes.push(
      `أعداد المشاهدات مفقودة لكثير من الحلقات — ترتيب الأقوى أداءً تقريبي.`,
    )
  }
  if (coverage.with_guest_assigned / Math.max(1, coverage.non_hidden_episodes) < 0.5) {
    coverage.notes.push(
      `الضيف غير معيّن في كثير من الحلقات — تحليل أنماط الضيوف تقريبي.`,
    )
  }

  // 6. Build the ranked slices
  const byViews = [...rows].sort((a, b) => b.view_count - a.view_count)
  const top_viewed = byViews.slice(0, TOP_VIEWED_LIMIT)

  const byReleaseDesc = [...rows].sort((a, b) =>
    b.release_date.localeCompare(a.release_date),
  )
  const most_recent = byReleaseDesc.slice(0, MOST_RECENT_LIMIT)

  // Representative sample — take an evenly-spaced slice across the timeline
  // so Gemini sees depth from every era, not just recent.
  const byReleaseAsc = [...rows].sort((a, b) =>
    a.release_date.localeCompare(b.release_date),
  )
  const stride = Math.max(1, Math.floor(byReleaseAsc.length / REPRESENTATIVE_SAMPLE_LIMIT))
  const representative_sample: EpisodeSignalRow[] = []
  for (let i = 0; i < byReleaseAsc.length && representative_sample.length < REPRESENTATIVE_SAMPLE_LIMIT; i += stride) {
    representative_sample.push(byReleaseAsc[i])
  }

  // 7. Mood grouping
  const by_mood: Record<string, EpisodeSignalRow[]> = {}
  for (const r of rows) {
    if (!r.mood) continue
    const key = r.mood.trim()
    if (!key) continue
    if (!by_mood[key]) by_mood[key] = []
    by_mood[key].push(r)
  }

  // 8. Repeat guests (2+ appearances)
  const guestAppearances = new Map<string, GuestAppearance>()
  for (const r of rows) {
    if (!r.guest_id || !r.guest_name) continue
    const existing = guestAppearances.get(r.guest_id)
    if (existing) {
      existing.appearance_count += 1
      existing.total_views += r.view_count
      existing.episode_ids.push(r.id)
    } else {
      guestAppearances.set(r.guest_id, {
        guest_id: r.guest_id,
        guest_name: r.guest_name,
        appearance_count: 1,
        total_views: r.view_count,
        avg_views: 0,
        episode_ids: [r.id],
      })
    }
  }
  const repeat_guests = [...guestAppearances.values()]
    .filter((g) => g.appearance_count >= 2)
    .map((g) => ({
      ...g,
      avg_views: Math.round(g.total_views / Math.max(1, g.appearance_count)),
    }))
    .sort((a, b) => b.appearance_count - a.appearance_count)

  // 9. Title keyword frequencies
  const keywordMap = new Map<string, { count: number; episodes: Set<string> }>()
  for (const r of rows) {
    const tokens = extractThematicTokens(r.title)
    for (const tok of tokens) {
      const entry = keywordMap.get(tok)
      if (entry) {
        entry.count += 1
        if (entry.episodes.size < 5) entry.episodes.add(r.id)
      } else {
        keywordMap.set(tok, { count: 1, episodes: new Set([r.id]) })
      }
    }
  }
  const title_keywords: KeywordFrequency[] = [...keywordMap.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, TITLE_KEYWORD_LIMIT)
    .map(([keyword, v]) => ({
      keyword,
      count: v.count,
      sample_episode_ids: [...v.episodes],
    }))

  // 10. Length buckets
  const length_buckets: LengthBucket[] = LENGTH_BUCKETS.map((b) => {
    const matching = rows.filter((r) => {
      if (r.duration_minutes < b.min_minutes) return false
      if (b.max_minutes !== null && r.duration_minutes >= b.max_minutes) return false
      return true
    })
    const avgViews =
      matching.length > 0
        ? Math.round(
            matching.reduce((a, r) => a + r.view_count, 0) / matching.length,
          )
        : 0
    return { ...b, count: matching.length, avg_views: avgViews }
  })

  // 11. Category distribution
  const categoryMap = new Map<
    string,
    { slug: string; name: string; episodes: EpisodeSignalRow[] }
  >()
  for (const r of rows) {
    if (!r.category_slug || !r.category_name) continue
    const existing = categoryMap.get(r.category_slug)
    if (existing) {
      existing.episodes.push(r)
    } else {
      categoryMap.set(r.category_slug, {
        slug: r.category_slug,
        name: r.category_name,
        episodes: [r],
      })
    }
  }
  const by_category: CategoryDistribution[] = [...categoryMap.values()]
    .map((c) => ({
      category_slug: c.slug,
      category_name: c.name,
      episode_count: c.episodes.length,
      avg_views:
        c.episodes.length > 0
          ? Math.round(
              c.episodes.reduce((a, r) => a + r.view_count, 0) / c.episodes.length,
            )
          : 0,
    }))
    .sort((a, b) => b.episode_count - a.episode_count)

  return {
    coverage,
    top_viewed,
    most_recent,
    representative_sample,
    by_mood,
    repeat_guests,
    title_keywords,
    length_buckets,
    by_category,
  }
}

function emptyChannelSignals(): ChannelSignals {
  return {
    coverage: {
      total_episodes: 0,
      non_hidden_episodes: 0,
      with_hero_summary: 0,
      with_full_summary: 0,
      with_takeaways: 0,
      with_guest_assigned: 0,
      with_category_assigned: 0,
      with_view_count: 0,
      with_any_enrichment: 0,
      earliest_release_date: null,
      latest_release_date: null,
      notes: ["لا توجد حلقات ظاهرة في الأرشيف."],
    },
    top_viewed: [],
    most_recent: [],
    representative_sample: [],
    by_mood: {},
    repeat_guests: [],
    title_keywords: [],
    length_buckets: [],
    by_category: [],
  }
}

// ─── Prompt corpus distiller ─────────────────────────────────────────────────

/**
 * Distill the signals into a compact, bounded Arabic corpus the Gemini
 * reasoning model can ingest. The corpus is deterministic — given the same
 * DB state, it produces identical text — so analyses are reproducible.
 *
 * Size budget: we target ≤ ~7k characters so the structured JSON response
 * has room to breathe under the 8k maxOutputTokens limit configured in the
 * existing `geminiJson` helper.
 */
export function buildChannelCorpus(signals: ChannelSignals): string {
  const lines: string[] = []
  const cov = signals.coverage

  lines.push("## إحصاءات أرشيف خط")
  lines.push(
    `- إجمالي الحلقات الظاهرة: ${cov.non_hidden_episodes}`,
    `- حلقات بملخصات تحريرية: ${cov.with_any_enrichment}`,
    `- حلقات لها ضيف معيّن: ${cov.with_guest_assigned}`,
    `- حلقات لها تصنيف: ${cov.with_category_assigned}`,
    `- مدى التواريخ: ${cov.earliest_release_date ?? "—"} → ${cov.latest_release_date ?? "—"}`,
  )
  if (cov.notes.length) {
    lines.push("- ملاحظات تغطية:")
    cov.notes.forEach((n) => lines.push(`  · ${n}`))
  }

  const renderEpisode = (r: EpisodeSignalRow, i: number) => {
    const parts: string[] = []
    parts.push(`${i + 1}. «${r.title}»`)
    if (r.guest_name) parts.push(`ضيف: ${r.guest_name}`)
    if (r.category_name) parts.push(`تصنيف: ${r.category_name}`)
    if (r.duration_minutes) parts.push(`${r.duration_minutes} دقيقة`)
    if (r.view_count) parts.push(`${r.view_count.toLocaleString("en-US")} مشاهدة`)
    if (r.release_date) parts.push(r.release_date)
    const head = `   ${parts.join(" · ")}`

    const body: string[] = []
    const summary =
      r.hero_summary || r.full_summary || r.summary || r.description
    if (summary) {
      const trimmed = summary.trim().replace(/\s+/g, " ").slice(0, 320)
      body.push(`   ملخص: ${trimmed}${summary.length > 320 ? "…" : ""}`)
    }
    if (r.takeaways.length) {
      body.push(
        `   أبرز النقاط: ${r.takeaways.slice(0, 3).map((t) => `«${t}»`).join("، ")}`,
      )
    }
    if (r.central_question) {
      body.push(`   سؤال محوري: ${r.central_question.slice(0, 180)}`)
    }
    return [head, ...body].join("\n")
  }

  if (signals.top_viewed.length) {
    lines.push("\n## الحلقات الأعلى مشاهدة")
    signals.top_viewed.slice(0, 8).forEach((r, i) => lines.push(renderEpisode(r, i)))
  }

  if (signals.most_recent.length) {
    lines.push("\n## أحدث الحلقات (توجه الموسم الحالي)")
    signals.most_recent.slice(0, 6).forEach((r, i) => lines.push(renderEpisode(r, i)))
  }

  if (signals.representative_sample.length) {
    lines.push("\n## عيّنة ممتدة عبر الأرشيف")
    signals.representative_sample
      .slice(0, 12)
      .forEach((r, i) => lines.push(renderEpisode(r, i)))
  }

  if (signals.repeat_guests.length) {
    lines.push("\n## ضيوف تكرّروا")
    signals.repeat_guests.slice(0, 8).forEach((g, i) => {
      lines.push(
        `${i + 1}. ${g.guest_name} — ${g.appearance_count} ظهور، متوسط ${g.avg_views.toLocaleString("en-US")} مشاهدة`,
      )
    })
  }

  if (signals.title_keywords.length) {
    lines.push("\n## كلمات متكررة في العناوين (مؤشر مواضيع)")
    const top = signals.title_keywords.slice(0, 20)
    lines.push(
      "   " + top.map((k) => `${k.keyword} (${k.count})`).join("، "),
    )
  }

  if (signals.length_buckets.some((b) => b.count > 0)) {
    lines.push("\n## توزيع أطوال الحلقات")
    for (const b of signals.length_buckets) {
      if (b.count === 0) continue
      lines.push(
        `- ${b.label}: ${b.count} حلقة، متوسط ${b.avg_views.toLocaleString("en-US")} مشاهدة`,
      )
    }
  }

  if (signals.by_category.length) {
    lines.push("\n## التصنيفات")
    for (const c of signals.by_category.slice(0, 10)) {
      lines.push(
        `- ${c.category_name}: ${c.episode_count} حلقة، متوسط ${c.avg_views.toLocaleString("en-US")} مشاهدة`,
      )
    }
  }

  const moodEntries = Object.entries(signals.by_mood)
    .map(([mood, eps]) => ({ mood, count: eps.length }))
    .sort((a, b) => b.count - a.count)
  if (moodEntries.length) {
    lines.push("\n## الأمزجة التحريرية")
    lines.push(
      "   " + moodEntries.slice(0, 10).map((m) => `${m.mood} (${m.count})`).join("، "),
    )
  }

  const corpus = lines.join("\n")
  // Hard cap — protect the Gemini context window.
  return corpus.length > 7000 ? corpus.slice(0, 7000) + "\n\n[… تم تقليص النص]" : corpus
}

// Kept as a named export so future modules (e.g. diff viewers) can run
// cheap checks without re-hitting the DB.
export async function countVisibleEpisodes(): Promise<number> {
  if (!db) return 0
  const [hiddenRows, deletedRows] = await Promise.all([
    db.select({ episode_id: hiddenEpisodes.episode_id }).from(hiddenEpisodes),
    db.select({ episode_id: deletedEpisodes.episode_id }).from(deletedEpisodes),
  ])
  const excluded = [
    ...new Set([...hiddenRows.map((r) => r.episode_id), ...deletedRows.map((r) => r.episode_id)]),
  ]
  const base = db.select({ id: episodes.id }).from(episodes)
  const rows = excluded.length
    ? await base.where(notInArray(episodes.id, excluded))
    : await base
  return rows.length
}

