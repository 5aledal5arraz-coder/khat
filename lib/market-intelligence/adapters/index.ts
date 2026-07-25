/**
 * Phase X Step 1 — adapter registry.
 *
 * Add a source: drop a file under this directory + dispatch in
 * `runAdapter` below. The signal table's CHECK constraint must be
 * extended in lockstep (post-schema.sql).
 */

import { collectYoutubeTopic } from "./youtube"
import { collectPodcastTopic } from "./podcast"
import { collectWebGroundedTopic } from "./web-grounded"
import type { MarketCollectionResult, MarketSource } from "./types"

export type { MarketCollectionResult, MarketSource } from "./types"
export type { MarketRawSignal } from "./types"

// Default set run for every preset. `web_grounded` is intentionally NOT
// here — it's an opt-in paid (grounding-fee) source appended by the
// ingestion layer only when MARKET_WEB_GROUNDED_ENABLED=true, so the
// existing daily schedule is unchanged when the flag is off.
export const ALL_MARKET_SOURCES: MarketSource[] = ["youtube", "podcast_apple"]

export async function runAdapter(
  source: MarketSource,
  query: string,
  language: string,
  maxResults = 10,
): Promise<MarketCollectionResult> {
  switch (source) {
    case "youtube":
      return collectYoutubeTopic(query, language, maxResults)
    case "podcast_apple":
      return collectPodcastTopic(query, language, maxResults)
    case "web_grounded":
      return collectWebGroundedTopic(query, language, maxResults)
    default:
      // exhaustive narrow
      return {
        source,
        configured: false,
        note: `unknown source "${source as string}"`,
        signals: [],
      }
  }
}
