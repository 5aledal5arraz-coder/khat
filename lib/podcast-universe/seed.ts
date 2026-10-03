/**
 * M1 first seed registry (docs/podcast-universe-plan-v1.md §F, Decisions 5/6).
 *
 * Idempotent: a channel already in the registry (same handle or UC id) is left
 * exactly as it is — an operator may have changed its type since — and
 * reported as `exists`. Nothing is ever deleted or overwritten.
 *
 * The candidate backlog (غمد، دائرة، إطلاق…) is deliberately NOT seeded: the
 * spec lists it by name only, with no verified handle, and says not to block
 * M1 on it. Those are added through the registry when their handles are known.
 */
import { eq, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { podcastChannels, type PodcastRegistryType } from "@/lib/db/schema/podcast-universe"

export interface SeedChannel {
  /** `@handle` or a UC… channel id. */
  key: string
  label: string
  country_code: string
  registry_type: PodcastRegistryType
}

export const M1_SEED_CHANNELS: readonly SeedChannel[] = [
  { key: "@bidonwaraq", label: "بدون ورق", country_code: "KW", registry_type: "core_interview" },
  { key: "@bymahfoof", label: "محفوف", country_code: "KW", registry_type: "core_interview" },
  { key: "@badersaaj", label: "@badersaaj", country_code: "KW", registry_type: "core_interview" },
  { key: "@JadwaPodcast", label: "@JadwaPodcast", country_code: "KW", registry_type: "core_interview" },
  { key: "UCqb4f_rNvM96zXrIjN7_eYw", label: "Time Keeper", country_code: "KW", registry_type: "core_interview" },
  { key: "@thmanyahPodcasts", label: "ثمانية", country_code: "SA", registry_type: "core_interview" },
  { key: "@Alphacast.Official", label: "Alphacast", country_code: "AE", registry_type: "core_interview" },
  // Decision 6: سوالف طريق is CONTEXT_COVERAGE — metadata only, no default extraction.
  { key: "@falhmrany", label: "سوالف طريق", country_code: "KW", registry_type: "context_coverage" },
]

/**
 * Curated program hosts (noura 2026-10-03, each verified from the episode
 * descriptions: the host's own links recur across the program's episodes).
 * Program-scoped on purpose — e.g. محمد آل جابر hosts «جادي» but is a real
 * GUEST on «فنجان», same channel. NOT listed, on the evidence:
 *   «الفجر» / مالك الروقي — one panel episode in five does not confirm a host;
 *   «مرتدة» / أحمد عفيفي — the descriptions call him «ضيفنا الإعلامي» /
 *   «نستضيف الإعلامي أحمد عفيفي» (3 of 183 episodes): a recurring GUEST.
 */
export const M1_PROGRAM_HOSTS: ReadonlyArray<{ channel: string; program: string; hosts: readonly string[] }> = [
  { channel: "@thmanyahPodcasts", program: "بودكاست آدم", hosts: ["محمد الحاجي"] },
  { channel: "@thmanyahPodcasts", program: "بودكاست جادي", hosts: ["محمد آل جابر", "هادي فقيهي"] },
  // Both hosts' own links recur in 19 of the program's episodes.
  { channel: "@thmanyahPodcasts", program: "بودكاست أرباح", hosts: ["أنس الراجحي", "سعيد عبدالجبار"] },
  { channel: "@Alphacast.Official", program: "شنو الكوميديا", hosts: ["بدر صالح", "مؤمن أفندي"] },
  // The same program, misspelled in some of its own titles.
  { channel: "@Alphacast.Official", program: "شنو الكومديا", hosts: ["بدر صالح", "مؤمن أفندي"] },
]

/**
 * Apply M1_PROGRAM_HOSTS. Idempotent: a host already listed for that program
 * is not written again, so a re-run touches no row.
 */
export async function seedProgramHosts(
  list: typeof M1_PROGRAM_HOSTS = M1_PROGRAM_HOSTS,
): Promise<Array<{ channel: string; program: string; host: string; status: "added" | "exists" | "channel_missing" }>> {
  const { setProgramHost } = await import("./hosts-admin")
  const { matchForm } = await import("./normalize")
  const out: Array<{ channel: string; program: string; host: string; status: "added" | "exists" | "channel_missing" }> = []
  for (const entry of list) {
    const [c] = await db!
      .select({ id: podcastChannels.id, program_hosts: podcastChannels.program_hosts })
      .from(podcastChannels)
      .where(eq(podcastChannels.handle, normalizeHandle(entry.channel)))
      .limit(1)
    for (const host of entry.hosts) {
      if (!c) {
        out.push({ channel: entry.channel, program: entry.program, host, status: "channel_missing" })
        continue
      }
      // Re-read each time: the previous host of this entry may just have been added.
      const [fresh] = await db!.select({ program_hosts: podcastChannels.program_hosts }).from(podcastChannels).where(eq(podcastChannels.id, c.id))
      const listed = (fresh?.program_hosts ?? []).some(
        (p) => matchForm(p.program) === matchForm(entry.program) && p.hosts.some((h) => matchForm(h) === matchForm(host)),
      )
      if (listed) {
        out.push({ channel: entry.channel, program: entry.program, host, status: "exists" })
        continue
      }
      await setProgramHost(c.id, entry.program, host)
      out.push({ channel: entry.channel, program: entry.program, host, status: "added" })
    }
  }
  return out
}

export function isChannelId(key: string): boolean {
  return /^UC[A-Za-z0-9_-]{22}$/.test(key)
}

/** Handles are stored with their `@`, lower-cased for the unique index. */
export function normalizeHandle(key: string): string {
  return (key.startsWith("@") ? key : `@${key}`).toLowerCase()
}

export async function seedRegistry(
  channels: readonly SeedChannel[] = M1_SEED_CHANNELS,
): Promise<Array<{ key: string; status: "created" | "exists"; id: string }>> {
  if (!db) throw new Error("Database not configured")
  const out: Array<{ key: string; status: "created" | "exists"; id: string }> = []
  for (const c of channels) {
    const byId = isChannelId(c.key)
    const handle = byId ? null : normalizeHandle(c.key)
    const ytId = byId ? c.key : null
    const existing = await db
      .select({ id: podcastChannels.id })
      .from(podcastChannels)
      .where(
        or(
          handle ? eq(podcastChannels.handle, handle) : undefined,
          ytId ? eq(podcastChannels.youtube_channel_id, ytId) : undefined,
        ),
      )
      .limit(1)
    if (existing[0]) {
      out.push({ key: c.key, status: "exists", id: existing[0].id })
      continue
    }
    const inserted = await db
      .insert(podcastChannels)
      .values({
        handle,
        youtube_channel_id: ytId,
        name: c.label,
        country_code: c.country_code,
        registry_type: c.registry_type,
        registry_source: "khaled",
        verification_status: "pending",
        metadata: { seed: "m1-section-f", seed_label: c.label },
      })
      .onConflictDoNothing()
      .returning({ id: podcastChannels.id })
    if (inserted[0]) out.push({ key: c.key, status: "created", id: inserted[0].id })
    else {
      // Lost a race with a concurrent seed — report the row that won.
      const again = await db
        .select({ id: podcastChannels.id })
        .from(podcastChannels)
        .where(or(handle ? eq(podcastChannels.handle, handle) : undefined, ytId ? eq(podcastChannels.youtube_channel_id, ytId) : undefined))
        .limit(1)
      out.push({ key: c.key, status: "exists", id: again[0]?.id ?? "" })
    }
  }
  return out
}
