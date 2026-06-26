export interface Guest {
  id: string
  name: string
  slug: string
  bio: string | null
  photo_url: string | null
  external_links: Record<string, string> | null
  testimonial: string | null
  created_at: string
}

export interface EpisodeCategory {
  id: string
  name: string
  slug: string
  sort_order: number
  created_at: string
}

export interface Episode {
  id: string
  title: string
  slug: string
  description?: string | null
  summary?: string | null
  key_takeaways?: string[] | null
  youtube_url: string
  duration_minutes: number
  release_date: string
  episode_number?: number | null
  season?: number | null
  mood?: string | null
  thumbnail_url?: string | null
  status?: string
  featured?: boolean
  view_count?: number | null
  category_id?: string | null
  category?: EpisodeCategory | null
  guest_id?: string | null
  guest?: Guest | null
  guest_testimonial?: string | null
  guest_video_url?: string | null
  audio_url?: string | null
  audio_type?: string | null
  rss_guid?: string | null
  rss_published_at?: string | null
  audio_duration?: number | null
  created_at: string
  updated_at?: string
}

export interface PodcastPlatformLink {
  id: string
  platform_key: string
  platform_name: string
  url: string
  handle: string | null
  icon_name: string | null
  category: string
  is_primary: boolean | null
  is_active: boolean | null
  sort_order: number | null
  show_in_header: boolean | null
  show_in_footer: boolean | null
  show_on_homepage: boolean | null
  show_on_episode_page: boolean | null
  show_on_about_page: boolean | null
  show_on_contact_page: boolean | null
  show_on_guest_page: boolean | null
  notes_internal: string | null
  created_at: Date | null
  updated_at: Date | null
}

export interface Timestamp {
  id: string
  episode_id: string
  time_seconds: number
  title: string
  description: string | null
}

export interface Quote {
  id: string
  episode_id: string
  guest_id: string | null
  text: string
  theme: string | null
  created_at: string
}

export interface Resource {
  id: string
  episode_id: string
  title: string
  url: string
  type: string | null
}

export interface NewsletterSubscriber {
  id: string
  email: string
  created_at: string
}

export type EpisodeVersionChangeType =
  | "title_override"
  | "description_override"
  | "enrichment"
  | "quotes"
  | "section_assignment"
  | "visibility"
  | "guest_assignment"
  | "category_assignment"
  | "youtube_pack"
  | "conversation"
  | "full_snapshot"

export interface EpisodeVersion {
  id: string
  episode_id: string
  version_number: number
  change_type: EpisodeVersionChangeType
  change_summary: string | null
  snapshot: Record<string, unknown>
  created_by: string
  created_at: string
}

export type SponsorshipStatus =
  | "new"
  | "reviewing"
  | "proposal_sent"
  | "negotiation"
  | "confirmed"
  | "declined"

export interface SponsorshipLead {
  id: string
  // Company Info
  company_name: string
  industry: string
  company_website: string | null
  contact_name: string
  job_title: string
  email: string
  phone: string
  // Campaign Details
  collaboration_types: string[]
  collaboration_other: string | null
  // Objectives
  main_goal: string
  target_audience: string
  // Brand & expectations (partnership redesign)
  brand_values: string | null
  campaign_goals: string | null
  expectations: string | null
  previous_partnerships: string | null
  preferred_timeline: string | null
  // Budget
  budget_range: string
  // Additional
  additional_info: string | null
  // Meta
  status: SponsorshipStatus
  created_at: string
}

// --- Sponsorship AI ---

export type SponsorshipAnalysisStatus = "generating" | "ready" | "error"

/** AI-recommended fit verdict for a partnership lead. */
export type PartnershipFitVerdict =
  | "strong_fit"
  | "possible_fit"
  | "weak_fit"
  | "not_recommended"

export interface ResearchSource {
  title: string
  url: string
}

export interface SponsorshipAnalysis {
  id: string
  lead_id: string
  status: SponsorshipAnalysisStatus
  fit_score: number | null
  quality: string | null
  risk_level: string | null
  intent_summary: string | null
  budget_fit: string | null
  recommended_package: string | null
  reasoning: string | null
  risk_flags: string[]
  opportunity_highlights: string[]
  // ─── Partnership evaluation upgrade (live research + recommendations) ───────
  /** Synthesized summary of what online research surfaced about the company. */
  research_summary: string | null
  /** Grounded sources the research drew on (from live web search). */
  research_sources: ResearchSource[]
  /** Reputation read — standing, sentiment, any controversies. */
  reputation: string | null
  /** What the company makes/sells. */
  products_summary: string | null
  /** Market position — scale, competitors, where it sits. */
  market_position: string | null
  /** The company's own audience and how it overlaps Khat's. */
  audience_summary: string | null
  /** Headline verdict on suitability for Khat. */
  fit_verdict: PartnershipFitVerdict | null
  /** Why it is (or isn't) a good fit. */
  fit_reasoning: string | null
  /** Recommended partnership structure (which package / shape). */
  recommended_structure: string | null
  /** Recommended number of episodes. */
  recommended_episodes: number | null
  /** Recommended pricing strategy (approach, not a fixed number). */
  pricing_strategy: string | null
  /** When the online research last ran. */
  researched_at: string | null
  raw_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

export type SponsorshipProposalStatus = "generating" | "ready" | "error"

export interface ProposedPackage {
  name: string
  description: string
  price_range: string
  deliverables: string[]
}

export interface SponsorshipProposal {
  id: string
  lead_id: string
  analysis_id: string | null
  status: SponsorshipProposalStatus
  subject: string | null
  greeting: string | null
  introduction: string | null
  value_proposition: string | null
  proposed_packages: ProposedPackage[]
  next_steps: string | null
  closing: string | null
  full_draft: string | null
  /** Short, ready-to-send reply email introducing the proposal. */
  reply_email: string | null
  edited_draft: string | null
  tone: string
  raw_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

// --- Per-company offer (secret link) ---

export interface PartnershipOffer {
  id: string
  lead_id: string
  /** Secret slug used in the public URL /offer/<token>. */
  token: string
  title: string | null
  intro: string | null
  body: string | null
  packages: ProposedPackage[]
  validity_note: string | null
  contact_email: string | null
  password_hash: string | null
  published: boolean
  view_count: number
  last_viewed_at: string | null
  created_at: string
  updated_at: string
}

/** Public-safe offer shape (no password hash) returned to the secret-link page. */
export interface PublicPartnershipOffer {
  title: string | null
  intro: string | null
  body: string | null
  packages: ProposedPackage[]
  validity_note: string | null
  contact_email: string | null
  company_name: string
}

// --- Guest Application AI ---

export type GuestAnalysisStatus = "generating" | "ready" | "error"
export type GuestAnalysisRecommendation = "strong_accept" | "accept" | "consider_later" | "reject"

export interface GuestApplicationAnalysis {
  id: string
  application_id: string
  status: GuestAnalysisStatus
  fit_score: number | null
  emotional_depth_score: number | null
  story_clarity_score: number | null
  originality_score: number | null
  readiness_score: number | null
  risk_level: string | null
  recommendation: GuestAnalysisRecommendation | null
  fit_summary: string | null
  strongest_angle: string | null
  why_now: string | null
  audience_value: string | null
  concerns: string[]
  strengths: string[]
  suggested_direction: string | null
  raw_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

export interface GuestApplicationConcept {
  id: string
  application_id: string
  analysis_id: string | null
  status: GuestAnalysisStatus
  proposed_episode_title: string | null
  title_alternatives: string[]
  episode_hook: string | null
  episode_logline: string | null
  why_this_episode_matters: string | null
  conversation_style: string | null
  suggested_opening_question: string | null
  suggested_core_questions: string[]
  suggested_sensitive_areas: string[]
  suggested_topics_to_avoid: string[]
  host_preparation_notes: string | null
  raw_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

export interface GuestApplicationResponse {
  id: string
  application_id: string
  analysis_id: string | null
  status: GuestAnalysisStatus
  acceptance_formal: string | null
  acceptance_warm: string | null
  rejection_formal: string | null
  rejection_warm: string | null
  consider_later_formal: string | null
  consider_later_warm: string | null
  raw_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

export type GuestApplicationStatus =
  | "new"
  | "under_review"
  | "accepted"
  | "rejected"
  | "consider_later"

export interface GuestApplication {
  id: string
  // Step 1 — Basic Info
  name: string
  email: string
  phone: string
  country: string
  can_travel_to_kuwait: string | null
  // Step 2 — Your Story
  story_idea: string
  beyond_job_title: string
  life_changing_moment: string
  hope_people_understand: string
  unasked_question: string
  why_khat: string
  // Step 3 — Recording & Appearance
  previous_podcast: boolean
  previous_podcast_info: string | null
  prefer_dialogue_or_story: string
  topics_to_avoid: string | null
  filming_concern: string
  agrees_to_publish: boolean
  social_links: string | null
  // Meta
  status: GuestApplicationStatus
  created_at: string
}

export type ThinkerSuggestionStatus = "new" | "reviewing" | "approved" | "rejected"

export interface ThinkerSuggestion {
  id: string
  thinker_name: string
  research_field: string
  reason: string
  social_links: string | null
  phone: string | null
  status: ThinkerSuggestionStatus
  created_at: string
}

// ---------------------------------------------------------------------------
// Admin Episode Views (server-transformed projections for admin UI)
// ---------------------------------------------------------------------------

/** Lightweight episode projection used by admin episodes list & detail pages */
export interface AdminEpisodeView {
  id: string
  slug: string
  title: string
  description: string
  youtube_url: string
  release_date: string
  duration_minutes: number
  category_id: string | null
  guest_id: string | null
  guest_name: string | null
}

/** Lightweight guest projection used by admin episodes components */
export interface AdminGuestView {
  id: string
  name: string
  photo_url: string | null
}

export interface EpisodeWithRelations extends Episode {
  guest: Guest | null
  timestamps: Timestamp[]
  quotes: Quote[]
  resources: Resource[]
}

export interface GuestWithRelations extends Guest {
  episodes: Episode[]
  quotes: Quote[]
}

export type StudioSessionStatus = 'draft' | 'fetched' | 'error'
export type StudioSessionSource = 'youtube' | 'audio'

export interface StudioSession {
  id: string
  youtube_url: string | null
  video_id: string | null
  source: StudioSessionSource
  status: StudioSessionStatus
  video_title: string | null
  channel_title: string | null
  published_at: string | null
  duration_seconds: number | null
  thumbnail_url: string | null
  raw_youtube_response: Record<string, unknown> | null
  audio_filename: string | null
  audio_file_size: number | null
  audio_start_seconds: number | null
  audio_end_seconds: number | null
  audio_best_intro: string | null
  audio_edit_suggestions: AudioEditSuggestion[] | null
  episode_id: string | null
  episode_title: string | null
  source_type: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AudioEditSuggestion {
  start_seconds: number
  end_seconds: number
  category: 'long_pause' | 'repetitive' | 'off_topic' | 'filler' | 'other'
  reason: string
}

export type StudioTranscriptSource = 'youtube_captions' | 'upload' | 'whisper' | 'paste'
export type StudioTranscriptStatus = 'ready' | 'error'
export type StudioTranscriptProcessingStatus = 'idle' | 'processing' | 'ready' | 'error'

export interface StudioTranscriptSummary {
  overview: string
  key_ideas: string[]
  lessons: string[]
}

export interface StudioTranscriptQuote {
  text: string
  theme: string
}

export interface StudioTranscript {
  id: string
  session_id: string
  source: StudioTranscriptSource
  language: string
  transcript_raw: string
  transcript_clean: string
  word_count: number
  char_count: number
  status: StudioTranscriptStatus
  error_message: string | null
  // AI-processed outputs
  transcript_article: string | null
  summary: StudioTranscriptSummary | null
  quotes_extracted: StudioTranscriptQuote[] | null
  processing_status: StudioTranscriptProcessingStatus
  created_at: string
  updated_at: string
}

export type StudioAiOutputStatus = 'generating' | 'ready' | 'error'

export interface StudioAiOutput {
  id: string
  session_id: string
  model: string
  prompt_version: string
  status: StudioAiOutputStatus
  title_best: string
  title_alternatives: string[]
  thumbnail_text_options: string[]
  youtube_description: string
  seo_keywords: string[]
  hashtags: string[]
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  edited_fields: Record<string, string> | null
  created_at: string
  updated_at: string
}

export type StudioChaptersStatus = 'generating' | 'ready' | 'error'

export interface StudioChapterItem {
  start_time: string // HH:MM:SS
  title: string
}

export interface StudioChapters {
  id: string
  session_id: string
  status: StudioChaptersStatus
  chapters: StudioChapterItem[]
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  edited_fields: Record<string, string> | null
  created_at: string
  updated_at: string
}

export type StudioClipsStatus = 'generating' | 'ready' | 'error'

export interface StudioClipItem {
  start_time: string // HH:MM:SS
  end_time: string   // HH:MM:SS
  platform: string   // YouTube Shorts / IG Reels / TikTok / X
  hook_text: string
  caption: string
  why_it_works: string
  used?: boolean
  // Social Clip Package fields
  clip_title?: string
  hashtags?: string[]
  description?: string
  viral_hook?: string
}

export interface StudioClips {
  id: string
  session_id: string
  status: StudioClipsStatus
  clips: StudioClipItem[]
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  edited_fields: Record<string, string> | null
  created_at: string
  updated_at: string
}

export type StudioWebsitePackageStatus = 'generating' | 'ready' | 'error'

export interface WebsiteQuoteItem { text: string; theme: string | null; speaker: string | null }
export interface WebsiteResourceItem { title: string; url: string; type: string | null }
export interface WebsiteTimestampItem { time_seconds: number; title: string; description: string | null }
export interface GuestPackageData { guest_name: string; guest_bio: string; guest_photo_url: string | null; guest_external_links: Record<string, string> }

export interface StudioWebsitePackage {
  id: string
  session_id: string
  status: StudioWebsitePackageStatus
  hero_summary: string | null
  full_summary: string | null
  takeaways: string[]
  quotes: WebsiteQuoteItem[]
  resources: WebsiteResourceItem[]
  timestamps: WebsiteTimestampItem[]
  custom_title: string | null
  selected_quote_indices: number[] | null
  selected_takeaway_indices: number[] | null
  linked_episode_id: string | null
  guest_package: GuestPackageData | null
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  edited_fields: Record<string, string> | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Studio Analyzer (post-publish YouTube performance analysis)
// ---------------------------------------------------------------------------

export type StudioAnalyzerStatus = 'idle' | 'generating' | 'ready' | 'error'

export interface StudioAnalyzerDiagnosis {
  classification: string
  reasoning: string
  key_metrics_summary: string
}

export interface StudioAnalyzerImprovements {
  alt_titles: string[]
  optimized_description: string
  chapters: string
  pinned_comment: string
  thumbnail_concepts: string[]
}

export interface StudioAnalyzerRevivalStep {
  order: number
  action: string
  detail: string
}

export interface StudioAnalyzerData {
  diagnosis: StudioAnalyzerDiagnosis
  improvements: StudioAnalyzerImprovements
  revival: { steps: StudioAnalyzerRevivalStep[] }
  clips: StudioClipItem[]
}

export interface StudioAnalyzer {
  id: string
  session_id: string
  status: StudioAnalyzerStatus
  data: StudioAnalyzerData | null
  prompt_version: string
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Studio Deep Analysis (content intelligence)
// ---------------------------------------------------------------------------

export type StudioDeepAnalysisStatus = 'generating' | 'ready' | 'error'

export interface DeepAnalysisTheme {
  name: string
  description: string
  evidence: string[]
}

export interface DeepAnalysisArgument {
  claim: string
  supporting_evidence: string[]
  counter_points: string[]
}

export interface DeepAnalysisEmotionalMoment {
  timestamp_approx: string
  description: string
  emotion: string
  quote: string
}

export interface DeepAnalysisLesson {
  title: string
  explanation: string
  applicability: string
}

export interface DeepAnalysisContradiction {
  point_a: string
  point_b: string
  context: string
}

export interface DeepAnalysisDialogueMap {
  speakers: string[]
  dynamics: string
  power_shifts: string[]
}

export interface StudioDeepAnalysis {
  id: string
  session_id: string
  status: StudioDeepAnalysisStatus
  themes: DeepAnalysisTheme[]
  thesis: string | null
  arguments: DeepAnalysisArgument[]
  emotional_moments: DeepAnalysisEmotionalMoment[]
  lessons: DeepAnalysisLesson[]
  contradictions: DeepAnalysisContradiction[]
  dialogue_map: DeepAnalysisDialogueMap | null
  conversation_arc: string | null
  open_questions: string[]
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  edited_fields: Record<string, string> | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Studio Guest Intelligence (guest detection and profiling)
// ---------------------------------------------------------------------------

export type StudioGuestIntelligenceStatus = 'generating' | 'ready' | 'error'

export interface GuestNotableQuote {
  text: string
  context: string
}

export interface StudioGuestIntelligence {
  id: string
  session_id: string
  status: StudioGuestIntelligenceStatus
  detected_name: string | null
  detected_bio: string | null
  confidence_score: number | null
  speaking_style: string | null
  key_positions: string[]
  notable_quotes: GuestNotableQuote[]
  external_links: Record<string, string> | null
  linked_guest_id: string | null
  raw_openai_response: Record<string, unknown> | null
  error_message: string | null
  edited_fields: Record<string, string> | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Edited fields type (shared across Studio child tables)
// ---------------------------------------------------------------------------

export type StudioEditedFields = Record<string, string> | null

// ---------------------------------------------------------------------------
// Home Page Content Models
// ---------------------------------------------------------------------------

export interface HomeQuote {
  id: string
  text: string
  attribution: string
  episode_id?: string
  episode_slug?: string
  episode_title?: string
  theme?: string
  scheduled_date?: string // YYYY-MM-DD
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

export interface DailyReflection {
  id: string
  date: string // YYYY-MM-DD
  short_quote: string
  reflection: string
  thinking_question: string
  attribution?: string
  episode_id?: string
  episode_slug?: string
  episode_title?: string
  quote_id?: string
  quote_text?: string
  status: 'draft' | 'scheduled' | 'published'
  created_at: string
  updated_at: string
}

// --- Guest Preparation Forms ---

export type GuestPrepFormStatus = "pending" | "submitted" | "locked" | "revoked"

export interface GuestPrepResponse {
  preferred_name: string
  pronunciation_notes: string | null
  phone_whatsapp: string
  social_accounts: {
    instagram?: string
    twitter?: string
    linkedin?: string
    youtube?: string
    tiktok?: string
    website?: string
  }
  preferred_drink: string
  preferred_filming_days: string[]
  preferred_filming_time: string
  scheduling_restrictions: string | null
  arrival_confirmation: boolean
  clothing_acknowledgment: boolean
  location_confirmation: boolean
  technical_needs: string | null
  topics_excited_about: string
  sensitivities_to_avoid: string | null
  team_notes: string | null
}

export interface GuestPrepForm {
  id: string
  application_id: string
  guest_name: string
  guest_email: string
  token_hash: string
  status: GuestPrepFormStatus
  expires_at: string | null
  response: GuestPrepResponse | null
  submitted_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

// ============================================================
// Guest Candidates module (independent — see lib/db/schema/guest-candidates.ts)
// ============================================================

export type GuestCandidateStatus =
  | "new"
  | "researching"
  | "analyzed"
  | "shortlisted"
  | "contacted"
  | "waiting_response"
  | "accepted"
  | "declined"
  | "prep_sent"
  | "prep_in_progress"
  | "prep_completed"
  | "archived"
  | "rejected"

export type GuestCandidatePriority = "low" | "medium" | "high"

export type GuestCandidateSourceType =
  | "manual"
  | "ai_search"
  | "referral"
  | "social_discovery"
  | "other"

export type SocialPlatform =
  | "instagram"
  | "x"
  | "youtube"
  | "linkedin"
  | "website"
  | "tiktok"
  | "other"

export type OutreachChannel = "whatsapp" | "email" | "dm"

export type OutreachTone = "formal" | "warm" | "concise" | "premium"

export type PrepFormLinkStatus =
  | "draft"
  | "sent"
  | "opened"
  | "in_progress"
  | "completed"
  | "expired"
  | "cancelled"

export interface GuestCandidate {
  id: string
  full_name: string
  display_name: string | null
  slug: string | null
  primary_language: string | null
  category: string | null
  city: string | null
  country: string | null
  bio: string | null
  notes_internal: string | null
  status: GuestCandidateStatus
  source_type: GuestCandidateSourceType | null
  source_note: string | null
  priority_level: GuestCandidatePriority | null
  ai_score_overall: number | null
  ai_fit_score: number | null
  ai_depth_score: number | null
  ai_reach_score: number | null
  ai_risk_score: number | null
  ai_summary: string | null
  ai_strengths: string[] | null
  ai_weaknesses: string[] | null
  ai_risk_notes: string | null
  ai_topics_json: string[] | null
  ai_reason_to_invite: string | null
  ai_conversation_angles_json: string[] | null
  ai_suggested_questions_json: {
    opening?: string[]
    deep?: string[]
    hard?: string[]
    emotional?: string[]
  } | null
  ai_model_used: string | null
  ai_generated_at: string | null
  last_contacted_at: string | null
  prep_link_last_sent_at: string | null
  archived_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface GuestCandidateSocialLink {
  id: string
  candidate_id: string
  platform: SocialPlatform
  url: string
  label: string | null
  is_primary: boolean | null
  confidence_score: number | null
  source: "manual" | "ai_suggested" | null
  verified_by_admin: boolean | null
  created_at: string
  updated_at: string
}

export interface GuestCandidateStatusHistoryEntry {
  id: string
  candidate_id: string
  old_status: GuestCandidateStatus | null
  new_status: GuestCandidateStatus
  changed_by: string | null
  change_note: string | null
  created_at: string
}

export interface GuestCandidateAiRun {
  id: string
  candidate_id: string
  run_type: "discovery" | "profile_analysis" | "outreach_generation" | "prep_analysis"
  model_name: string
  input_snapshot_json: Record<string, unknown> | null
  output_snapshot_json: Record<string, unknown> | null
  started_at: string
  completed_at: string | null
  status: "running" | "ready" | "error"
  error_message: string | null
}

export interface GuestCandidateOutreachMessage {
  id: string
  candidate_id: string
  channel_type: OutreachChannel
  tone: OutreachTone
  subject_line: string | null
  message_body: string
  generated_by_ai: boolean | null
  edited_by_admin: boolean | null
  version_number: number
  created_at: string
  updated_at: string
}

export interface PrepFormFieldDef {
  id: string
  type:
    | "short_text"
    | "long_text"
    | "single_select"
    | "multi_select"
    | "yes_no"
    | "date"
    | "location"
    | "contact_preference"
    | "instructions"
  label: string
  description?: string
  required?: boolean
  options?: string[]
  placeholder?: string
}

export interface PrepFormSectionDef {
  id: string
  title: string
  description?: string
  fields: PrepFormFieldDef[]
}

export interface PrepFormSchema {
  sections: PrepFormSectionDef[]
}

export interface PrepFormTemplate {
  id: string
  name: string
  description: string | null
  is_default: boolean | null
  is_active: boolean | null
  schema_json: PrepFormSchema
  created_at: string
  updated_at: string
}

export interface PrepFormLink {
  id: string
  candidate_id: string
  template_id: string
  token: string
  status: PrepFormLinkStatus
  expires_at: string | null
  first_opened_at: string | null
  last_opened_at: string | null
  submitted_at: string | null
  sent_via: string | null
  location_note: string | null
  meeting_note: string | null
  admin_message: string | null
  created_at: string
  updated_at: string
}

export interface PrepFormResponse {
  id: string
  prep_link_id: string
  candidate_id: string
  response_json: Record<string, unknown>
  completion_percent: number | null
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export interface PrepFormResponseAnalysis {
  id: string
  response_id: string
  candidate_id: string
  ai_personality_summary: string | null
  ai_talking_points_json: string[] | null
  ai_sensitive_topics_json: string[] | null
  ai_preferred_angles_json: string[] | null
  ai_followup_questions_json: string[] | null
  ai_red_flags_json: string[] | null
  ai_practical_notes: string | null
  ai_opening_line: string | null
  ai_recommended_style: string | null
  model_name: string | null
  generated_at: string
}

export interface GuestCandidateNotification {
  id: string
  candidate_id: string
  prep_link_id: string | null
  notification_type:
    | "prep_submitted"
    | "prep_opened"
    | "reminder_sent"
    | "outreach_generated"
    | "status_changed"
  delivery_channel: "email" | "in_app"
  recipient: string | null
  payload_json: Record<string, unknown> | null
  delivered_at: string | null
  delivery_error: string | null
  created_at: string
}

// View types — candidate enriched with related data for list/detail rendering
export interface GuestCandidateView extends GuestCandidate {
  social_links: GuestCandidateSocialLink[]
  prep_links_count: number
  responses_count: number
  outreach_count: number
  has_completed_prep: boolean
}
