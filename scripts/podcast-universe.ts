/**
 * Podcast Universe M1 — operator CLI (LOCAL). Every paid or quota-spending
 * step goes through the job queue, so `npm run worker` must be running for
 * anything but `seed`, `status` and `dry-verify`.
 *
 *   npx tsx scripts/podcast-universe.ts seed                # §F registry, idempotent
 *   npx tsx scripts/podcast-universe.ts dry-verify @handle  # ONE channels.list call, inline (1 read unit)
 *   npx tsx scripts/podcast-universe.ts verify [all|@handle]  # enqueue podcast.channel.verify
 *   npx tsx scripts/podcast-universe.ts crawl  [all|@handle]  # enqueue podcast.channel.initial_crawl
 *   npx tsx scripts/podcast-universe.ts sync   [all|@handle]  # enqueue podcast.channel.incremental_crawl
 *   npx tsx scripts/podcast-universe.ts extract [--budget 3]  # start Luna extraction (PAID, hard cap ≤ $3)
 *   npx tsx scripts/podcast-universe.ts status              # registry, runs, quota, coverage
 *   npx tsx scripts/podcast-universe.ts reopen [--apply]    # Addendum 2 (e): re-offer the validation-failed
 *                                                           # + issue episodes for re-extraction (dry run by default)
 *   npx tsx scripts/podcast-universe.ts reopen-nationality [--apply]  # episodes whose nationality claim was
 *                                                           # dropped as "does not name the guest" (prompt v3)
 *   npx tsx scripts/podcast-universe.ts supersede-backfill <runId> [--apply]  # one-off: apply REPLACE semantics
 *                                                           # to episodes a run already re-extracted
 *   npx tsx scripts/podcast-universe.ts program-host <channelKey> "<program>" "<host>" [--remove]
 *   npx tsx scripts/podcast-universe.ts hosts-apply [--apply]  # exclude listed hosts' existing appearances (audited)
 *   npx tsx scripts/podcast-universe.ts reopen-non-luna [--apply]  # episodes whose LATEST extraction call ran on a
 *                                                           # model other than the pinned one → re-extract (supersedes)
 *   npx tsx scripts/podcast-universe.ts settle-guestless [--apply]  # succeeded episodes with no ACTIVE appearance → no_guest
 *   npx tsx scripts/podcast-universe.ts reopen-kw-adjacent [--names "a,b"] [--apply]  # KW claim dropped as
 *                                                           # "no explicit KW demonym attached" — re-extract under v3
 */
import "@/lib/jobs/load-env"

async function main() {
  const [cmd = "status", arg, ...rest] = process.argv.slice(2)
  const { db } = await import("@/lib/db")
  const { podcastChannels, podcastCrawlRuns } = await import("@/lib/db/schema/podcast-universe")
  const { desc, eq, or } = await import("drizzle-orm")
  const { seedRegistry, normalizeHandle, isChannelId } = await import("@/lib/podcast-universe/seed")
  const jobs = await import("@/lib/podcast-universe/jobs")

  async function channelsFor(sel: string | undefined) {
    const all = await db!.select().from(podcastChannels)
    if (!sel || sel === "all") return all
    const h = isChannelId(sel) ? null : normalizeHandle(sel)
    return all.filter((c) => c.handle === h || c.youtube_channel_id === sel || c.id === sel)
  }

  // Feature flag: everything but the read-only `status` refuses while off.
  const { isPodcastUniverseEnabled } = await import("@/lib/podcast-universe/flag")
  if (cmd !== "status" && !isPodcastUniverseEnabled()) {
    throw new Error(`refused: PODCAST_UNIVERSE_ENABLED is not "true" — only \`status\` runs while the module is off`)
  }

  switch (cmd) {
    case "seed": {
      // Channels (§F) + curated program hosts — one idempotent run.
      console.table(await seedRegistry())
      const { seedProgramHosts } = await import("@/lib/podcast-universe/seed")
      console.table(await seedProgramHosts())
      break
    }
    case "dry-verify": {
      if (!arg) throw new Error("usage: dry-verify @handle")
      const { verifyChannel } = await import("@/lib/podcast-universe/crawl")
      const [c] = await db!
        .select()
        .from(podcastChannels)
        .where(or(eq(podcastChannels.handle, normalizeHandle(arg)), eq(podcastChannels.youtube_channel_id, arg)))
      if (!c) throw new Error(`${arg} is not in the registry — run seed first`)
      console.log(await verifyChannel(c.id))
      const [after] = await db!.select().from(podcastChannels).where(eq(podcastChannels.id, c.id))
      console.log({
        name: after.name,
        youtube_channel_id: after.youtube_channel_id,
        uploads_playlist_id: after.uploads_playlist_id,
        reported_video_count: after.reported_video_count,
        subscriber_count: after.subscriber_count,
        verification_status: after.verification_status,
      })
      break
    }
    case "verify": {
      for (const c of await channelsFor(arg)) console.log(c.handle ?? c.youtube_channel_id, await jobs.enqueueChannelVerify(c.id))
      break
    }
    case "crawl": {
      for (const c of await channelsFor(arg)) console.log(c.handle ?? c.youtube_channel_id, await jobs.startInitialCrawl(c.id))
      break
    }
    case "sync": {
      for (const c of await channelsFor(arg)) console.log(c.handle ?? c.youtube_channel_id, await jobs.startIncrementalCrawl(c.id))
      break
    }
    case "extract": {
      const i = [arg, ...rest].indexOf("--budget")
      const budget = i >= 0 ? Number([arg, ...rest][i + 1]) : undefined
      console.log(await jobs.startGuestExtraction(budget))
      break
    }
    case "reopen": {
      // Addendum 2 (e): ONLY the validation-failed episodes and the episodes
      // whose extraction recorded issues — never the whole universe.
      const { sql } = await import("drizzle-orm")
      const { joinsTwoPeople } = await import("@/lib/podcast-universe/extraction/validate")
      const apply = [arg, ...rest].includes("--apply")
      const failed = await db!.execute(sql`
        SELECT id FROM podcast_episodes
        WHERE guest_extraction_status = 'failed' AND guest_extraction_note LIKE 'guest_rejected:%'`)
      const issues = await db!.execute(sql`
        SELECT id FROM podcast_episodes
        WHERE guest_extraction_status IN ('succeeded', 'no_guest')
          -- only the issue kinds Addendum 2 can change (text-form matching,
          -- nationality window, one person per entry) — not every note
          AND guest_extraction_note ~ '(guest_rejected|nationality|not an exact substring)'`)
      const merged = (
        (await db!.execute(sql`SELECT id, person_id, episode_id, display_name FROM podcast_guest_appearances WHERE verification_status NOT IN ('rejected', 'superseded')`))
          .rows as Array<{ id: string; person_id: string; episode_id: string; display_name: string | null }>
      ).filter((a) => a.display_name && joinsTwoPeople(a.display_name))
      const ids = new Set([
        ...(failed.rows as Array<{ id: string }>).map((r) => r.id),
        ...(issues.rows as Array<{ id: string }>).map((r) => r.id),
        ...merged.map((m) => m.episode_id),
      ])
      console.log({ validation_failed: failed.rows.length, with_issues: issues.rows.length, merged_two_people: merged.length, episodes_to_reopen: ids.size })
      if (!apply) {
        console.log("dry run — re-run with --apply to reopen them (then: extract --budget 3)")
        break
      }
      await db!.transaction(async (tx) => {
        // A display_name that joins two people is unlinked (status, audited) — never deleted.
        for (const m of merged) {
          await tx.execute(sql`UPDATE podcast_guest_appearances SET verification_status = 'rejected', updated_at = now() WHERE id = ${m.id}::uuid`)
          await tx.execute(sql`
            INSERT INTO podcast_person_events (person_id, action, actor_id, before_state, after_state, note)
            VALUES (${m.person_id}::uuid, 'unlink_appearance', 'system:addendum2-reopen',
                    ${JSON.stringify({ appearance_id: m.id })}::jsonb, '{"status":"rejected"}'::jsonb,
                    ${`display_name joins two people: ${m.display_name}`})`)
        }
        for (const id of ids) {
          await tx.execute(sql`
            UPDATE podcast_episodes SET guest_extraction_status = 'pending', guest_extraction_note = NULL, updated_at = now()
            WHERE id = ${id}::uuid`)
        }
      })
      console.log(`reopened ${ids.size} episodes as pending`)
      break
    }
    case "reopen-nationality": {
      const { sql } = await import("drizzle-orm")
      const apply = [arg, ...rest].includes("--apply")
      const r = await db!.execute(sql`
        SELECT id FROM podcast_episodes
        WHERE guest_extraction_status = 'succeeded' AND guest_extraction_note LIKE '%nationality evidence does not name the guest%'`)
      const ids = (r.rows as Array<{ id: string }>).map((x) => x.id)
      console.log({ episodes: ids.length })
      if (!apply) {
        console.log("dry run — re-run with --apply, then: extract --budget 3")
        break
      }
      await db!.execute(sql`
        UPDATE podcast_episodes SET guest_extraction_status = 'pending', guest_extraction_note = NULL, updated_at = now()
        WHERE id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`)
      console.log(`reopened ${ids.length}`)
      break
    }
    case "supersede-backfill": {
      // One-off for a re-extraction that ran BEFORE replace semantics existed.
      // An appearance on an episode the run re-extracted (final succeeded /
      // no_guest) is CURRENT when the run created it (its ai_run belongs to
      // the run) or the run reproduced it (attachGuest touched it: updated_at
      // ≥ run start). Everything else active on that episode is superseded.
      const { sql } = await import("drizzle-orm")
      const { supersedeUnreproduced, resolvePeople } = await import("@/lib/podcast-universe/people")
      if (!arg || !/^[0-9a-f-]{36}$/i.test(arg)) throw new Error("usage: supersede-backfill <guest_extract runId> [--apply]")
      const apply = rest.includes("--apply")
      const stale = (
        await db!.execute(sql`
          WITH run AS (SELECT started_at FROM podcast_crawl_runs WHERE id = ${arg}::uuid AND run_type = 'guest_extract'),
               ar AS (SELECT id FROM ai_runs WHERE subject_id = ${arg}),
               eps AS (SELECT id FROM podcast_episodes WHERE guest_extraction_run_id = ${arg}::uuid
                        AND guest_extraction_status IN ('succeeded', 'no_guest'))
          SELECT a.episode_id, a.id, a.display_name
          FROM podcast_guest_appearances a
          WHERE a.episode_id IN (SELECT id FROM eps)
            AND a.verification_status NOT IN ('rejected', 'superseded')
            AND (a.ai_run_id IS NULL OR a.ai_run_id NOT IN (SELECT id FROM ar))
            AND a.updated_at < (SELECT started_at FROM run)`)
      ).rows as Array<{ episode_id: string; id: string; display_name: string }>
      console.table(stale.map((x) => ({ episode: x.episode_id.slice(0, 8), superseded: x.display_name })))
      if (!apply) {
        console.log(`dry run — ${stale.length} appearance(s) would be superseded; re-run with --apply`)
        break
      }
      const byEpisode = new Map<string, string[]>()
      for (const x of stale) byEpisode.set(x.episode_id, [...(byEpisode.get(x.episode_id) ?? []), x.id])
      const people = new Set<string>()
      await db!.transaction(async (tx) => {
        for (const [episodeId, staleIds] of byEpisode) {
          // keep = every active appearance on the episode EXCEPT the stale ones
          const keep = (
            await tx.execute(sql`SELECT id FROM podcast_guest_appearances WHERE episode_id = ${episodeId}::uuid
              AND id NOT IN (${sql.join(staleIds.map((i) => sql`${i}::uuid`), sql`, `)})`)
          ).rows.map((r) => String((r as { id: string }).id))
          const gone = await supersedeUnreproduced(tx, episodeId, keep, "system:supersede-backfill", `backfill: not reproduced by re-extraction run ${arg}`)
          for (const g of gone) people.add(g.person_id)
        }
        const { settleGuestlessEpisodes } = await import("@/lib/podcast-universe/people")
        await settleGuestlessEpisodes(tx, { episodeIds: [...byEpisode.keys()], apply: true, actor: "system:supersede-backfill" })
      })
      await resolvePeople([...people], "system:supersede-backfill")
      console.log(`superseded ${stale.length} appearance(s) on ${byEpisode.size} episode(s); resolved ${people.size} people`)
      break
    }
    case "program-host": {
      const [program, host] = rest.filter((x) => x !== "--remove")
      if (!arg || !program || !host) throw new Error('usage: program-host <channelKey> "<program>" "<host>" [--remove]')
      const [c] = await channelsFor(arg)
      if (!c) throw new Error(`channel ${arg} not found`)
      const { setProgramHost } = await import("@/lib/podcast-universe/hosts-admin")
      console.log(c.name, await setProgramHost(c.id, program, host, rest.includes("--remove")))
      break
    }
    case "reopen-non-luna": {
      // 2026-10-03 prod incident: extraction ran on gpt-5.4-mini via the global
      // structural override. Find every episode whose LATEST extraction call
      // (an ai_runs row of a guest_extract run, listing the episode in its
      // input) used a model other than the pinned one, and send it back to
      // pending. The re-run on the pinned model then SUPERSEDES its old
      // appearances (re-extraction replaces).
      const { sql } = await import("drizzle-orm")
      const { PODCAST_GUEST_EXTRACT_MODEL } = await import("@/lib/ai-router/registry")
      const apply = [arg, ...rest].includes("--apply")
      const r = await db!.execute(sql`
        WITH calls AS (
          SELECT DISTINCT ON (ep.id) ep.id AS episode_id, ar.model_name
          FROM podcast_episodes ep
          JOIN ai_runs ar
            ON ar.subject_table = 'podcast_crawl_runs'
           AND ar.prompt_version LIKE 'podcast-universe-guest-extract%'
           AND ar.input_snapshot->'episode_ids' ? ep.id::text
          WHERE ep.guest_extraction_status IN ('succeeded', 'no_guest', 'failed')
          ORDER BY ep.id, ar.started_at DESC
        )
        SELECT c.episode_id, c.model_name FROM calls c
        WHERE c.model_name NOT LIKE ${PODCAST_GUEST_EXTRACT_MODEL + "%"}`)
      const rows = r.rows as Array<{ episode_id: string; model_name: string }>
      const byModel = new Map<string, number>()
      for (const x of rows) byModel.set(x.model_name, (byModel.get(x.model_name) ?? 0) + 1)
      console.log({ pinned: PODCAST_GUEST_EXTRACT_MODEL, episodes: rows.length, by_model: Object.fromEntries(byModel) })
      if (!apply || rows.length === 0) {
        if (!apply) console.log("dry run — re-run with --apply, then: extract --budget 3")
        break
      }
      await db!.execute(sql`
        UPDATE podcast_episodes SET guest_extraction_status = 'pending', guest_extraction_note = NULL, updated_at = now()
        WHERE id IN (${sql.join(rows.map((x) => sql`${x.episode_id}::uuid`), sql`, `)})`)
      console.log(`reopened ${rows.length} episode(s) for re-extraction on ${PODCAST_GUEST_EXTRACT_MODEL}`)
      break
    }
    case "settle-guestless": {
      const { settleGuestlessEpisodes } = await import("@/lib/podcast-universe/people")
      const apply = [arg, ...rest].includes("--apply")
      const out = await db!.transaction((tx) => settleGuestlessEpisodes(tx, { episodeIds: null, apply, actor: "system:settle-guestless" }))
      console.table(out.map((o) => ({ episode: o.episode_id.slice(0, 8), note: o.note })))
      console.log(apply ? `settled ${out.length} episode(s) as no_guest` : `dry run — ${out.length} would become no_guest; re-run with --apply`)
      break
    }
    case "reopen-kw-adjacent": {
      const { sql } = await import("drizzle-orm")
      const args = [arg, ...rest].filter(Boolean) as string[]
      const apply = args.includes("--apply")
      // --names "a,b,c": exactly these people's appearances that carry no KW
      // claim yet (noura's list); without it, every episode whose note says
      // the KW claim was dropped for not being attached.
      const ni = args.indexOf("--names")
      const { normalizeNameKey } = await import("@/lib/podcast-universe/normalize")
      const keys = ni >= 0 ? String(args[ni + 1] ?? "").split(/[,،]/).map((n) => normalizeNameKey(n)).filter(Boolean) : []
      // Name match = every word of the given name appears in the person's
      // name/alias, in order («نايف الحويله» ⊂ «نايف بن فلاح الحويله»). The
      // list is the operator's, so the match only has to find, not prove.
      const inOrder = (needle: string[], hay: string[]) => {
        let i = 0
        for (const t of hay) if (t === needle[i]) i++
        return i === needle.length
      }
      let episodeIds: string[]
      if (keys.length > 0) {
        const cand = (
          await db!.execute(sql`
            SELECT a.episode_id, p.normalized_name_key AS k,
                   (SELECT array_agg(al.normalized_alias) FROM podcast_person_aliases al WHERE al.person_id = p.id) AS aliases
            FROM podcast_guest_appearances a JOIN podcast_people p ON p.id = a.person_id
            JOIN podcast_episodes e ON e.id = a.episode_id
            WHERE a.verification_status NOT IN ('rejected', 'superseded') AND a.nationality_claim_code IS NULL
              AND e.guest_extraction_status IN ('succeeded', 'no_guest')`)
        ).rows as Array<{ episode_id: string; k: string; aliases: string[] | null }>
        episodeIds = [
          ...new Set(
            cand
              .filter((c) => keys.some((q) => [c.k, ...(c.aliases ?? [])].some((h) => inOrder(q.split(" "), h.split(" ")))))
              .map((c) => c.episode_id),
          ),
        ]
      } else {
        episodeIds = (
          await db!.execute(sql`SELECT id FROM podcast_episodes WHERE guest_extraction_status = 'succeeded'
            AND guest_extraction_note LIKE '%no explicit KW demonym attached%'`)
        ).rows.map((x) => String((x as { id: string }).id))
      }
      if (episodeIds.length === 0) {
        console.log("nothing matched")
        break
      }
      const r = await db!.execute(sql`
        SELECT e.id, left(e.title, 60) AS title,
               (SELECT string_agg(a.display_name, ' | ') FROM podcast_guest_appearances a
                 WHERE a.episode_id = e.id AND a.verification_status NOT IN ('rejected', 'superseded')) AS guests
        FROM podcast_episodes e WHERE e.id IN (${sql.join(episodeIds.map((i) => sql`${i}::uuid`), sql`, `)})`)
      const rows = r.rows as Array<{ id: string; title: string; guests: string | null }>
      console.table(rows.map((x) => ({ episode: x.id.slice(0, 8), guests: x.guests, title: x.title })))
      if (!apply) {
        console.log(`dry run — ${rows.length} episode(s); re-run with --apply, then: extract --budget 3`)
        break
      }
      await db!.execute(sql`
        UPDATE podcast_episodes SET guest_extraction_status = 'pending', guest_extraction_note = NULL, updated_at = now()
        WHERE id IN (${sql.join(rows.map((x) => sql`${x.id}::uuid`), sql`, `)})`)
      console.log(`reopened ${rows.length}`)
      break
    }
    case "hosts-apply": {
      const { excludeHostAppearances } = await import("@/lib/podcast-universe/hosts-admin")
      const apply = [arg, ...rest].includes("--apply")
      const hits = await excludeHostAppearances({ apply, actor: "system:hosts-apply" })
      console.table(hits.map((h) => ({ channel: h.channel_name, host: h.display_name, episode: h.episode_title.slice(0, 60) })))
      console.log(apply ? `excluded ${hits.length} host appearance(s)` : `dry run — ${hits.length} would be excluded; re-run with --apply`)
      break
    }
    case "status": {
      const { quotaUsageToday } = await import("@/lib/podcast-universe/quota")
      const { extractionCoverage } = await import("@/lib/podcast-universe/extraction/run")
      console.table(
        (await db!.select().from(podcastChannels)).map((c) => ({
          key: c.handle ?? c.youtube_channel_id,
          name: c.name,
          type: c.registry_type,
          verify: c.verification_status,
          crawl: c.crawl_status,
          reported: c.reported_video_count,
        })),
      )
      console.table(
        (await db!.select().from(podcastCrawlRuns).orderBy(desc(podcastCrawlRuns.created_at)).limit(15)).map((r) => ({
          type: r.run_type,
          status: r.status,
          pages: r.playlist_pages,
          ins: r.episodes_inserted,
          upd: r.episodes_updated,
          units: r.youtube_read_units,
          usd: r.ai_cost_usd,
          cap: r.budget_limit_usd,
          error: r.error_summary?.slice(0, 60) ?? null,
        })),
      )
      console.log("quota today:", await quotaUsageToday())
      console.log("extraction coverage (CORE × longform):", await extractionCoverage())
      break
    }
    default:
      throw new Error(`unknown command "${cmd}"`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error("podcast-universe:", err instanceof Error ? err.message : err)
  process.exit(1)
})
