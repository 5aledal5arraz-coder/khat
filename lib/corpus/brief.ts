/**
 * Corpus intelligence → a human-readable editorial brief.
 *
 * Renders the derived corpus_themes (resonance / saturation / white-space / Khat
 * coverage) as a summary for OPERATOR surfaces (a season-planning dashboard) and
 * Phase C's Living-Knowledge-Universe review — NOT the generation prompt.
 *
 * Note: generation grounds itself in the corpus at SELECTION time
 * (lib/corpus/novelty.ts), not by injecting this text. We tried prompt-injecting
 * the theme lists and it primed the model toward the very themes it should avoid;
 * comparing candidate embeddings to theme centroids is the objective mechanism.
 */

import { db } from "@/lib/db"
import { corpusThemes, corpusEpisodes } from "@/lib/db/schema/corpus"
import { sql } from "drizzle-orm"

export interface CorpusBriefOptions {
  /** Max themes per section. */
  perSection?: number
}

function line(label: string | null, desc: string | null): string {
  const l = (label ?? "").trim()
  const d = (desc ?? "").trim()
  return d ? `  · ${l} — ${d}` : `  · ${l}`
}

/**
 * Build the corpus editorial brief. Cached implicitly by callers (both engines
 * fetch it once per generation). Cheap: a couple of indexed reads.
 */
export async function getCorpusBrief(opts: CorpusBriefOptions = {}): Promise<string | null> {
  if (!db) return null
  const n = opts.perSection ?? 8

  const themes = await db.select().from(corpusThemes)
  if (themes.length === 0) return null

  const [{ episodes, sources }] = await db
    .select({
      episodes: sql<number>`count(*)::int`,
      sources: sql<number>`count(distinct ${corpusEpisodes.source_slug})::int`,
    })
    .from(corpusEpisodes)

  const byRes = [...themes].sort((a, b) => (b.resonance_score ?? 0) - (a.resonance_score ?? 0))
  const whiteSpace = byRes.filter((t) => t.is_white_space).slice(0, n)
  // "Proven but saturated" = the high-resonance themes that are ALSO heavily
  // covered. Handing these to the model as "what resonates" makes it do the
  // obvious version, so we frame them purely as a MINEFIELD to avoid.
  const saturated = [...themes]
    .filter((t) => (t.saturation_score ?? 0) >= 0.6)
    .sort((a, b) => (b.saturation_score ?? 0) - (a.saturation_score ?? 0))
    .slice(0, n)
  const khatLane = themes
    .filter((t) => (t.khat_count ?? 0) > 0)
    .sort((a, b) => (b.resonance_score ?? 0) - (a.resonance_score ?? 0))
    .slice(0, n)

  return [
    `# Arabic-podcast corpus intelligence (${episodes} real episodes across ${sources} shows)`,
    "Evidence from what the Arabic podcast ecosystem + Khat have ALREADY made. This is not",
    "a menu to copy — every 'proven' theme here has been done many times. Your job is the",
    "WHITE SPACE and genuinely fresh angles. If a topic is the obvious take on a well-covered",
    "theme (e.g. 'الخليج بعد النفط', 'العمل الحر', 'الهوية بين المحلي والعالمي'), it has already",
    "been made — discard it.",
    "",
    "## WHITE SPACE — resonant yet under-explored, especially by Khat (GO HERE FIRST)",
    ...(whiteSpace.length ? whiteSpace.map((t) => line(t.label_ar, t.description_ar)) : ["  · (none yet)"]),
    "",
    "## SATURATED — a minefield, done to death across these shows (skip, or ONLY a radically fresh angle)",
    ...(saturated.length ? saturated.map((t) => line(t.label_ar, null)) : ["  · (none yet)"]),
    "",
    "## Khat's proven lane (extend it with FRESH angles — never just repeat what worked)",
    ...(khatLane.length ? khatLane.map((t) => line(t.label_ar, null)) : ["  · (no Khat episodes analyzed yet)"]),
  ].join("\n")
}
