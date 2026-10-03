/**
 * Podcast Universe feature flag (plan §6 step 4–5, D12 rollback).
 *
 * PODCAST_UNIVERSE_ENABLED must be exactly "true" for ANY of the module to
 * run: unset / anything else = OFF. Production therefore has to opt in
 * explicitly; turning it off again is the rollback (no data is touched).
 *
 * Off means: sidebar entries hidden, admin pages notFound(), server actions
 * refuse, podcast.* job handlers no-op (logged, never dead-lettered), the
 * weekly scheduler does not bootstrap, and the CLI refuses everything but
 * `status`. Read at use (lazy), so a test or an env change applies at once.
 */
export function isPodcastUniverseEnabled(): boolean {
  return process.env.PODCAST_UNIVERSE_ENABLED === "true"
}

export const PODCAST_UNIVERSE_DISABLED_MESSAGE =
  "عالم البودكاست غير مفعّل (PODCAST_UNIVERSE_ENABLED ليس true)"
