/**
 * Studio deep-link builder.
 *
 * There is no `/admin/studio/[sessionId]` page — that route was planned
 * but never built, and links to it 404. The studio workspace's only
 * open contract is the `?video=<videoId>` query param, which
 * `studio-client.tsx` resolves against `studio_sessions.video_id`.
 *
 * Sessions without a video id (audio uploads) have no deep-link; for
 * those we fall back to the studio list page, where the operator can
 * open the session manually.
 */
export function studioDeepLink(videoId: string | null): string {
  return videoId
    ? `/admin/studio?video=${encodeURIComponent(videoId)}`
    : "/admin/studio"
}
