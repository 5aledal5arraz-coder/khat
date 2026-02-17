/**
 * One-time seed script: migrates JSON config files → Supabase tables.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-configs.ts
 *
 * Safe to re-run (uses upserts).
 */

import { createClient } from "@supabase/supabase-js"
import { readFile } from "fs/promises"
import path from "path"

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
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

  const { error } = await supabase.from("site_settings").upsert({
    key: "main",
    metadata: data.metadata,
    social_links: data.socialLinks,
    seo: data.seo,
    feature_flags: data.featureFlags,
  })
  if (error) console.error("  ✗", error.message)
  else console.log("  ✓ upserted")
}

async function seedStaticContent() {
  console.log("→ static_content")
  const data = await readJSON<{ about: object }>("static-content.json")
  if (!data) return

  const { error } = await supabase.from("static_content").upsert({
    key: "about",
    content: data.about,
  })
  if (error) console.error("  ✗", error.message)
  else console.log("  ✓ upserted")
}

async function seedAnalytics() {
  console.log("→ platform_analytics")
  const data = await readJSON<Record<string, { followers: number; posts: number; engagement: string; url: string }>>("analytics.json")
  if (!data) return

  const rows = Object.entries(data).map(([platform, stats]) => ({
    platform,
    followers: stats.followers,
    posts: stats.posts,
    engagement: stats.engagement,
    url: stats.url,
  }))

  const { error } = await supabase.from("platform_analytics").upsert(rows)
  if (error) console.error("  ✗", error.message)
  else console.log(`  ✓ upserted ${rows.length} platforms`)
}

async function seedTopics() {
  console.log("→ topics_config")
  const data = await readJSON<{ topics: Array<{ id: string; name: string; slug: string; description?: string; color: string; icon?: string; created_at: string; updated_at: string }> }>("topics.json")
  if (!data || !data.topics.length) return

  const rows = data.topics.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description || null,
    color: t.color,
    icon: t.icon || null,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }))

  const { error } = await supabase.from("topics_config").upsert(rows)
  if (error) console.error("  ✗", error.message)
  else console.log(`  ✓ upserted ${rows.length} topics`)
}

async function seedStudioPushLog() {
  console.log("→ studio_push_log")
  const data = await readJSON<Array<{ sessionId: string; episodeId: string; episodeTitle: string; pushedFields: string[]; pushedAt: string }>>("studio-push-log.json")
  if (!data || !data.length) return

  const rows = data.map((entry) => ({
    session_id: entry.sessionId,
    episode_id: entry.episodeId,
    episode_title: entry.episodeTitle,
    pushed_fields: entry.pushedFields,
    pushed_at: entry.pushedAt,
  }))

  const { error } = await supabase.from("studio_push_log").insert(rows)
  if (error) {
    if (error.code === "23505") console.log("  ⚠ rows already exist (duplicate key)")
    else console.error("  ✗", error.message)
  } else {
    console.log(`  ✓ inserted ${rows.length} entries`)
  }
}

async function seedEpisodeOverrides() {
  console.log("→ episode_overrides")
  const data = await readJSON<Array<{ id: string; originalTitle: string; customTitle: string; customDescription?: string }>>("episode-overrides.json")
  if (!data || !data.length) return

  const rows = data.map((o) => ({
    episode_id: o.id,
    original_title: o.originalTitle,
    custom_title: o.customTitle,
    custom_description: o.customDescription || null,
  }))

  const { error } = await supabase.from("episode_overrides").upsert(rows)
  if (error) console.error("  ✗", error.message)
  else console.log(`  ✓ upserted ${rows.length} overrides`)
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
  const sectionRows = data.sections.map((s) => ({
    id: s.id,
    label: s.label,
    order: s.order,
    color: s.color || null,
    hidden: s.hidden || false,
  }))
  const { error: secErr } = await supabase.from("episode_sections").upsert(sectionRows)
  if (secErr) console.error("  ✗ sections:", secErr.message)
  else console.log(`  ✓ upserted ${sectionRows.length} sections`)

  // Assignments
  const assignRows = Object.entries(data.assignments).map(([episodeId, sectionId]) => ({
    episode_id: episodeId,
    section_id: sectionId,
  }))
  if (assignRows.length > 0) {
    const { error: assErr } = await supabase.from("episode_section_assignments").upsert(assignRows)
    if (assErr) console.error("  ✗ assignments:", assErr.message)
    else console.log(`  ✓ upserted ${assignRows.length} assignments`)
  }

  // Visibility
  const visRows = [
    ...(data.hiddenEpisodes || []).map((id) => ({ episode_id: id, visibility: "hidden" })),
    ...(data.deletedEpisodes || []).map((id) => ({ episode_id: id, visibility: "deleted" })),
  ]
  if (visRows.length > 0) {
    const { error: visErr } = await supabase.from("episode_visibility").upsert(visRows)
    if (visErr) console.error("  ✗ visibility:", visErr.message)
    else console.log(`  ✓ upserted ${visRows.length} visibility entries`)
  }
}

async function seedEpisodeGuestAssignments() {
  console.log("→ episode_guest_assignments")
  const data = await readJSON<Record<string, string>>("episode-guest-assignments.json")
  if (!data || Object.keys(data).length === 0) return

  const rows = Object.entries(data).map(([episodeId, guestId]) => ({
    episode_id: episodeId,
    guest_id: guestId,
  }))

  const { error } = await supabase.from("episode_guest_assignments").upsert(rows)
  if (error) console.error("  ✗", error.message)
  else console.log(`  ✓ upserted ${rows.length} guest assignments`)
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

  const rows = Object.values(data).map((e) => ({
    episode_id: e.episodeId,
    hero_summary: e.hero_summary || null,
    full_summary: e.full_summary || null,
    takeaways: e.takeaways || [],
    topics: e.topics || [],
    resources: e.resources || [],
    timestamps: e.timestamps || [],
    why_this_conversation: e.why_this_conversation || null,
    before_you_watch: e.before_you_watch || null,
    conversation_map: e.conversation_map || null,
    central_question: e.central_question || null,
    exclusive_clip: e.exclusive_clip || null,
    unsaid_reflections: e.unsaid_reflections || [],
  }))

  // Batch in chunks of 50
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    const { error } = await supabase.from("episode_enrichments").upsert(chunk)
    if (error) console.error(`  ✗ batch ${i / 50 + 1}:`, error.message)
  }
  console.log(`  ✓ upserted ${rows.length} enrichments`)
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

  const rows = Object.values(data).map((e) => ({
    episode_id: e.episodeId,
    episode_title: e.episodeTitle,
    quotes: e.quotes,
    transcript: e.transcript || null,
    status: e.status,
    generated_at: e.generatedAt,
    published_at: e.publishedAt || null,
  }))

  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    const { error } = await supabase.from("episode_quotes_config").upsert(chunk)
    if (error) console.error(`  ✗ batch ${i / 50 + 1}:`, error.message)
  }
  console.log(`  ✓ upserted ${rows.length} episode quotes entries`)
}

async function seedAds() {
  console.log("→ ad_slots")
  const data = await readJSON<{ slots: Array<{
    id: string; position: string; label: string; enabled: boolean
    schedule: object; type: string; sponsoredData?: object; bannerData?: object
    updatedAt: string
  }> }>("ads.json")
  if (!data || !data.slots.length) return

  const rows = data.slots.map((s) => ({
    id: s.id,
    position: s.position,
    label: s.label,
    enabled: s.enabled,
    schedule: s.schedule || {},
    type: s.type,
    sponsored_data: s.sponsoredData || {},
    banner_data: s.bannerData || {},
  }))

  const { error } = await supabase.from("ad_slots").upsert(rows)
  if (error) console.error("  ✗", error.message)
  else console.log(`  ✓ upserted ${rows.length} ad slots`)
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

  const rows = data.teasers.map((t) => ({
    id: t.id,
    guest_name: t.guestName,
    title: t.title,
    prompt: t.prompt,
    video_filename: t.videoFilename,
    poster_image: t.posterImage,
    is_active: t.isActive,
    publish_at: t.publishAt,
    expire_at: t.expireAt,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }))

  const { error } = await supabase.from("teasers").upsert(rows)
  if (error) console.error("  ✗", error.message)
  else console.log(`  ✓ upserted ${rows.length} teasers`)
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

  const rows = data.quotes.map((q) => ({
    id: q.id,
    text: q.text,
    attribution: q.attribution,
    episode_slug: q.episode_slug || null,
    episode_title: q.episode_title || null,
    theme: q.theme || null,
    scheduled_date: q.scheduled_date || null,
    status: q.status,
    created_at: q.created_at,
    updated_at: q.updated_at,
  }))

  const { error } = await supabase.from("home_quotes").upsert(rows)
  if (error) console.error("  ✗", error.message)
  else console.log(`  ✓ upserted ${rows.length} home quotes`)
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
    const { error } = await supabase.from("emotional_paths")
      .update({
        title: p.title,
        subtitle: p.subtitle,
        icon: p.icon,
        color: p.color,
        episode_ids: p.episode_ids,
        quote_ids: p.quote_ids,
        order: p.order,
      })
      .eq("slug", p.slug)
    if (error) console.error(`  ✗ ${p.slug}:`, error.message)
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

  const rows = data.reflections.map((r) => ({
    id: r.id,
    date: r.date,
    short_quote: r.short_quote,
    reflection: r.reflection,
    thinking_question: r.thinking_question,
    attribution: r.attribution || null,
    episode_slug: r.episode_slug || null,
    episode_title: r.episode_title || null,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))

  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    const { error } = await supabase.from("daily_reflections").upsert(chunk)
    if (error) console.error(`  ✗ batch ${i / 50 + 1}:`, error.message)
  }
  console.log(`  ✓ upserted ${rows.length} reflections`)
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
  const episodeRows = Object.entries(data.episodes).map(([episodeId, analysis]) => ({
    episode_id: episodeId,
    analysis,
  }))

  for (let i = 0; i < episodeRows.length; i += 50) {
    const chunk = episodeRows.slice(i, i + 50)
    const { error } = await supabase.from("episode_knowledge").upsert(chunk)
    if (error) console.error(`  ✗ episode_knowledge batch ${i / 50 + 1}:`, error.message)
  }
  console.log(`  ✓ upserted ${episodeRows.length} episode knowledge rows`)

  // Meta row
  const { error: metaErr } = await supabase.from("episode_knowledge_meta").upsert({
    key: "meta",
    topic_taxonomy: data.topic_taxonomy,
    relationships: data.relationships,
    analyzed_at: data.analyzed_at,
    season_1_count: data.season_1_count,
    season_2_count: data.season_2_count,
  })
  if (metaErr) console.error("  ✗ meta:", metaErr.message)
  else console.log("  ✓ upserted knowledge meta")
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log("Seeding config data to Supabase...\n")

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
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
