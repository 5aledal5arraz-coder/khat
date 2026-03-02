/**
 * One-time seed script: migrates JSON config files → PostgreSQL tables.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/seed-configs.ts
 *
 * Safe to re-run (uses upserts).
 */

import pg from "pg"
import { readFile } from "fs/promises"
import path from "path"

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL")
  process.exit(1)
}

const isLocalhost = DATABASE_URL.includes("localhost")
const cleanUrl = DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")
const client = new pg.Client({
  connectionString: cleanUrl,
  ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
})
const CONFIG_DIR = path.join(process.cwd(), "config")

async function readJSON<T>(filename: string): Promise<T | null> {
  try {
    const raw = await readFile(path.join(CONFIG_DIR, filename), "utf-8")
    return JSON.parse(raw) as T
  } catch {
    console.warn(`  ⚠ Could not read ${filename}, skipping`)
    return null
  }
}

async function seedSiteSettings() {
  console.log("→ site_settings")
  const data = await readJSON<{
    metadata: object
    socialLinks: object[]
    seo: object
    featureFlags: object
  }>("site-settings.json")
  if (!data) return

  await client.query(
    `INSERT INTO site_settings (key, metadata, social_links, seo, feature_flags)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key) DO UPDATE SET
       metadata = EXCLUDED.metadata,
       social_links = EXCLUDED.social_links,
       seo = EXCLUDED.seo,
       feature_flags = EXCLUDED.feature_flags`,
    ["main", JSON.stringify(data.metadata), JSON.stringify(data.socialLinks), JSON.stringify(data.seo), JSON.stringify(data.featureFlags)]
  )
  console.log("  ✓ upserted")
}

async function seedStaticContent() {
  console.log("→ static_content")
  const data = await readJSON<{ about: object }>("static-content.json")
  if (!data) return

  await client.query(
    `INSERT INTO static_content (key, content)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET content = EXCLUDED.content`,
    ["about", JSON.stringify(data.about)]
  )
  console.log("  ✓ upserted")
}

async function seedAnalytics() {
  console.log("→ platform_analytics")
  const data = await readJSON<Record<string, { followers: number; posts: number; engagement: string; url: string }>>("analytics.json")
  if (!data) return

  let count = 0
  for (const [platform, stats] of Object.entries(data)) {
    await client.query(
      `INSERT INTO platform_analytics (platform, followers, posts, engagement, url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (platform) DO UPDATE SET
         followers = EXCLUDED.followers,
         posts = EXCLUDED.posts,
         engagement = EXCLUDED.engagement,
         url = EXCLUDED.url`,
      [platform, stats.followers, stats.posts, stats.engagement, stats.url]
    )
    count++
  }
  console.log(`  ✓ upserted ${count} platforms`)
}

async function seedTopics() {
  console.log("→ topics_config")
  const data = await readJSON<{ topics: Array<{ id: string; name: string; slug: string; description?: string; color: string; icon?: string; created_at: string; updated_at: string }> }>("topics.json")
  if (!data || !data.topics.length) return

  for (const t of data.topics) {
    await client.query(
      `INSERT INTO topics_config (id, name, slug, description, color, icon, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         description = EXCLUDED.description,
         color = EXCLUDED.color,
         icon = EXCLUDED.icon,
         updated_at = EXCLUDED.updated_at`,
      [t.id, t.name, t.slug, t.description || null, t.color, t.icon || null, t.created_at, t.updated_at]
    )
  }
  console.log(`  ✓ upserted ${data.topics.length} topics`)
}

async function seedStudioPushLog() {
  console.log("→ studio_push_log")
  const data = await readJSON<Array<{ sessionId: string; episodeId: string; episodeTitle: string; pushedFields: string[]; pushedAt: string }>>("studio-push-log.json")
  if (!data || !data.length) return

  let count = 0
  for (const entry of data) {
    try {
      await client.query(
        `INSERT INTO studio_push_log (session_id, episode_id, episode_title, pushed_fields, pushed_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [entry.sessionId, entry.episodeId, entry.episodeTitle, entry.pushedFields, entry.pushedAt]
      )
      count++
    } catch (e: unknown) {
      const pgErr = e as { code?: string }
      if (pgErr.code === "23505") continue // duplicate key
      throw e
    }
  }
  console.log(`  ✓ inserted ${count} entries`)
}

async function seedEpisodeOverrides() {
  console.log("→ episode_overrides")
  const data = await readJSON<Array<{ id: string; originalTitle: string; customTitle: string; customDescription?: string }>>("episode-overrides.json")
  if (!data || !data.length) return

  for (const o of data) {
    await client.query(
      `INSERT INTO episode_overrides (episode_id, original_title, custom_title, custom_description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (episode_id) DO UPDATE SET
         original_title = EXCLUDED.original_title,
         custom_title = EXCLUDED.custom_title,
         custom_description = EXCLUDED.custom_description`,
      [o.id, o.originalTitle, o.customTitle, o.customDescription || null]
    )
  }
  console.log(`  ✓ upserted ${data.length} overrides`)
}

async function seedEpisodeSections() {
  console.log("→ episode_sections + assignments + visibility")
  const data = await readJSON<{
    sections: Array<{ id: string; label: string; order: number; color?: string; hidden?: boolean }>
    assignments: Record<string, string>
    hiddenEpisodes: string[]
    deletedEpisodes: string[]
  }>("episode-sections.json")
  if (!data) return

  // Sections
  for (const s of data.sections) {
    await client.query(
      `INSERT INTO episode_sections (id, label, "order", color, hidden)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         label = EXCLUDED.label,
         "order" = EXCLUDED."order",
         color = EXCLUDED.color,
         hidden = EXCLUDED.hidden`,
      [s.id, s.label, s.order, s.color || null, s.hidden || false]
    )
  }
  console.log(`  ✓ upserted ${data.sections.length} sections`)

  // Assignments
  const assignEntries = Object.entries(data.assignments)
  if (assignEntries.length > 0) {
    for (const [episodeId, sectionId] of assignEntries) {
      await client.query(
        `INSERT INTO episode_section_assignments (episode_id, section_id)
         VALUES ($1, $2)
         ON CONFLICT (episode_id) DO UPDATE SET section_id = EXCLUDED.section_id`,
        [episodeId, sectionId]
      )
    }
    console.log(`  ✓ upserted ${assignEntries.length} assignments`)
  }

  // Visibility
  const visRows = [
    ...(data.hiddenEpisodes || []).map((id) => ({ episode_id: id, visibility: "hidden" })),
    ...(data.deletedEpisodes || []).map((id) => ({ episode_id: id, visibility: "deleted" })),
  ]
  if (visRows.length > 0) {
    for (const v of visRows) {
      await client.query(
        `INSERT INTO episode_visibility (episode_id, visibility)
         VALUES ($1, $2)
         ON CONFLICT (episode_id) DO UPDATE SET visibility = EXCLUDED.visibility`,
        [v.episode_id, v.visibility]
      )
    }
    console.log(`  ✓ upserted ${visRows.length} visibility entries`)
  }
}

async function seedEpisodeGuestAssignments() {
  console.log("→ episode_guest_assignments")
  const data = await readJSON<Record<string, string>>("episode-guest-assignments.json")
  if (!data || Object.keys(data).length === 0) return

  const entries = Object.entries(data)
  for (const [episodeId, guestId] of entries) {
    await client.query(
      `INSERT INTO episode_guest_assignments (episode_id, guest_id)
       VALUES ($1, $2)
       ON CONFLICT (episode_id) DO UPDATE SET guest_id = EXCLUDED.guest_id`,
      [episodeId, guestId]
    )
  }
  console.log(`  ✓ upserted ${entries.length} guest assignments`)
}

async function seedEpisodeEnrichments() {
  console.log("→ episode_enrichments")
  const data = await readJSON<Record<string, {
    episodeId: string
    hero_summary?: string
    full_summary?: string
    takeaways?: string[]
    topics?: string[]
    resources?: object[]
    timestamps?: object[]
    why_this_conversation?: string
    before_you_watch?: object
    conversation_map?: object
    central_question?: string
    exclusive_clip?: object
    unsaid_reflections?: string[]
    updatedAt: string
  }>>("episode-enrichments.json")
  if (!data) return

  const entries = Object.values(data)
  for (const e of entries) {
    await client.query(
      `INSERT INTO episode_enrichments (episode_id, hero_summary, full_summary, takeaways, topics, resources, timestamps, why_this_conversation, before_you_watch, conversation_map, central_question, exclusive_clip, unsaid_reflections)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (episode_id) DO UPDATE SET
         hero_summary = EXCLUDED.hero_summary,
         full_summary = EXCLUDED.full_summary,
         takeaways = EXCLUDED.takeaways,
         topics = EXCLUDED.topics,
         resources = EXCLUDED.resources,
         timestamps = EXCLUDED.timestamps,
         why_this_conversation = EXCLUDED.why_this_conversation,
         before_you_watch = EXCLUDED.before_you_watch,
         conversation_map = EXCLUDED.conversation_map,
         central_question = EXCLUDED.central_question,
         exclusive_clip = EXCLUDED.exclusive_clip,
         unsaid_reflections = EXCLUDED.unsaid_reflections`,
      [
        e.episodeId,
        e.hero_summary || null,
        e.full_summary || null,
        JSON.stringify(e.takeaways || []),
        JSON.stringify(e.topics || []),
        JSON.stringify(e.resources || []),
        JSON.stringify(e.timestamps || []),
        e.why_this_conversation || null,
        JSON.stringify(e.before_you_watch || null),
        JSON.stringify(e.conversation_map || null),
        e.central_question || null,
        JSON.stringify(e.exclusive_clip || null),
        JSON.stringify(e.unsaid_reflections || []),
      ]
    )
  }
  console.log(`  ✓ upserted ${entries.length} enrichments`)
}

async function seedEpisodeQuotes() {
  console.log("→ episode_quotes_config")
  const data = await readJSON<Record<string, {
    episodeId: string
    episodeTitle: string
    quotes: object[]
    transcript: string | null
    status: string
    generatedAt: string
    publishedAt: string | null
  }>>("episode-quotes.json")
  if (!data) return

  const entries = Object.values(data)
  for (const e of entries) {
    await client.query(
      `INSERT INTO episode_quotes_config (episode_id, episode_title, quotes, transcript, status, generated_at, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (episode_id) DO UPDATE SET
         episode_title = EXCLUDED.episode_title,
         quotes = EXCLUDED.quotes,
         transcript = EXCLUDED.transcript,
         status = EXCLUDED.status,
         generated_at = EXCLUDED.generated_at,
         published_at = EXCLUDED.published_at`,
      [e.episodeId, e.episodeTitle, JSON.stringify(e.quotes), e.transcript || null, e.status, e.generatedAt, e.publishedAt || null]
    )
  }
  console.log(`  ✓ upserted ${entries.length} episode quotes entries`)
}

async function seedAds() {
  console.log("→ ad_slots")
  const data = await readJSON<{ slots: Array<{
    id: string; position: string; label: string; enabled: boolean
    schedule: object; type: string; sponsoredData?: object; bannerData?: object
    updatedAt: string
  }> }>("ads.json")
  if (!data || !data.slots.length) return

  for (const s of data.slots) {
    await client.query(
      `INSERT INTO ad_slots (id, position, label, enabled, schedule, type, sponsored_data, banner_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         position = EXCLUDED.position,
         label = EXCLUDED.label,
         enabled = EXCLUDED.enabled,
         schedule = EXCLUDED.schedule,
         type = EXCLUDED.type,
         sponsored_data = EXCLUDED.sponsored_data,
         banner_data = EXCLUDED.banner_data`,
      [s.id, s.position, s.label, s.enabled, JSON.stringify(s.schedule || {}), s.type, JSON.stringify(s.sponsoredData || {}), JSON.stringify(s.bannerData || {})]
    )
  }
  console.log(`  ✓ upserted ${data.slots.length} ad slots`)
}

async function seedTeasers() {
  console.log("→ teasers")
  const data = await readJSON<{ teasers: Array<{
    id: string; guestName: string; title: string; prompt: string
    videoFilename: string; posterImage: string | null
    isActive: boolean; publishAt: string | null; expireAt: string | null
    createdAt: string; updatedAt: string
  }> }>("teaser.json")
  if (!data || !data.teasers.length) {
    console.log("  ⚠ no teasers to seed")
    return
  }

  for (const t of data.teasers) {
    await client.query(
      `INSERT INTO teasers (id, guest_name, title, prompt, video_filename, poster_image, is_active, publish_at, expire_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         guest_name = EXCLUDED.guest_name,
         title = EXCLUDED.title,
         prompt = EXCLUDED.prompt,
         video_filename = EXCLUDED.video_filename,
         poster_image = EXCLUDED.poster_image,
         is_active = EXCLUDED.is_active,
         publish_at = EXCLUDED.publish_at,
         expire_at = EXCLUDED.expire_at,
         updated_at = EXCLUDED.updated_at`,
      [t.id, t.guestName, t.title, t.prompt, t.videoFilename, t.posterImage, t.isActive, t.publishAt, t.expireAt, t.createdAt, t.updatedAt]
    )
  }
  console.log(`  ✓ upserted ${data.teasers.length} teasers`)
}

async function seedHomeQuotes() {
  console.log("→ home_quotes")
  const data = await readJSON<{ quotes: Array<{
    id: string; text: string; attribution: string
    episode_id?: string; episode_slug?: string; episode_title?: string
    theme?: string; scheduled_date?: string; status: string
    created_at: string; updated_at: string
  }> }>("home-quotes.json")
  if (!data || !data.quotes.length) return

  for (const q of data.quotes) {
    await client.query(
      `INSERT INTO home_quotes (id, text, attribution, episode_slug, episode_title, theme, scheduled_date, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         text = EXCLUDED.text,
         attribution = EXCLUDED.attribution,
         episode_slug = EXCLUDED.episode_slug,
         episode_title = EXCLUDED.episode_title,
         theme = EXCLUDED.theme,
         scheduled_date = EXCLUDED.scheduled_date,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [q.id, q.text, q.attribution, q.episode_slug || null, q.episode_title || null, q.theme || null, q.scheduled_date || null, q.status, q.created_at, q.updated_at]
    )
  }
  console.log(`  ✓ upserted ${data.quotes.length} home quotes`)
}

async function seedEmotionalPaths() {
  console.log("→ emotional_paths")
  const data = await readJSON<{ paths: Array<{
    id: string; slug: string; title: string; subtitle: string
    icon: string; color: string; episode_ids: string[]; quote_ids: string[]
    order: number
  }> }>("emotional-paths.json")
  if (!data || !data.paths.length) return

  // Update existing rows (seeded by migration 009)
  for (const p of data.paths) {
    await client.query(
      `UPDATE emotional_paths SET
         title = $1, subtitle = $2, icon = $3, color = $4,
         episode_ids = $5, quote_ids = $6, "order" = $7
       WHERE slug = $8`,
      [p.title, p.subtitle, p.icon, p.color, JSON.stringify(p.episode_ids), JSON.stringify(p.quote_ids), p.order, p.slug]
    )
  }
  console.log(`  ✓ updated ${data.paths.length} paths`)
}

async function seedDailyReflections() {
  console.log("→ daily_reflections")
  const data = await readJSON<{ reflections: Array<{
    id: string; date: string; short_quote: string; reflection: string
    thinking_question: string; attribution?: string
    episode_id?: string; episode_slug?: string; episode_title?: string
    quote_id?: string; quote_text?: string
    path_slug?: string; path_title?: string
    status: string; created_at: string; updated_at: string
  }> }>("daily-reflections.json")
  if (!data || !data.reflections.length) return

  for (const r of data.reflections) {
    await client.query(
      `INSERT INTO daily_reflections (id, date, short_quote, reflection, thinking_question, attribution, episode_slug, episode_title, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         date = EXCLUDED.date,
         short_quote = EXCLUDED.short_quote,
         reflection = EXCLUDED.reflection,
         thinking_question = EXCLUDED.thinking_question,
         attribution = EXCLUDED.attribution,
         episode_slug = EXCLUDED.episode_slug,
         episode_title = EXCLUDED.episode_title,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [r.id, r.date, r.short_quote, r.reflection, r.thinking_question, r.attribution || null, r.episode_slug || null, r.episode_title || null, r.status, r.created_at, r.updated_at]
    )
  }
  console.log(`  ✓ upserted ${data.reflections.length} reflections`)
}

async function seedKnowledgeMap() {
  console.log("→ episode_knowledge + episode_knowledge_meta")
  const data = await readJSON<{
    episodes: Record<string, object>
    topic_taxonomy: object[]
    relationships: Record<string, string[]>
    analyzed_at: string
    season_1_count: number
    season_2_count: number
  }>("episode-knowledge-map.json")
  if (!data) return

  // Per-episode rows
  const episodeEntries = Object.entries(data.episodes)
  for (const [episodeId, analysis] of episodeEntries) {
    await client.query(
      `INSERT INTO episode_knowledge (episode_id, analysis)
       VALUES ($1, $2)
       ON CONFLICT (episode_id) DO UPDATE SET analysis = EXCLUDED.analysis`,
      [episodeId, JSON.stringify(analysis)]
    )
  }
  console.log(`  ✓ upserted ${episodeEntries.length} episode knowledge rows`)

  // Meta row
  await client.query(
    `INSERT INTO episode_knowledge_meta (key, topic_taxonomy, relationships, analyzed_at, season_1_count, season_2_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (key) DO UPDATE SET
       topic_taxonomy = EXCLUDED.topic_taxonomy,
       relationships = EXCLUDED.relationships,
       analyzed_at = EXCLUDED.analyzed_at,
       season_1_count = EXCLUDED.season_1_count,
       season_2_count = EXCLUDED.season_2_count`,
    ["meta", JSON.stringify(data.topic_taxonomy), JSON.stringify(data.relationships), data.analyzed_at, data.season_1_count, data.season_2_count]
  )
  console.log("  ✓ upserted knowledge meta")
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log("Seeding config data to PostgreSQL...\n")

  await client.connect()

  try {
    await seedSiteSettings()
    await seedStaticContent()
    await seedAnalytics()
    await seedTopics()
    await seedStudioPushLog()
    await seedEpisodeOverrides()
    await seedEpisodeSections()
    await seedEpisodeGuestAssignments()
    await seedEpisodeEnrichments()
    await seedEpisodeQuotes()
    await seedAds()
    await seedTeasers()
    await seedHomeQuotes()
    await seedEmotionalPaths()
    await seedDailyReflections()
    await seedKnowledgeMap()

    console.log("\n✅ Seed complete!")
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
