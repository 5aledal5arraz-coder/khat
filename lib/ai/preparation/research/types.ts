/**
 * Internal pipeline types.
 *
 * These are the shapes that flow through the retrieval → normalize →
 * synthesize → verify pipeline. They are intentionally decoupled from the
 * public `PreparationResearch` shape so we can evolve the pipeline
 * independently.
 */

import type {
  PreparationSourceProvider,
  PreparationResearchSource,
  PreparationClaim,
  PreparationCitedQuote,
  PreparationPastInterview,
  PreparationRetrievalDiagnostic,
} from "@/types/preparation"

/** Raw source as returned by a retrieval provider, before normalization. */
export interface RawRetrievedSource {
  provider: PreparationSourceProvider
  title: string
  url: string
  snippet: string
  publisher?: string
  published_at?: string
  metrics?: { view_count?: number; like_count?: number }
}

/** One provider's retrieval result. */
export interface ProviderResult {
  diagnostic: PreparationRetrievalDiagnostic
  sources: RawRetrievedSource[]
}

/** Claim proposed by the synthesizer BEFORE verification. */
export interface ProposedClaim {
  claim: string
  category: PreparationClaim["category"]
  source_ids: number[]
}

/** Quote proposed by the synthesizer BEFORE verification. */
export interface ProposedQuote {
  text: string
  attributed_to: string
  context?: string
  source_ids: number[]
}

/** Past interview proposed by the synthesizer. */
export interface ProposedPastInterview {
  title: string
  publisher?: string
  url?: string
  note?: string
  source_ids: number[]
}

/** Full synthesizer output. */
export interface SynthesizerOutput {
  claims: ProposedClaim[]
  quotes: ProposedQuote[]
  past_interviews: ProposedPastInterview[]
}

/** Verifier decision for a single claim. */
export interface VerifierDecision {
  claim_id: string
  status: "verified" | "weak" | "unverified"
  note?: string
}

/** Final pipeline result after verification — fed to DB. */
export interface PipelineResult {
  sources: PreparationResearchSource[]
  retrieval: PreparationRetrievalDiagnostic[]
  claims: PreparationClaim[]
  quotes: PreparationCitedQuote[]
  past_interviews: PreparationPastInterview[]
  verified_count: number
  weak_count: number
  unverified_count: number
  queries_used: string[]
}
