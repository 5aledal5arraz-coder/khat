/**
 * Navigation and the related rail stay inside the lane of the episode on
 * screen.
 *
 * Both selectors used to walk the whole newest-first archive, which is ONE
 * list across every lane. Measured on production: «الحلقة التالية» from خط
 * episode 019 was a clip, and the related rail returned the same three clips
 * on all 8 episodes checked — not one خط conversation among them, because the
 * three newest rows in the archive happen to be clips and the fallback was
 * literally `list.slice(0, 3)`.
 *
 * The lane itself is decided in exactly one place (`laneOfEpisode` /
 * `filterLane` in lib/episodes/programs.ts); these tests assert the selectors
 * READ it rather than re-deriving adjacency from dates alone.
 */
import { describe, it, expect } from "vitest"
import { selectAdjacentEpisodes, selectRelatedEpisodes } from "@/lib/queries/episodes"
import { CLIPS_CATEGORY_SLUG } from "@/lib/episodes/clips"
import type { Episode } from "@/types/database"

const KHAT_SLUG = "حوارات"

function ep(id: string, categorySlug: string): Episode {
  return {
    id,
    slug: id,
    title: id,
    category: { id: categorySlug, slug: categorySlug, name: categorySlug },
  } as unknown as Episode
}

/** Newest-first, exactly as `getCachedPublicEpisodes()` returns it. */
const LIST = [
  ep("clip-3", CLIPS_CATEGORY_SLUG),
  ep("clip-2", CLIPS_CATEGORY_SLUG),
  ep("clip-1", CLIPS_CATEGORY_SLUG),
  ep("khat-019", KHAT_SLUG),
  ep("khat-018", KHAT_SLUG),
  ep("khat-017", KHAT_SLUG),
]

describe("selectAdjacentEpisodes — lane-scoped", () => {
  it("does not hand a خط episode a clip as its next", () => {
    const { prev, next } = selectAdjacentEpisodes(LIST, "khat-019")
    expect(next).toBeNull() // newest in its OWN lane
    expect(prev?.id).toBe("khat-018")
  })

  it("walks within the خط lane in both directions", () => {
    const { prev, next } = selectAdjacentEpisodes(LIST, "khat-018")
    expect(next?.id).toBe("khat-019")
    expect(prev?.id).toBe("khat-017")
  })

  it("keeps a clip's neighbours inside the clips lane", () => {
    const { prev, next } = selectAdjacentEpisodes(LIST, "clip-2")
    expect(next?.id).toBe("clip-3")
    expect(prev?.id).toBe("clip-1")
  })

  it("still returns nothing for a slug that is not in the list", () => {
    expect(selectAdjacentEpisodes(LIST, "nope")).toEqual({ prev: null, next: null })
  })
})

describe("selectRelatedEpisodes — lane-scoped", () => {
  it("does not fill a خط episode's rail with clips", () => {
    const out = selectRelatedEpisodes(LIST, "khat-019", 3)
    expect(out.map((e) => e.id)).toEqual(["khat-018", "khat-017"])
  })

  it("returns a different set per lane instead of the same three rows", () => {
    const forKhat = selectRelatedEpisodes(LIST, "khat-019", 3).map((e) => e.id)
    const forClip = selectRelatedEpisodes(LIST, "clip-1", 3).map((e) => e.id)
    expect(forKhat).not.toEqual(forClip)
    expect(forClip).toEqual(["clip-3", "clip-2"])
  })

  it("excludes the episode itself", () => {
    const out = selectRelatedEpisodes(LIST, "clip-2", 3)
    expect(out.some((e) => e.id === "clip-2")).toBe(false)
  })
})
