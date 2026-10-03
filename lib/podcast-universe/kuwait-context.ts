/**
 * Kuwait Context (M1 closeout addendum, 2026-10-03) — a DERIVED signal, never
 * a source of truth. It is computed on read from appearances and is only ever
 * used to (a) order the «مراجعة الجنسية» queue and (b) show a context badge.
 *
 * It NEVER sets or implies nationality: appearing on a Kuwaiti podcast is the
 * textbook "not sufficient" case of Decision 3. Nothing in this file writes,
 * and nothing that writes `nationality_*` imports it (pinned by a test).
 *
 * "Kuwaiti channel" = podcast_channels.country_code = 'KW' AND
 * registry_type = 'core_interview'. Rejected (unlinked) appearances don't count.
 *
 *   none   — 0 KW CORE appearances
 *   weak   — exactly 1
 *   strong — ≥2 KW CORE appearances (which includes ≥2 on the same KW CORE channel)
 */
import { sql } from "drizzle-orm"

export type KuwaitContextLevel = "none" | "weak" | "strong"

export interface KuwaitContext {
  kwCoreAppearanceCount: number
  kwCoreUniqueChannelCount: number
  level: KuwaitContextLevel
  reasons: string[]
}

export interface KwAppearance {
  channelName: string
}

/** Pure: KW CORE appearances (already filtered) → context. */
export function kuwaitContext(kwCoreAppearances: KwAppearance[]): KuwaitContext {
  const perChannel = new Map<string, number>()
  for (const a of kwCoreAppearances) perChannel.set(a.channelName, (perChannel.get(a.channelName) ?? 0) + 1)
  const count = kwCoreAppearances.length
  const channels = perChannel.size
  const sameChannelRepeat = [...perChannel.values()].some((n) => n >= 2)
  const level: KuwaitContextLevel = count === 0 ? "none" : count >= 2 || sameChannelRepeat ? "strong" : "weak"
  const reasons: string[] = []
  if (count > 0) reasons.push(`ظهر ${count} ${count === 1 ? "مرة" : "مرات"} ضيفاً في بودكاست كويتي أساسي`)
  if (channels >= 2) reasons.push(`في ${channels} قنوات كويتية: ${[...perChannel.keys()].join("، ")}`)
  for (const [ch, n] of perChannel) if (n >= 2) reasons.push(`تكرّر ${n} مرات على ${ch}`)
  return { kwCoreAppearanceCount: count, kwCoreUniqueChannelCount: channels, level, reasons }
}

/** Badge wording — context only, never a nationality claim (addendum). */
export function kuwaitContextLabel(level: KuwaitContextLevel, nationalityVerified: boolean): string | null {
  if (level === "none" || nationalityVerified) return null
  return level === "strong" ? "سياق كويتي قوي — الجنسية غير متحققة" : "سياق كويتي ضعيف — الجنسية غير متحققة"
}

/** SQL level from the two counts — mirrors `kuwaitContext` (the test pins both). */
export function kuwaitContextLevelSql(appsExpr: ReturnType<typeof sql>) {
  return sql`CASE WHEN ${appsExpr} >= 2 THEN 'strong' WHEN ${appsExpr} = 1 THEN 'weak' ELSE 'none' END`
}

/**
 * Per-person KW CORE counts as a LATERAL-joinable subquery on `p.id`.
 * Columns: kw_apps, kw_channels, kw_latest.
 */
export const KW_CONTEXT_LATERAL = sql`
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS kw_apps,
           count(DISTINCT e.channel_id)::int AS kw_channels,
           max(e.published_at) AS kw_latest
    FROM podcast_guest_appearances ka
    JOIN podcast_episodes e ON e.id = ka.episode_id
    JOIN podcast_channels c ON c.id = e.channel_id
    WHERE ka.person_id = p.id
      AND ka.verification_status NOT IN ('rejected', 'superseded')
      AND c.country_code = 'KW'
      AND c.registry_type = 'core_interview'
  ) kw ON true`
