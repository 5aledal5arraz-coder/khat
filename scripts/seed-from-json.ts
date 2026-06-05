/**
 * Seed PostgreSQL from JSON config files.
 * Usage: DATABASE_URL="<url>" npx tsx scripts/seed-from-json.ts
 */
import pg from "pg"
import fs from "fs"
import path from "path"

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface JsonRecord extends Record<string, string | number | boolean | null | undefined | JsonRecord | JsonRecord[]> {}

const { Client } = pg

const rawUrl = process.env.DATABASE_URL
if (!rawUrl) {
  console.error("Missing DATABASE_URL env var")
  console.error('Usage: DATABASE_URL="postgres://..." npx tsx scripts/seed-from-json.ts')
  process.exit(1)
}

// Strip sslmode from URL — handle SSL via client config (same as lib/db.ts)
const dbUrl = rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")
const isLocalhost = rawUrl.includes("localhost")
const CONFIG = path.join(process.cwd(), "config")

function readJson<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(CONFIG, filename), "utf-8"))
}

async function main() {
  const client = new Client({
    connectionString: dbUrl,
    ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
  })
  await client.connect()
  console.log(`Connected to database\n`)

  // Clean dependent tables first (reverse dependency order)
  const cleanOrder = [
    "studio_push_log", "studio_analyzers", "studio_website_packages",
    "studio_clips", "studio_chapters", "studio_ai_outputs", "studio_transcripts", "studio_sessions",
    "daily_reflections", "home_quotes",
    "hidden_episodes",
    "episode_quotes_config", "episode_enrichments", "episode_overrides",
    "episodes", "guests",
    "platform_analytics", "static_content", "site_settings",
  ]
  for (const table of cleanOrder) {
    try { await client.query(`DELETE FROM "${table}"`) } catch { /* may not exist */ }
  }

  // ================================================================
  // 1. Episodes (from episode-cache.json)
  // ================================================================
  const episodeCache = readJson<{ episodes: JsonRecord[] }>("episode-cache.json")
  const episodes = episodeCache.episodes

  // Collect unique guests from episodes (deduplicate by slug)
  const guestMap = new Map<string, JsonRecord>()
  const seenSlugs = new Set<string>()
  for (const ep of episodes) {
    const guest = ep.guest as JsonRecord | undefined
    if (guest && guest.id) {
      const slug = guest.slug as string
      if (!seenSlugs.has(slug)) {
        seenSlugs.add(slug)
        guestMap.set(guest.id as string, guest)
      }
    }
  }

  // Insert guests
  // guests already cleaned
  let guestCount = 0
  for (const guest of guestMap.values()) {
    try {
      await client.query(
        `INSERT INTO guests (id, name, slug, bio, photo_url, external_links, testimonial, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
        [
          guest.id,
          guest.name,
          guest.slug,
          guest.bio || null,
          guest.photo_url || null,
          guest.external_links ? JSON.stringify(guest.external_links) : null,
          guest.testimonial || null,
          guest.created_at || new Date().toISOString(),
        ]
      )
      guestCount++
    } catch {
      // Skip duplicates
    }
  }
  console.log(`  ✅ guests — ${guestCount} rows`)

  // Insert episodes
  const seenEpSlugs = new Set<string>()
  for (const ep of episodes) {
    // Ensure unique slug
    let slug = ep.slug as string
    if (seenEpSlugs.has(slug)) slug = `${slug}-${ep.id}`
    seenEpSlugs.add(slug)
    try { await client.query(
      `INSERT INTO episodes (id, title, slug, description, youtube_url, duration_minutes, release_date, episode_number, season, thumbnail_url, status, featured, view_count, guest_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (id) DO NOTHING`,
      [
        ep.id,
        ep.title,
        slug,
        ep.description || null,
        ep.youtube_url,
        ep.duration_minutes || 0,
        ep.release_date,
        ep.episode_number || null,
        ep.season || null,
        ep.thumbnail_url || null,
        ep.status || "published",
        ep.featured || false,
        ep.view_count || 0,
        (ep.guest as JsonRecord | undefined)?.id || null,
        ep.created_at || new Date().toISOString(),
        ep.updated_at || new Date().toISOString(),
      ]
    ) } catch { /* skip duplicate */ }
  }
  console.log(`  ✅ episodes — ${episodes.length} rows`)

  // ================================================================
  // 2. Episode Overrides
  // ================================================================
  const overrides = readJson<JsonRecord[]>("episode-overrides.json")
  for (const o of overrides) {
    await client.query(
      `INSERT INTO episode_overrides (episode_id, original_title, custom_title)
       VALUES ($1, $2, $3) ON CONFLICT (episode_id) DO NOTHING`,
      [o.id, o.originalTitle, o.customTitle]
    )
  }
  console.log(`  ✅ episode_overrides — ${overrides.length} rows`)

  // ================================================================
  // 4. Episode Enrichments
  // ================================================================
  const enrichments = readJson<Record<string, JsonRecord>>("episode-enrichments.json")
  const enrichEntries = Object.values(enrichments)
  for (const e of enrichEntries) {
    await client.query(
      `INSERT INTO episode_enrichments (episode_id, hero_summary, full_summary, takeaways, resources, timestamps, why_this_conversation, before_you_watch, conversation_map, central_question, exclusive_clip, unsaid_reflections, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (episode_id) DO NOTHING`,
      [
        e.episodeId,
        e.hero_summary || null,
        e.full_summary || null,
        JSON.stringify(e.takeaways || []),
        JSON.stringify(e.resources || []),
        JSON.stringify(e.timestamps || []),
        e.why_this_conversation || null,
        e.before_you_watch ? JSON.stringify(e.before_you_watch) : null,
        e.conversation_map ? JSON.stringify(e.conversation_map) : null,
        e.central_question || null,
        e.exclusive_clip ? JSON.stringify(e.exclusive_clip) : null,
        JSON.stringify(e.unsaid_reflections || []),
        e.updatedAt || new Date().toISOString(),
      ]
    )
  }
  console.log(`  ✅ episode_enrichments — ${enrichEntries.length} rows`)

  // ================================================================
  // 5. Episode Guest Links (writes to episodes.guest_id directly)
  // ================================================================
  const guestAssignments = readJson<Record<string, string>>("episode-guest-assignments.json")
  const gaEntries = Object.entries(guestAssignments)
  let gaCount = 0
  for (const [epId, gId] of gaEntries) {
    try {
      await client.query(
        `UPDATE episodes SET guest_id = $2 WHERE id = $1 AND guest_id IS NULL`,
        [epId, gId]
      )
      gaCount++
    } catch { /* skip FK violations */ }
  }
  console.log(`  ✅ episodes.guest_id — ${gaCount}/${gaEntries.length} links applied`)

  // ================================================================
  // 6. Episode Quotes
  // ================================================================
  const epQuotes = readJson<Record<string, JsonRecord>>("episode-quotes.json")
  const eqEntries = Object.entries(epQuotes)
  for (const [epId, data] of eqEntries) {
    try {
      await client.query(
        `INSERT INTO episode_quotes_config (episode_id, episode_title, quotes, status, generated_at, published_at)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (episode_id) DO NOTHING`,
        [
          epId,
          data.episodeTitle || "Unknown",
          JSON.stringify(data.quotes || []),
          data.status || "draft",
          data.generatedAt || null,
          data.publishedAt || null,
        ]
      )
    } catch { /* skip constraint violations */ }
  }
  console.log(`  ✅ episode_quotes_config — ${eqEntries.length} rows`)


  // ================================================================
  // 8. Home Quotes
  // ================================================================
  const homeQuotes = readJson<{ quotes: JsonRecord[] }>("home-quotes.json")
  for (const q of homeQuotes.quotes) {
    await client.query(
      `INSERT INTO home_quotes (id, text, attribution, episode_id, episode_slug, episode_title, theme, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
      [
        q.id,
        q.text,
        q.attribution,
        q.episode_id || null,
        q.episode_slug || null,
        q.episode_title || null,
        q.theme || null,
        q.status || "draft",
        q.created_at || new Date().toISOString(),
        q.updated_at || new Date().toISOString(),
      ]
    )
  }
  console.log(`  ✅ home_quotes — ${homeQuotes.quotes.length} rows`)

  // ================================================================
  // 9. Daily Reflections
  // ================================================================
  const reflections = readJson<{ reflections: JsonRecord[] }>("daily-reflections.json")
  for (const r of reflections.reflections) {
    await client.query(
      `INSERT INTO daily_reflections (id, date, short_quote, reflection, thinking_question, attribution, episode_id, episode_slug, episode_title, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
      [
        r.id,
        r.date,
        r.short_quote,
        r.reflection,
        r.thinking_question,
        r.attribution || null,
        r.episode_id || null,
        r.episode_slug || null,
        r.episode_title || null,
        r.status || "draft",
        r.created_at || new Date().toISOString(),
        r.updated_at || new Date().toISOString(),
      ]
    )
  }
  console.log(`  ✅ daily_reflections — ${reflections.reflections.length} rows`)


  // ================================================================
  // 11. Site Settings
  // ================================================================
  const siteSettings = readJson<JsonRecord>("site-settings.json")
  await client.query(
    `INSERT INTO site_settings (key, metadata, social_links, seo, feature_flags)
     VALUES ('main', $1, $2, $3, $4)`,
    [
      JSON.stringify(siteSettings.metadata || {}),
      JSON.stringify(siteSettings.socialLinks || []),
      JSON.stringify(siteSettings.seo || {}),
      JSON.stringify(siteSettings.featureFlags || {}),
    ]
  )
  console.log(`  ✅ site_settings — 1 row`)

  // ================================================================
  // 13. Static Content
  // ================================================================
  const staticContent = readJson<JsonRecord>("static-content.json")
  await client.query(
    `INSERT INTO static_content (key, content) VALUES ('about', $1)`,
    [JSON.stringify(staticContent.about || staticContent)]
  )
  console.log(`  ✅ static_content — 1 row`)

  // ================================================================
  // 14. Platform Analytics
  // ================================================================
  const analytics = readJson<Record<string, JsonRecord>>("analytics.json")
  for (const [platform, data] of Object.entries(analytics)) {
    await client.query(
      `INSERT INTO platform_analytics (platform, followers, posts, engagement, url)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [platform, data.followers || 0, data.posts || 0, data.engagement || "0%", data.url || ""]
    )
  }
  console.log(`  ✅ platform_analytics — ${Object.keys(analytics).length} rows`)

  // ================================================================
  // 15. Studio Push Log
  // ================================================================
  const pushLog = readJson<JsonRecord[]>("studio-push-log.json")
  let plCount = 0
  for (const entry of pushLog) {
    try {
      await client.query(
        `INSERT INTO studio_push_log (session_id, episode_id, episode_title, pushed_fields, pushed_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [
          entry.sessionId,
          entry.episodeId,
          entry.episodeTitle,
          entry.pushedFields || [],
          entry.pushedAt,
        ]
      )
      plCount++
    } catch { /* skip FK violations — sessions may not exist */ }
  }
  console.log(`  ✅ studio_push_log — ${plCount}/${pushLog.length} rows`)


  console.log(`\nDone! Database seeded from JSON config files.`)
  await client.end()
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
