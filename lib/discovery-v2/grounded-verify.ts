/**
 * Guest Discovery v2 — grounded live-web verification (opt-in add-on).
 *
 * Wikidata already confirms a proposed name is a *structurally real* human
 * (a stable QID, Q5). It does NOT confirm the person is *live and currently
 * active* on the open web — the difference between "a real historical entry"
 * and "a bookable guest talking in public right now". This layer closes that
 * gap: for the top ADVANCED candidates only, it asks the SHARED grounded-
 * evidence service (Gemini + Google Search) for attributed, recent public
 * presence, derives a lightweight deterministic signal (real + recently
 * active), and attaches it to the candidate.
 *
 * It changes NOTHING about the engine's core: OpenAI still proposes the names,
 * Wikidata still owns identity, scoring/decisions are untouched. This is a
 * verification stamp, never a gate — a candidate with no grounded evidence is
 * expected and fine.
 *
 * Cost discipline (grounding is a PAID per-search call, and discovery proposes
 * many names):
 *   1. Opt-in — off unless DISCOVERY_WEB_GROUNDED_ENABLED=true. Normal runs
 *      spend nothing here.
 *   2. Advanced-only + hard count cap — we ground at most
 *      DISCOVERY_GROUNDING_MAX_CANDIDATES (default 6) of the highest-ranked
 *      NON-rejected candidates, never the whole ~30-name proposal.
 *   3. Sequential + inherited daily budget — calls run one at a time so the
 *      shared `assertRetrievalBudget` cap (inside gatherGroundedEvidence) trips
 *      in order; once it does, the rest simply skip.
 *
 * Fail-safe by contract: every failure (disabled, unconfigured, budget spent,
 * transient) leaves the candidate untouched (`grounded` stays null/absent) and
 * never throws — discovery completes exactly as it does today.
 *
 * The shared service already provides the hard guarantees: ai_runs cost
 * logging (token + grounding fee), the daily cap, prompt-injection-safe
 * rendering, redirect resolution, and provenance.
 */

import {
  gatherGroundedEvidence,
  isGroundedEvidenceConfigured,
  isVertexRedirect,
} from "@/lib/ai/grounded-evidence"
import type { CandidateResearchSource } from "@/types/database"
import type { GroundedVerification, V2Candidate, V2RunInput } from "./types"

const DEFAULT_MAX_CANDIDATES = 6

/** Opt-in: off by default so a normal discovery run spends no grounding fee. */
export function isDiscoveryGroundingEnabled(): boolean {
  return process.env.DISCOVERY_WEB_GROUNDED_ENABLED === "true"
}

/**
 * Hard cap on how many candidates a single run may ground — the primary cost
 * lever. Read at point of use. Clamped to [0, 20]; 0 disables grounding even
 * when the flag is on.
 */
export function discoveryGroundingMaxCandidates(): number {
  const raw = process.env.DISCOVERY_GROUNDING_MAX_CANDIDATES
  if (raw == null || raw === "") return DEFAULT_MAX_CANDIDATES
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MAX_CANDIDATES
  return Math.min(20, Math.floor(n))
}

/**
 * Derive the live-presence signal from attributed evidence — deterministic, no
 * extra AI call (grounding is the ONLY paid step). `recent_activity` is an
 * honest heuristic: a source that mentions this year or last year.
 */
export function deriveGroundedSignal(
  sources: CandidateResearchSource[],
  snippets: string[],
  now = new Date(),
): Pick<GroundedVerification, "presence" | "recent_activity" | "source_count" | "verified_count"> {
  const source_count = sources.length
  const verified_count = sources.filter((s) => s.verified).length
  const presence: GroundedVerification["presence"] =
    verified_count >= 2 ? "confirmed" : source_count >= 1 ? "weak" : "none"

  const year = now.getUTCFullYear()
  const recentYears = [String(year), String(year - 1)]
  const hay = snippets.join(" ")
  const recent_activity = recentYears.some((y) => hay.includes(y))

  return { presence, recent_activity, source_count, verified_count }
}

/** Build the person-verification query for one candidate. */
function buildQuery(c: V2Candidate, topic: string): string {
  const nameEn = c.name_en ? ` (${c.name_en})` : ""
  const role = c.role ? `، ${c.role}` : ""
  const country = c.country ? ` من ${c.country}` : ""
  return (
    `هل "${c.name}"${nameEn}${role}${country} شخص حقيقي له حضور علني موثّق ونشاط حديث؟ ` +
    `ابحث عن مقابلات، محاضرات، مقالات، أو تغطية إعلامية حديثة تؤكّد أنه شخص فعلي نشِط الآن ` +
    `(خصوصاً ما يتّصل بموضوع: ${topic}). إن لم تجد حضوراً واضحاً فاذكر ذلك صراحةً.`
  )
}

/**
 * Ground ONE candidate. Returns a verification stamp, or null when grounding
 * failed/was skipped (budget spent, transient, unconfigured) — always
 * fail-safe, never throws.
 */
export async function verifyCandidateGrounded(
  c: V2Candidate,
  input: V2RunInput,
): Promise<GroundedVerification | null> {
  try {
    const evidence = await gatherGroundedEvidence(buildQuery(c, input.topic), {
      maxResults: 6,
      subjectTable: "discovery_runs",
      subjectId: input.runId ?? null,
      actorId: null,
    })

    // Keep only stably-identifiable sources (a still-wrapped vertex redirect
    // carries a rotating token; a null domain didn't parse). Mirrors the
    // web_grounded adapter's skip rule.
    const usable = evidence.sources.filter(
      (s) => s.domain && !isVertexRedirect(s.url),
    )
    const sources: CandidateResearchSource[] = usable.map((s) => ({
      title: s.title,
      url: s.url,
      domain: s.domain,
      publisher: s.publisher,
      verified: s.verified,
    }))
    const snippets = usable.map((s) => `${s.title} ${s.snippet}`)

    return {
      ...deriveGroundedSignal(sources, snippets),
      sources,
      provider: evidence.provenance.provider,
      model: evidence.provenance.model,
      checked_at: new Date().toISOString(),
    }
  } catch (err) {
    // Budget spent / transient / misconfig — degrade to null, never throw.
    console.warn(
      "[discovery-v2/grounded] verification skipped:",
      err instanceof Error ? err.message.split("\n")[0] : String(err),
    )
    return null
  }
}

/**
 * Attach live-web verification to the top ADVANCED candidates in a scored,
 * already-ranked list. Mutation-free: returns a new array with `grounded`
 * filled on the verified ones and the rest passed through untouched.
 *
 * No-op (returns the input unchanged) when grounding is disabled, unconfigured,
 * or the cap is 0 — so it's safe to call unconditionally from the pipeline.
 */
export async function attachGroundedVerification(
  candidates: V2Candidate[],
  input: V2RunInput,
): Promise<V2Candidate[]> {
  if (!isDiscoveryGroundingEnabled() || !isGroundedEvidenceConfigured()) {
    return candidates
  }
  const cap = discoveryGroundingMaxCandidates()
  if (cap === 0) return candidates

  // Advanced = accepted/shortlist. The list is already ranked (accepted first,
  // then by overall), so the first `cap` non-rejected rows are the top ones.
  const targets = new Set<V2Candidate>()
  for (const c of candidates) {
    if (c.decision === "rejected") continue
    targets.add(c)
    if (targets.size >= cap) break
  }
  if (targets.size === 0) return candidates

  // Sequential: lets the shared daily-budget cap trip in rank order; once it's
  // spent, remaining candidates just get a null (skipped) verification.
  const out: V2Candidate[] = []
  for (const c of candidates) {
    if (!targets.has(c)) {
      out.push(c)
      continue
    }
    const grounded = await verifyCandidateGrounded(c, input)
    out.push({ ...c, grounded })
  }
  return out
}
