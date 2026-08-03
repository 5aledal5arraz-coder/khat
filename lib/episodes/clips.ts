import type { Episode } from "@/types/database"

/**
 * The category that holds the short cut-downs rather than conversations.
 *
 * A slug and not an id because ids differ between the local and production
 * databases; the slug is the stable, human-set key (`episode_categories.slug`).
 */
export const CLIPS_CATEGORY_SLUG = "مقاطع-خط"

/**
 * Is this row a clip rather than an episode?
 *
 * REQUIRES A LIST FETCHED WITH `withCategories: true`. `category` is only
 * attached when the caller asks for it, and a list without it would report
 * "no clips" instead of failing — the exact silent-success shape this codebase
 * keeps getting bitten by. `mainFeed()` therefore asserts rather than assumes;
 * see the note there.
 */
export function isClip(ep: Episode): boolean {
  return ep.category?.slug === CLIPS_CATEGORY_SLUG
}

/**
 * The list the site leads with: conversations, no clips.
 *
 * WHY THEY COME OUT. The six clips are cut from episodes we already publish, so
 * on the homepage they were duplicating conversations that were also in the
 * grid — and because they are the most recent uploads they took the featured
 * slot and five of the six grid tiles, i.e. the homepage was almost entirely
 * clips. They keep their own category chip on `/episodes` and their own
 * `/categories/مقاطع-خط` page, so nothing becomes unreachable.
 *
 * Returns the input unchanged when NOTHING in the list carries a resolved
 * category, which is the signature of a caller that forgot `withCategories` —
 * silently filtering nothing there would look identical to "there are no
 * clips". Loud in dev, harmless in production.
 */
export function mainFeed(list: Episode[]): Episode[] {
  const categorised = list.some((ep) => ep.category !== undefined && ep.category !== null)
  if (list.length > 0 && !categorised) {
    console.warn(
      "[episodes] mainFeed() received a list with no resolved categories — " +
        "fetch it with `withCategories: true` or clips will not be separated.",
    )
    // A COPY even here: callers sort the result in place, and the input is a
    // cached array shared by every request on this server.
    return [...list]
  }
  return list.filter((ep) => !isClip(ep))
}
