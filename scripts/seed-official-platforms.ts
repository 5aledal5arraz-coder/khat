/**
 * Seed script — Official Platform Links (the source of truth for external KHAT
 * URLs). Idempotent: upserts by `platform_key`.
 *
 * Usage: npx tsx scripts/seed-official-platforms.ts
 */
import { db } from "../lib/db"
import { officialPlatformLinks } from "../lib/db/schema/audio-platforms"
import type { NewOfficialPlatformLink } from "../lib/db/schema/audio-platforms"
import { sql } from "drizzle-orm"

type SeedItem = Omit<NewOfficialPlatformLink, "id" | "created_at" | "updated_at">

const seeds: SeedItem[] = [
  // ── Audio platforms (show on /listen + episode pages + footer) ────────────
  {
    platform_key: "apple_podcasts",
    platform_name: "Apple Podcasts",
    url: "https://podcasts.apple.com/podcast/khatpodcast",
    handle: null,
    icon_name: "apple_podcasts",
    category: "audio",
    is_primary: true,
    is_active: true,
    sort_order: 10,
    show_in_header: false,
    show_in_footer: true,
    show_on_homepage: true,
    show_on_episode_page: true,
    show_on_about_page: true,
    show_on_contact_page: false,
    show_on_guest_page: false,
  },
  {
    platform_key: "spotify",
    platform_name: "Spotify",
    url: "https://open.spotify.com/show/khatpodcast",
    handle: null,
    icon_name: "spotify",
    category: "audio",
    is_primary: true,
    is_active: true,
    sort_order: 20,
    show_in_header: false,
    show_in_footer: true,
    show_on_homepage: true,
    show_on_episode_page: true,
    show_on_about_page: true,
    show_on_contact_page: false,
    show_on_guest_page: false,
  },
  {
    platform_key: "anghami",
    platform_name: "Anghami",
    url: "https://play.anghami.com/podcast/khatpodcast",
    handle: null,
    icon_name: "anghami",
    category: "audio",
    is_primary: true,
    is_active: true,
    sort_order: 30,
    show_in_header: false,
    show_in_footer: true,
    show_on_homepage: true,
    show_on_episode_page: true,
    show_on_about_page: true,
    show_on_contact_page: false,
    show_on_guest_page: false,
  },

  // ── Video platform ────────────────────────────────────────────────────────
  {
    platform_key: "youtube",
    platform_name: "YouTube",
    url: "https://youtube.com/@KhatPodcast",
    handle: "@KhatPodcast",
    icon_name: "youtube",
    category: "video",
    is_primary: true,
    is_active: true,
    sort_order: 5,
    show_in_header: false,
    show_in_footer: true,
    show_on_homepage: true,
    show_on_episode_page: true,
    show_on_about_page: true,
    show_on_contact_page: true,
    show_on_guest_page: true,
  },

  // ── Social ────────────────────────────────────────────────────────────────
  {
    platform_key: "instagram",
    platform_name: "Instagram",
    url: "https://instagram.com/KhatPodcast",
    handle: "@KhatPodcast",
    icon_name: "instagram",
    category: "social",
    is_primary: false,
    is_active: true,
    sort_order: 40,
    show_in_header: false,
    show_in_footer: true,
    show_on_homepage: false,
    show_on_episode_page: false,
    show_on_about_page: true,
    show_on_contact_page: true,
    show_on_guest_page: true,
  },
  {
    platform_key: "x",
    platform_name: "X",
    url: "https://x.com/khatpodcast",
    handle: "@khatpodcast",
    icon_name: "x",
    category: "social",
    is_primary: false,
    is_active: true,
    sort_order: 50,
    show_in_header: false,
    show_in_footer: true,
    show_on_homepage: false,
    show_on_episode_page: false,
    show_on_about_page: true,
    show_on_contact_page: true,
    show_on_guest_page: true,
  },
  {
    platform_key: "tiktok",
    platform_name: "TikTok",
    url: "https://tiktok.com/@khatpodcast",
    handle: "@khatpodcast",
    icon_name: "tiktok",
    category: "social",
    is_primary: false,
    is_active: true,
    sort_order: 60,
    show_in_header: false,
    show_in_footer: true,
    show_on_homepage: false,
    show_on_episode_page: false,
    show_on_about_page: true,
    show_on_contact_page: true,
    show_on_guest_page: true,
  },
  {
    platform_key: "whatsapp",
    platform_name: "WhatsApp",
    url: "https://whatsapp.com/channel/0029VaE4SfPIN9ip2O3BBL3G",
    handle: null,
    icon_name: "whatsapp",
    category: "community",
    is_primary: false,
    is_active: true,
    sort_order: 70,
    show_in_header: false,
    show_in_footer: true,
    show_on_homepage: false,
    show_on_episode_page: false,
    show_on_about_page: true,
    show_on_contact_page: true,
    show_on_guest_page: false,
  },

  // ── RSS feed (reference for podcast apps — not an account URL) ────────────
  {
    platform_key: "rss",
    platform_name: "RSS Feed",
    url: "https://media.rss.com/khatpodcast/feed.xml",
    handle: null,
    icon_name: "rss",
    category: "audio",
    is_primary: false,
    is_active: true,
    sort_order: 99,
    show_in_header: false,
    show_in_footer: false,
    show_on_homepage: false,
    show_on_episode_page: false,
    show_on_about_page: false,
    show_on_contact_page: false,
    show_on_guest_page: false,
  },
]

async function main() {
  if (!db) throw new Error("DB not configured — set DATABASE_URL")

  console.log(`Seeding ${seeds.length} official platform links...`)

  for (const seed of seeds) {
    await db
      .insert(officialPlatformLinks)
      .values(seed)
      .onConflictDoUpdate({
        target: officialPlatformLinks.platform_key,
        set: {
          platform_name: seed.platform_name,
          url: seed.url,
          handle: seed.handle,
          icon_name: seed.icon_name,
          category: seed.category,
          is_primary: seed.is_primary,
          is_active: seed.is_active,
          sort_order: seed.sort_order,
          show_in_header: seed.show_in_header,
          show_in_footer: seed.show_in_footer,
          show_on_homepage: seed.show_on_homepage,
          show_on_episode_page: seed.show_on_episode_page,
          show_on_about_page: seed.show_on_about_page,
          show_on_contact_page: seed.show_on_contact_page,
          show_on_guest_page: seed.show_on_guest_page,
          updated_at: new Date(),
        },
      })
    console.log(`  ✓ ${seed.platform_key} (${seed.category})`)
  }

  const [{ c }] = (
    await db.execute(sql`SELECT count(*)::int AS c FROM podcast_platform_links`)
  ).rows as Array<{ c: number }>
  console.log(`\nDone — ${c} rows in podcast_platform_links`)
  process.exit(0)
}

main().catch((e) => {
  console.error("SEED FAIL:", e)
  process.exit(1)
})
