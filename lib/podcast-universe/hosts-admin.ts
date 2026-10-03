/**
 * Host lists (channel-wide and program-scoped) and the audited exclusion of
 * existing host "appearances". A listed host's appearance on an episode they
 * host becomes `rejected` (a deterministic rule decided it) with a
 * `host_excluded` audit row — never deleted, and never revived by a later
 * re-extraction (restoreIfSuperseded only revives `superseded`).
 */
import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { podcastChannels } from "@/lib/db/schema/podcast-universe"
import { hostsForEpisode, isHostOf, type ProgramHosts } from "./hosts"
import { matchForm } from "./normalize"
import { resolvePeople, settleGuestlessEpisodes } from "./people"

export async function setProgramHost(channelId: string, program: string, name: string, remove = false): Promise<ProgramHosts[]> {
  const prog = matchForm(program)
  const host = matchForm(name)
  if (!prog || !host) throw new Error("program and host name are required")
  return db!.transaction(async (tx) => {
    const [c] = await tx.select({ program_hosts: podcastChannels.program_hosts }).from(podcastChannels).where(eq(podcastChannels.id, channelId)).for("update")
    if (!c) throw new Error("channel not found")
    const list = (c.program_hosts ?? []).map((p) => ({ program: p.program, hosts: [...p.hosts] }))
    let entry = list.find((p) => matchForm(p.program) === prog)
    if (!entry && !remove) list.push((entry = { program: prog, hosts: [] }))
    if (entry) {
      entry.hosts = remove ? entry.hosts.filter((h) => matchForm(h) !== host) : entry.hosts.some((h) => matchForm(h) === host) ? entry.hosts : [...entry.hosts, host]
    }
    const next = list.filter((p) => p.hosts.length > 0)
    await tx.update(podcastChannels).set({ program_hosts: next, updated_at: new Date() }).where(eq(podcastChannels.id, channelId))
    return next
  })
}

export interface HostExclusion {
  appearance_id: string
  person_id: string
  display_name: string
  episode_title: string
  channel_name: string
}

/** Find (and with `apply`, exclude) active appearances of listed hosts on episodes they host. */
export async function excludeHostAppearances(opts: { apply: boolean; actor: string }): Promise<HostExclusion[]> {
  const res = await db!.execute(sql`
    SELECT a.id AS appearance_id, a.person_id, a.display_name, p.canonical_name, e.title AS episode_title,
           c.name AS channel_name, c.host_names, c.program_hosts
    FROM podcast_guest_appearances a
    JOIN podcast_people p ON p.id = a.person_id
    JOIN podcast_episodes e ON e.id = a.episode_id
    JOIN podcast_channels c ON c.id = e.channel_id
    WHERE a.verification_status NOT IN ('rejected', 'superseded')
      AND (cardinality(c.host_names) > 0 OR jsonb_array_length(c.program_hosts) > 0)
  `)
  type Raw = HostExclusion & { canonical_name: string; host_names: string[]; program_hosts: ProgramHosts[] }
  const hits = (res.rows as unknown as Raw[]).filter((r) => {
    const hosts = hostsForEpisode(r.host_names, r.program_hosts, r.episode_title)
    return isHostOf(r.display_name ?? "", hosts) || isHostOf(r.canonical_name, hosts)
  })
  if (!opts.apply || hits.length === 0) return hits.map(strip)
  await db!.transaction(async (tx) => {
    for (const h of hits) {
      await tx.execute(sql`UPDATE podcast_guest_appearances SET verification_status = 'rejected', updated_at = now() WHERE id = ${h.appearance_id}::uuid`)
      await tx.execute(sql`
        INSERT INTO podcast_person_events (person_id, action, actor_id, before_state, after_state, note)
        VALUES (${h.person_id}::uuid, 'host_excluded', ${opts.actor},
                ${JSON.stringify({ appearance_id: h.appearance_id, episode_title: h.episode_title })}::jsonb,
                '{"status":"rejected"}'::jsonb, ${`listed host of «${h.channel_name}» program — not a guest`})`)
    }
    // An episode whose only "guest" was its host has no guest (noura).
    const episodeIds = (
      await tx.execute(sql`SELECT DISTINCT episode_id FROM podcast_guest_appearances
        WHERE id IN (${sql.join(hits.map((h) => sql`${h.appearance_id}::uuid`), sql`, `)})`)
    ).rows.map((r) => String((r as { episode_id: string }).episode_id))
    await settleGuestlessEpisodes(tx, { episodeIds, apply: true, actor: opts.actor })
  })
  await resolvePeople([...new Set(hits.map((h) => h.person_id))], opts.actor)
  return hits.map(strip)
}

function strip(h: HostExclusion): HostExclusion {
  return { appearance_id: h.appearance_id, person_id: h.person_id, display_name: h.display_name, episode_title: h.episode_title, channel_name: h.channel_name }
}
