/**
 * Guest Discovery v2 — types.
 *
 * v2 is "name-first, story-first": an LLM proposes real named people, each
 * is resolved against Wikidata (identity CONFIDENCE, not a gate — most real
 * story guests are not in it), enriched against independent public sources,
 * checked for a first-hand lived story whose quotes are verified verbatim in
 * code, then scored. A grounded story outweighs fame (Khaled, 2026-09-26).
 * This file is the shared vocabulary for that pipeline.
 */

import type { CandidateResearchSource } from "@/types/database"
import type { GuestSensitivityFlag } from "@/lib/khat-map/core/policy"

export interface V2Filters {
  gender?: "male" | "female" | null
  nationality?: "kuwaiti" | "non_kuwaiti" | null
  /** ISO-ish country hint, e.g. "Kuwait", "Egypt". Free-form. */
  country?: string | null
}

/**
 * Where the guests should come from. Default is Kuwait only (Khaled,
 * 2026-09-26); Saudi Arabia and the rest of the Gulf are opt-in. Steers the
 * propose prompt, scopes the Gulf-event hook, and rejects a candidate only
 * when a VERIFIED nationality falls outside it.
 */
export type V2Geography = "kuwait" | "saudi" | "gulf"

/**
 * The launch defaults every discovery surface starts from (Khaled,
 * 2026-09-28): guests are men from Kuwait. Khat does not host women guests
 * for now. Both stay changeable per run — these are the PRESELECTION of the
 * EIR launcher, the /admin/discovery-v2 form, and season Phase-B, not a
 * filter the engine forces. Topic generation is deliberately NOT governed by
 * this (topics stay pan-Arab; separate decision).
 */
export const DEFAULT_DISCOVERY_GENDER = "male" as const
export const DEFAULT_DISCOVERY_GEOGRAPHY: readonly V2Geography[] = ["kuwait"]

export interface V2RunInput {
  /** Episode topic / theme the guest should fit. Arabic ok. */
  topic: string
  filters?: V2Filters
  /** Empty/absent → resolved by `resolveGeography()` (Kuwait by default). */
  geography?: V2Geography[] | null
  /** "famous" | "balanced" | "hidden_gems" — re-weights notability. */
  taste?: "famous" | "balanced" | "hidden_gems"
  /** How many final candidates to surface. */
  limit?: number
  seasonId?: string | null
  episodeCandidateId?: string | null
  /** discovery_runs.id — links ai_runs telemetry back to this run. */
  runId?: string | null
}

/**
 * Where a name came from. `propose` = the LLM from memory (a hypothesis);
 * `harvest_web` = a grounded search of Kuwaiti press/podcasts/talks that
 * found him telling it himself (D1 — arrives WITH its sources);
 * `x_list` = a member of a curated lived-experience X list whose bio matches
 * the topic (D5).
 */
export type ProposedOrigin = "propose" | "harvest_web" | "x_list"

/**
 * A witness profile (D2): the KIND of person who lived this topic and where
 * such a person would have told it. Written by a cheap model call before
 * propose; it steers propose + the grounded harvest, and never scores.
 */
export interface WitnessProfile {
  /** «رجل كويتي خسر تجارته في الأزمة ثم بدأ من جديد» */
  profile: string
  /** Where such a man tells it: «مقابلة صحفية»، «بودكاست كويتي»، «TEDx Kuwait»… */
  where_told: string[]
  /** 2–5 short Arabic search words for this experience. */
  search_terms: string[]
}

/** A raw name proposal (pre-verification). */
export interface ProposedName {
  name: string
  name_en?: string | null
  role?: string | null
  country?: string | null
  why?: string | null
  /**
   * The specific experience the model BELIEVES this person lived. A
   * hypothesis written from model memory — it only steers the evidence
   * search and the order candidates are checked in. It never scores.
   */
  story_claim?: string | null
  /**
   * The model's own label for how it knows the person relates to the topic.
   * Like the claim it only orders the story check (`rankForStoryCheck`).
   */
  story_type?: "first_hand" | "second_hand" | "adjacent" | "expert" | null
  /**
   * The model's own statement of the person's gender. NOT evidence — used
   * only to drop a proposal that itself contradicts the run's gender filter
   * before any paid step; verification still reads Wikidata / sources.
   */
  gender?: "male" | "female" | null
  /** Absent = "propose". */
  origin?: ProposedOrigin
  /**
   * Where he told it himself (v2-propose-7: required from the model; a URL
   * for harvested names). A hypothesis like story_claim until the story
   * check verifies a quote — it never scores.
   */
  public_account_ref?: string | null
  /**
   * Harvested names only: the live sources the harvest already found him in.
   * The story check classifies these instead of paying for a second search.
   */
  harvest_sources?: StorySource[]
}

/** Structured facts confirmed by Wikidata/Wikipedia. */
export interface WikiFacts {
  resolved: boolean
  qid?: string | null
  label?: string | null
  label_ar?: string | null
  description?: string | null
  /** human (Q5) confirmed */
  is_human?: boolean
  occupations?: string[]
  gender?: "male" | "female" | "other" | null
  nationality_country?: string | null
  birth_year?: number | null
  death_year?: number | null
  image_url?: string | null
  wikipedia_url?: string | null
  wikipedia_ar_url?: string | null
  official_website?: string | null
  /** count of language editions with an article — a notability proxy */
  sitelink_count?: number
  /** several humans share this name and the top two scored too close —
   *  downstream scoring caps the candidate at shortlist. */
  identity_uncertain?: boolean
  social?: {
    x?: string | null
    instagram?: string | null
    youtube_channel?: string | null
    linkedin?: string | null
  }
  summary?: string | null
  /**
   * Set (with `resolved: false`) when a match was DROPPED after the story
   * check: the entity's occupation never appears in the verified story, or
   * the classifier said the sources are not this entity (2026-09-29 — a
   * footballer born 2003 lent his sitelinks to a man jailed by a name
   * mix-up). Kept for the audit trail only; nothing of the entity is used.
   */
  identity_dropped?: { qid: string | null; description: string | null; reason: string } | null
}

export interface EnrichmentSignals {
  /** OpenAlex: scholarly footprint. */
  scholar?: { works: number; cited_by: number; institution?: string | null } | null
  /** YouTube: the person's OWN channel/talks. */
  youtube?: {
    channel_url?: string | null
    channel_title?: string | null
    talk_url?: string | null
    /** The talk's own title + description — kept as story evidence text. */
    talk_title?: string | null
    talk_description?: string | null
    subscriber_hint?: number | null
  } | null
  /** Podcast appearances (guestability). `test` = Listen Notes sandbox
   *  (mock data) was used because no real LISTEN_NOTES_API_KEY is set. */
  podcast?: { appearances: number; latest_url?: string | null; configured: boolean; test?: boolean } | null
  /** Recent press (GDELT). */
  news?: { recent_mentions: number; latest_url?: string | null; latest_title?: string | null } | null
  /** Books (Google Books). */
  books?: { count: number; top_title?: string | null } | null
  /**
   * X (Twitter) presence + recent activity — looked up via the EXACT handle
   * Wikidata attaches to the person (P2002), never fuzzy name search. Null
   * when X_BEARER_TOKEN is unset or the person has no handle on Wikidata.
   */
  x?: {
    url: string
    username: string
    followers: number
    verified: boolean
    posting: "active" | "occasional" | "dormant"
    recent_posts: number
    avg_engagement: number
    /** First lines of up to 3 recent posts — what they're talking about now. */
    recent_sample: string[]
    bio?: string | null
  } | null
  /**
   * Instagram presence + recent activity — official Business Discovery
   * lookup of the EXACT username Wikidata attaches to the person (P2003),
   * never fuzzy name search. Null when IG_GRAPH_TOKEN /
   * IG_BUSINESS_ACCOUNT_ID are unset, the person has no handle on
   * Wikidata, or the account is personal-mode (Business Discovery only
   * resolves Business/Creator accounts).
   */
  instagram?: {
    url: string
    username: string
    followers: number
    media_count: number
    posting: "active" | "occasional" | "dormant"
    recent_posts: number
    avg_engagement: number
    /** First lines of up to 3 recent captions — what they're posting about now. */
    recent_sample: string[]
    bio?: string | null
    website?: string | null
  } | null
}

/**
 * Optional live-web verification for ONE advanced candidate — the grounded
 * layer that confirms a Wikidata-resolved person is not just structurally real
 * but *currently active on the open web* (interviews, talks, articles, recent
 * press). Produced by the shared grounded-evidence service (Gemini + Google
 * Search), OUTSIDE the AI router. Attached only to top advanced candidates and
 * only when `DISCOVERY_WEB_GROUNDED_ENABLED=true` — it is an add-on signal,
 * never a gate, so its absence never changes a decision.
 */
export interface GroundedVerification {
  /**
   * Live-web presence, derived deterministically from the attributed sources
   * (no extra AI call): "confirmed" = ≥2 verified live sources, "weak" = ≥1
   * source found, "none" = the search returned nothing usable.
   */
  presence: "confirmed" | "weak" | "none"
  /**
   * Heuristic "active recently" flag — true when a source title/snippet
   * mentions the current or previous calendar year. A signal, not a proof.
   */
  recent_activity: boolean
  /** Total attributed sources returned. */
  source_count: number
  /** How many resolved to a live (non-4xx) page. */
  verified_count: number
  /** Attributed web sources (same trimmed shape the candidate UI already renders). */
  sources: CandidateResearchSource[]
  /** Who produced the evidence (for a provenance stamp in the UI). */
  provider: "gemini"
  model: string
  /** ISO timestamp the check ran. */
  checked_at: string
  /** Set when the search was skipped/failed (budget spent, transient) — fail-safe. */
  note?: string
}

/**
 * The first-hand-story assessment for one candidate. Everything in
 * `evidence` / `gulf_event` passed the code-side guard in story-classify.ts
 * (live source, ≥6-word verbatim span of that source's text, names the
 * person) — the model's own claims never reach here unverified.
 */
export interface StoryAssessment {
  status: "verified" | "unverified" | "not_checked"
  /** Why it was not checked — the run page says so out loud. */
  not_checked_reason?: "cap" | "unavailable" | "error" | null
  story_type: "first_hand" | "second_hand" | "expert_only" | "none"
  summary: string | null
  /**
   * Verified items only. `on_page` — the quote was also found verbatim on the
   * source page ITSELF (fetched in code, source-page.ts). Otherwise it only
   * matched Gemini's grounding summary of that page: the card labels it a
   * summary, never «a quote». Absent (older runs) = not shown to be on the page.
   */
  evidence: { url: string; domain: string | null; quote: string; on_page?: boolean }[]
  gulf_event: { event: string; url: string; quote: string } | null
  /** The propose-time hypothesis, shown labelled «فرضية». Never scored. */
  claim_from_propose: string | null
  /**
   * How what the sources say about this person relates to THE EPISODE TOPIC,
   * backed by a verified verbatim quote (same guard as `evidence`). Absent =
   * not established (not checked, no citable source, or no verified quote).
   * The classifier used to never see the topic, so a founder's "founding
   * story" scored as a full first-hand story on an episode about family
   * money. S counts fully only when on_topic (storyScore in score.ts).
   */
  topic_relevance?: TopicRelevance | null
  /**
   * D3 — did HE tell it (interview, his own post/talk/book) or was it written
   * about him by others? A first-hand story that is NOT self-told counts like
   * a story told by others (score.ts). Absent = NOT VERIFIED — the card says
   * «لم يُتحقق أنه رواها بنفسه», never «رواها بنفسه».
   *
   * `true` only from the source page itself (source-page.ts `pageSpeaker`):
   * the page names him AND shows he is the one speaking — his own channel or
   * byline, «ضيف الحلقة»/«نستضيف»/«مع فلان», «فلان يحكي», or a «فلان: …ـي»
   * first-person headline. `quote` is that cue, text that exists on the page.
   * `false` only from the classifier with a verified quote (a downgrade).
   * The classifier's own `true` is a claim and is never kept (2026-09-29:
   * it matched Gemini's third-person summary — 0/9 such quotes were on the
   * live pages, and a third party retelling جاسم المطوع's story passed).
   */
  self_told?: { value: boolean; url: string; quote: string; basis?: SelfToldBasis } | null
}

/** How `self_told` was established. */
export type SelfToldBasis =
  /** The YouTube channel / byline is his (and the page names him). */
  | "own_channel"
  | "byline"
  /** The page presents him as the guest / the one telling it. */
  | "guest"
  /** A «فلان: …» headline in the first person — he is quoted speaking. */
  | "quoted"
  /** The classifier said NOT self-told, with a verified quote. */
  | "classifier"

export type TopicRelevanceValue = "on_topic" | "adjacent" | "off_topic"

export interface TopicRelevance {
  value: TopicRelevanceValue
  url: string
  quote: string
}

/**
 * `gender_unverified` / `nationality_unverified` name the attribute a filter
 * (or the geography scope) could not verify. `filter_unverified` is the
 * pre-split form, kept only so rows stored before the split still render.
 */
export type V2Flag =
  | "identity_unverified"
  | "identity_uncertain"
  | "gender_unverified"
  | "nationality_unverified"
  | "filter_unverified"
  /** claimed first-hand story, checked, no public account (Khaled «أ») */
  | "story_unpublished"
  /** the only verified account is told by relatives / community */
  | "story_second_hand"
  /** a verified first-hand story, but no page showed HE told it (2026-09-29) */
  | "story_self_told_unverified"
  /** unresolved and nothing on the web names them — kept only for a story_unpublished */
  | "no_web_footprint"
  /** the guest-policy gate fired (lexicon over his texts, or the classifier's flags) */
  | "policy_violation"
  /** a served financial conviction — not a reject; Khaled decides (FINANCIAL_RECORD_POLICY) */
  | "policy_review"

/**
 * needs_review for the STORY, not the identity: Khaled reviews these by
 * hand. The run page lists them apart from the verified strong stories and
 * the pipeline ranks the unpublished ones below every verified story.
 * `policy_review` (a served financial record) is listed here too — it is a
 * Khaled decision, not an identity check.
 */
export const STORY_REVIEW_FLAGS: readonly V2Flag[] = [
  "story_unpublished",
  "story_second_hand",
  "story_self_told_unverified",
  "policy_review",
]

/**
 * One numbered text source a story check can cite. `text` is what a quote
 * is verified against: the grounded snippet for web sources (text Gemini
 * attributed to the URL — not raw page text), the title+description for a
 * YouTube talk, the headline for a GDELT article.
 */
export interface StorySource {
  kind: "web" | "youtube" | "news"
  title: string
  url: string
  domain: string | null
  /**
   * For `web` sources this is Gemini's GROUNDING SUMMARY of the page (the
   * answer segments it attributed to the URL) — its words, often third-person
   * prose shared across URLs, never the page. `page` is the page itself.
   */
  text: string
  /** Live (non-4xx) — only verified sources can back a quote. */
  verified: boolean
  /**
   * The source page itself, read in code (source-page.ts). `null` = tried and
   * could not be read; absent = never tried. Only this can prove who is
   * speaking (`self_told`) or that a quote is really on the page.
   */
  page?: SourcePage | null
}

/** A live source page as the page itself states it — never an AI's words. */
export interface SourcePage {
  /** The page / video title. */
  title: string
  /** The YouTube channel or the article byline, when the page states one. */
  author: string | null
  /** Readable text: the video description, or the article's paragraphs. Capped. */
  text: string
  via: "youtube_api" | "youtube_oembed" | "html"
}

/** Everything the scorer needs from the story step (pure data). */
export interface StoryCheck {
  assessment: StoryAssessment
  /** Every source gathered for this person — feeds searchability + footprint. */
  sources: StorySource[]
  /** Attributes the classifier stated WITH a verified quote; null/false otherwise. */
  attrs: {
    deceased: boolean
    not_individual: boolean
    /** false only when the classifier said the evidence is about someone else */
    same_person: boolean
    gender: "male" | "female" | null
    nationality: string | null
    /**
     * The classifier's own policy flags for THIS person (constitution avoid
     * list). A claim — it may only reject, never approve. Absent on checks
     * that never reached the classifier.
     */
    sensitivity_flags?: GuestSensitivityFlag[]
    /**
     * The classifier's answer to «is the Wikidata entity shown the person in
     * these sources?» — `false` drops the QID; `true`/null never adds trust.
     */
    wikidata_match?: boolean | null
  }
}

export interface V2Scores {
  // All 0..1.
  /** first-hand story — 0 unless backed by verified verbatim evidence */
  story: number
  topic_fit: number
  /** named Gulf event (1) / Gulf place only (0.5) in a verified quote */
  gulf_hook: number
  /** distinct live sources that name the person in a story/topic context */
  searchability: number
  guestability: number
  /** sitelinks/citations/books/website — follower counts deliberately excluded */
  notability: number
  recency: number
  /** 1 unless a verified attribute contradicts a filter (kept for stored rows) */
  filter_match: number
  /** absolute confidence penalty subtracted from the weighted base */
  penalty: number
  /** weighted overall, 0..1 */
  overall: number
  /**
   * Components that were NOT computed from real evidence for this person
   * (never checked, no source contributed, only a lexical guess). The number
   * still feeds `overall` — the run page shows «غير مقيّم» instead of it, so
   * a default is never read as a measurement. Absent on rows scored before
   * 2026-09-28.
   */
  unmeasured?: V2ScoreKey[]
}

/** The per-component score keys the run page can mark «غير مقيّم». */
export type V2ScoreKey =
  | "story"
  | "topic_fit"
  | "searchability"
  | "guestability"
  | "notability"
  | "recency"

export interface V2Candidate {
  name: string
  name_en?: string | null
  role?: string | null
  country?: string | null
  why?: string | null
  wiki: WikiFacts
  signals: EnrichmentSignals
  scores: V2Scores
  /**
   * `needs_review` = a verified strong story whose identity or filter
   * attribute could not be confirmed, OR a story Khaled reviews by hand
   * (`STORY_REVIEW_FLAGS`: unpublished first-hand / told by others). Persists as `under_review` like
   * `accepted` (no schema change); the distinction lives in
   * `platform_signals.v2.decision`.
   */
  decision: "accepted" | "needs_review" | "shortlist" | "rejected"
  reasons: string[]
  /** Optional only for rows scored before story-first; the pipeline always sets it. */
  story?: StoryAssessment
  /** Where the name came from (absent on rows scored before 2026-09-28). */
  origin?: ProposedOrigin
  /** Where he told it himself — a hypothesis unless the story check verified it. */
  public_account_ref?: string | null
  flags?: V2Flag[]
  /**
   * Optional live-web verification — present only for top advanced candidates
   * when grounding is enabled; null/absent otherwise (fail-safe add-on).
   */
  grounded?: GroundedVerification | null
}
