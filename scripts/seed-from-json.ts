/**
 * Seed PostgreSQL from JSON config files.
 * Usage: DATABASE_URL="<url>" npx tsx scripts/seed-from-json.ts
 */
import pg from "pg"
import fs from "fs"
import path from "path"

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
    "episode_knowledge_meta", "episode_knowledge",
    "daily_reflections", "home_quotes", "emotional_paths",
    "episode_visibility", "episode_section_assignments", "episode_sections",
    "episode_quotes_config", "episode_guest_assignments", "episode_enrichments", "episode_overrides",
    "topics_config", "episode_topics", "episodes", "topics", "guests",
    "platform_analytics", "static_content", "site_settings",
  ]
  for (const table of cleanOrder) {
    try { await client.query(`DELETE FROM "${table}"`) } catch { /* may not exist */ }
  }

  // ================================================================
  // 1. Episodes (from episode-cache.json)
  // ================================================================
  const episodeCache = readJson<{ episodes: any[] }>("episode-cache.json")
  const episodes = episodeCache.episodes

  // Collect unique guests from episodes (deduplicate by slug)
  const guestMap = new Map<string, any>()
  const seenSlugs = new Set<string>()
  for (const ep of episodes) {
    if (ep.guest && ep.guest.id) {
      const slug = ep.guest.slug
      if (!seenSlugs.has(slug)) {
        seenSlugs.add(slug)
        guestMap.set(ep.guest.id, ep.guest)
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

  // Collect unique topics from episodes
  const topicMap = new Map<string, any>()
  for (const ep of episodes) {
    if (ep.topics) {
      for (const t of ep.topics) {
        if (t.id) topicMap.set(t.id, t)
      }
    }
  }

  // Insert episode topics into the topics table (deduplicate by slug)
  let topicCount = 0
  const seenTopicSlugs = new Set<string>()
  for (const topic of topicMap.values()) {
    if (seenTopicSlugs.has(topic.slug)) continue
    seenTopicSlugs.add(topic.slug)
    try {
      await client.query(
        `INSERT INTO topics (id, name, slug, description, created_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [topic.id, topic.name, topic.slug, topic.description || null, topic.created_at || new Date().toISOString()]
      )
      topicCount++
    } catch {
      // Skip duplicates
    }
  }
  console.log(`  ✅ topics (from episodes) — ${topicCount} rows`)

  // Insert episodes
  const seenEpSlugs = new Set<string>()
  for (const ep of episodes) {
    // Ensure unique slug
    let slug = ep.slug
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
        ep.guest?.id || null,
        ep.created_at || new Date().toISOString(),
        ep.updated_at || new Date().toISOString(),
      ]
    ) } catch { /* skip duplicate */ }
  }
  console.log(`  ✅ episodes — ${episodes.length} rows`)

  // Insert episode_topics junction (skip FK violations)
  let etCount = 0
  for (const ep of episodes) {
    if (ep.topics) {
      for (const t of ep.topics) {
        if (t.id) {
          try {
            await client.query(
              `INSERT INTO episode_topics (episode_id, topic_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [ep.id, t.id]
            )
            etCount++
          } catch { /* skip FK violations */ }
        }
      }
    }
  }
  console.log(`  ✅ episode_topics — ${etCount} rows`)

  // ================================================================
  // 2. Topics Config (admin-managed topics)
  // ================================================================
  const topicsConfig = readJson<{ topics: any[] }>("topics.json")
  for (const t of topicsConfig.topics) {
    await client.query(
      `INSERT INTO topics_config (id, name, slug, description, color, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.name, t.slug, t.description || null, t.color || "#6366f1", t.created_at, t.updated_at]
    )
  }
  console.log(`  ✅ topics_config — ${topicsConfig.topics.length} rows`)

  // ================================================================
  // 3. Episode Overrides
  // ================================================================
  const overrides = readJson<any[]>("episode-overrides.json")
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
  const enrichments = readJson<Record<string, any>>("episode-enrichments.json")
  const enrichEntries = Object.values(enrichments)
  for (const e of enrichEntries) {
    await client.query(
      `INSERT INTO episode_enrichments (episode_id, hero_summary, full_summary, takeaways, topics, resources, timestamps, why_this_conversation, before_you_watch, conversation_map, central_question, exclusive_clip, unsaid_reflections, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (episode_id) DO NOTHING`,
      [
        e.episodeId,
        e.hero_summary || null,
        e.full_summary || null,
        JSON.stringify(e.takeaways || []),
        JSON.stringify(e.topics || []),
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
  // 5. Episode Guest Assignments
  // ================================================================
  const guestAssignments = readJson<Record<string, string>>("episode-guest-assignments.json")
  const gaEntries = Object.entries(guestAssignments)
  let gaCount = 0
  for (const [epId, gId] of gaEntries) {
    try {
      await client.query(
        `INSERT INTO episode_guest_assignments (episode_id, guest_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [epId, gId]
      )
      gaCount++
    } catch { /* skip FK violations */ }
  }
  console.log(`  ✅ episode_guest_assignments — ${gaCount}/${gaEntries.length} rows`)

  // ================================================================
  // 6. Episode Quotes
  // ================================================================
  const epQuotes = readJson<Record<string, any>>("episode-quotes.json")
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
  // 7. Episode Sections & Assignments
  // ================================================================
  const sectionsData = readJson<{
    sections: any[]
    assignments: Record<string, string>
    hiddenEpisodes: string[]
    deletedEpisodes: string[]
  }>("episode-sections.json")


  for (const s of sectionsData.sections) {
    await client.query(
      `INSERT INTO episode_sections (id, label, "order", color, hidden)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.label, s.order, s.color || "#3b82f6", s.hidden || false]
    )
  }
  console.log(`  ✅ episode_sections — ${sectionsData.sections.length} rows`)

  const saEntries = Object.entries(sectionsData.assignments)
  for (const [epId, sectionId] of saEntries) {
    await client.query(
      `INSERT INTO episode_section_assignments (episode_id, section_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [epId, sectionId]
    )
  }
  console.log(`  ✅ episode_section_assignments — ${saEntries.length} rows`)

  // Episode visibility (hidden + deleted)
  let visCount = 0
  for (const epId of sectionsData.hiddenEpisodes || []) {
    await client.query(
      `INSERT INTO episode_visibility (episode_id, visibility) VALUES ($1, 'hidden') ON CONFLICT DO NOTHING`,
      [epId]
    )
    visCount++
  }
  for (const epId of sectionsData.deletedEpisodes || []) {
    await client.query(
      `INSERT INTO episode_visibility (episode_id, visibility) VALUES ($1, 'deleted') ON CONFLICT DO NOTHING`,
      [epId]
    )
    visCount++
  }
  console.log(`  ✅ episode_visibility — ${visCount} rows`)

  // ================================================================
  // 8. Home Quotes
  // ================================================================
  const homeQuotes = readJson<{ quotes: any[] }>("home-quotes.json")
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
  const reflections = readJson<{ reflections: any[] }>("daily-reflections.json")
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
  // 10. Emotional Paths
  // ================================================================
  const pathsData = readJson<{ paths: any[] }>("emotional-paths.json")
  for (const p of pathsData.paths) {
    await client.query(
      `INSERT INTO emotional_paths (id, slug, title, subtitle, icon, color, episode_ids, quote_ids, "order")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [
        p.id,
        p.slug,
        p.title,
        p.subtitle,
        p.icon || "Heart",
        p.color || "#6366f1",
        JSON.stringify(p.episode_ids || []),
        JSON.stringify(p.quote_ids || []),
        p.order || 0,
      ]
    )
  }
  console.log(`  ✅ emotional_paths — ${pathsData.paths.length} rows`)

  // ================================================================
  // 11. Episode Knowledge Map
  // ================================================================
  const knowledgeMap = readJson<{ episodes: Record<string, any>; relationships: Record<string, string[]> }>(
    "episode-knowledge-map.json"
  )


  const knowledgeEntries = Object.entries(knowledgeMap.episodes)
  for (const [epId, analysis] of knowledgeEntries) {
    await client.query(
      `INSERT INTO episode_knowledge (episode_id, analysis) VALUES ($1, $2) ON CONFLICT (episode_id) DO NOTHING`,
      [epId, JSON.stringify(analysis)]
    )
  }
  console.log(`  ✅ episode_knowledge — ${knowledgeEntries.length} rows`)

  // Store relationships + metadata
  await client.query(
    `INSERT INTO episode_knowledge_meta (key, relationships) VALUES ('meta', $1)
     ON CONFLICT (key) DO UPDATE SET relationships = EXCLUDED.relationships`,
    [JSON.stringify(knowledgeMap.relationships)]
  )
  console.log(`  ✅ episode_knowledge_meta — 1 row`)

  // ================================================================
  // 12. Site Settings
  // ================================================================
  const siteSettings = readJson<any>("site-settings.json")
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
  const staticContent = readJson<any>("static-content.json")
  await client.query(
    `INSERT INTO static_content (key, content) VALUES ('about', $1)`,
    [JSON.stringify(staticContent.about || staticContent)]
  )
  console.log(`  ✅ static_content — 1 row`)

  // ================================================================
  // 14. Platform Analytics
  // ================================================================
  const analytics = readJson<Record<string, any>>("analytics.json")
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
  const pushLog = readJson<any[]>("studio-push-log.json")
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
