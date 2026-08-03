import { getYouTubeId } from "@/lib/utils"
import type { Episode } from "@/types/database"

/**
 * Where an episode's 16:9 frame comes from. One module, because it used to be
 * eight copies of the same template literal.
 *
 * They disagreed on all three of the things a copy can disagree about:
 *  · **Host** — `img.youtube.com` in six places, `i.ytimg.com` in the column
 *    the importer writes. Same CDN, two spellings, one of them not in the
 *    `next.config.ts` allowlist by accident of who wrote it first.
 *  · **Whether `episodes.thumbnail_url` counts.** The homepage queries honoured
 *    it; the episode card, the OG image and the JSON-LD rebuilt the URL from
 *    the video id and ignored it. The column exists so an editor can override
 *    the frame — on the day someone used it, half the site would have obeyed.
 *  · **What happens when the frame does not exist.** Nothing did. Measured on
 *    the CDN, `maxresdefault.jpg` is a hard 404 for videos that have no
 *    1280x720 still (e.g. `jNQXAC9IVRw`), and `hqdefault.jpg` is a 200.
 *
 * This lives in `lib/` and not beside the component on purpose: `lib/seo`,
 * `lib/queries` and the page metadata need the URL as a string and must not
 * import a client component to get it.
 */

export type ThumbQuality = "maxresdefault" | "hqdefault" | "mqdefault"

/** The canonical URL of one YouTube still. `i.ytimg.com` is the CDN's own host. */
export function youTubeThumbUrl(videoId: string, quality: ThumbQuality = "maxresdefault"): string {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`
}

type ThumbSubject = Pick<Episode, "thumbnail_url" | "youtube_url">

/**
 * Every source worth trying for this episode, best first — the stored override,
 * then the 1280x720 still, then the 480x360 one.
 *
 * `hqdefault` is 4:3 with black bars of exactly 45px top and bottom, so
 * `object-cover` into a 16:9 box crops precisely the bars and lands on the real
 * frame. That is arithmetic, not luck: 360 − 480×9/16 = 90, split in two.
 */
export function episodeThumbSources(ep: ThumbSubject): string[] {
  const sources: string[] = []
  if (ep.thumbnail_url) sources.push(ep.thumbnail_url)

  const id = getYouTubeId(ep.youtube_url)
  if (id) {
    for (const quality of ["maxresdefault", "hqdefault"] as const) {
      const url = youTubeThumbUrl(id, quality)
      if (!sources.includes(url)) sources.push(url)
    }
  }
  return sources
}

/**
 * The single best frame URL, or `null` when we have none.
 *
 * For the callers that get one shot and no retry: `og:image`, the JSON-LD
 * `thumbnailUrl`, anything handed to a crawler. They cannot walk the ladder, so
 * they take the top of it.
 */
export function episodeThumbUrl(ep: ThumbSubject): string | null {
  return episodeThumbSources(ep)[0] ?? null
}
