/**
 * Client-safe types for the blind judgment panel.
 *
 * Split out from `store.ts` for the same reason as
 * `lib/khat-brain/push-preview-types.ts`: the judging UI is a client
 * component, and `store.ts` imports `lib/db.ts` → `pg`. A single import from
 * store — even `import type` — put the whole Postgres driver in the browser
 * graph and the page died on `Can't resolve 'dns'`. Types have no runtime, so
 * they belong somewhere with no runtime either.
 *
 * Rule for this folder: a client component may import from `types.ts` and
 * `stats.ts` (both pure). It may NOT import from `store.ts` or the `index.ts`
 * barrel, which re-exports it.
 */

/** What the judge (human or model) said about one pair, in ITS OWN A/B frame. */
export type PanelVerdict = "a" | "b" | "tie"

/** Which side of a pair an output came from. Hidden until reveal. */
export type PanelSource = "current" | "candidate"

/** The production surface a pair was generated for. */
export type PanelSection = "titles" | "description"

/** The two outputs of one pair, already shuffled at generation time. */
export interface BlindPanelPair {
  /** 1-based position in the session. */
  index: number
  /** Real published episode this was generated from (context for the judge). */
  episodeId: string
  episodeTitle: string
  section: PanelSection
  /** Slot A's text, and which model produced it. */
  aText: string
  aSource: PanelSource
  bText: string
  bSource: PanelSource
  /** Model judge's verdict in this pair's A/B frame. Zero weight. */
  judgeVerdict: PanelVerdict | null
}

export interface BlindPanelSession {
  version: number
  id: string
  createdAt: string
  /** The model in production today — what "keep current" means. */
  currentModel: string
  candidateModel: string
  /** Judge model, recorded so its agreement score is attributable. */
  judgeModel: string
  /** Production prompt version the outputs were generated with. */
  promptVersion: string
  pairs: BlindPanelPair[]
  /** pair index → verdict. Sparse until the panel is finished. */
  verdicts: Record<string, PanelVerdict>
  revealedAt: string | null
}

// ─── Public (blinded) projection ─────────────────────────────────────────────

/** One pair as the judging page is allowed to see it. */
export interface BlindPanelPairView {
  index: number
  episodeTitle: string
  section: PanelSection
  aText: string
  bText: string
  verdict: PanelVerdict | null
  /** Present ONLY after reveal. */
  aSource?: PanelSource
  bSource?: PanelSource
  judgeVerdict?: PanelVerdict | null
}

export interface BlindPanelView {
  id: string
  createdAt: string
  revealed: boolean
  revealedAt: string | null
  /** Model names are withheld while blind — they name the sources. */
  currentModel?: string
  candidateModel?: string
  judgeModel?: string
  promptVersion?: string
  pairs: BlindPanelPairView[]
}
