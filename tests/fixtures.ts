/**
 * Shared test fixtures for the KHAT query layer.
 * Provides realistic Arabic episode/guest data for testing.
 */
import type { Episode, Guest, EpisodeWithRelations, Timestamp, Quote, Resource } from "@/types/database"
import type { EpisodeOverride } from "@/types/episodes"

export function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: "ep-1",
    title: "حلقة الاختبار الأولى",
    slug: "episode-1",
    description: "وصف الحلقة الأولى",
    summary: null,
    key_takeaways: null,
    youtube_url: "https://youtube.com/watch?v=test1",
    duration_minutes: 45,
    release_date: "2026-03-01",
    episode_number: 1,
    season: 1,
    mood: null,
    thumbnail_url: "https://img.youtube.com/vi/test1/maxresdefault.jpg",
    status: "published",
    featured: false,
    view_count: 1000,
    guest_id: null,
    guest: null,
    created_at: "2026-03-01T00:00:00Z",
    ...overrides,
  }
}

export function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "guest-1",
    name: "أحمد الضيف",
    slug: "ahmed-guest",
    bio: "ضيف بودكاست خط",
    photo_url: null,
    external_links: null,
    testimonial: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

export function makeEpisodeWithRelations(
  overrides: Partial<EpisodeWithRelations> = {}
): EpisodeWithRelations {
  const base = makeEpisode(overrides)
  return {
    ...base,
    guest_id: overrides.guest_id ?? base.guest_id ?? null,
    guest: overrides.guest ?? base.guest ?? null,
    timestamps: overrides.timestamps ?? [],
    quotes: overrides.quotes ?? [],
    resources: overrides.resources ?? [],
  }
}

/** A set of episodes for pipeline testing */
export const testEpisodes: Episode[] = [
  makeEpisode({ id: "ep-1", title: "الموسم الأول — حلقة ١", slug: "s1-ep1", season: 1, episode_number: 1, release_date: "2026-01-01", view_count: 500 }),
  makeEpisode({ id: "ep-2", title: "حلقة مع ضيف مميز", slug: "s1-ep2", season: 1, episode_number: 2, release_date: "2026-01-15", view_count: 2000, guest_id: "guest-1", guest: makeGuest() }),
  makeEpisode({ id: "ep-3", title: "الموسم الثاني — البداية", slug: "s2-ep1", season: 2, episode_number: 31, release_date: "2026-02-01", view_count: 3000 }),
  makeEpisode({ id: "ep-4", title: "مقاطع مختارة", slug: "clips-1", season: 1, duration_minutes: 10, release_date: "2026-02-15", view_count: 100 }),
  makeEpisode({ id: "ep-5", title: "حلقة خاصة حصرية", slug: "special-1", season: 2, episode_number: 32, release_date: "2026-03-01", view_count: 800, guest_id: "guest-2", guest: makeGuest({ id: "guest-2", name: "فاطمة", slug: "fatima" }) }),
]

export const testOverrides: EpisodeOverride[] = [
  { id: "ep-1", originalTitle: "الموسم الأول — حلقة ١", customTitle: "عنوان معدّل للحلقة الأولى" },
  { id: "ep-3", originalTitle: "الموسم الثاني — البداية", customTitle: "انطلاقة الموسم الثاني", customDescription: "وصف جديد" },
]
