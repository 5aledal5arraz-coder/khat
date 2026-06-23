// ---------------------------------------------------------------------------
// AI Module — Barrel re-export
// ---------------------------------------------------------------------------

// Client & utilities
export { getClient, STUDIO_PROMPT_VERSION, ANALYZER_PROMPT_VERSION, STRUCTURE_MODEL, EDITORIAL_MODEL, prepareTranscript, prepareTranscriptWithPositions, formatSecondsToTimestamp, parseTimestampToSeconds, safeParseJSON } from "./client"

// Global Episode Intelligence — full-episode understanding layer
export { generateGlobalEpisodeIntelligence, formatIntelligenceContext } from "./episode-intelligence"
export type { GlobalEpisodeIntelligence } from "./episode-intelligence"

// Studio (YouTube package, chapters, clips)
export { generateStudioPackage, generateStudioChapters, generateStudioClips } from "./studio"
export type { StudioPackageResult, StudioChaptersResult, StudioClipsResult } from "./studio"

// Website package
export { generateWebsitePackage } from "./website"
export type { WebsitePackageResult } from "./website"

// Transcript processing
export { processTranscript, regenerateQuotes, regenerateKeyIdeas, regenerateLessons, generateQuotesFromTranscript } from "./transcript"
export type { TranscriptProcessingResult } from "./transcript"

// Guest detection
export { generateGuestFromTranscript, detectGuestsForEpisodes } from "./guest"
export type { GuestAIResult, GuestDetectionInput, GuestDetectionResult } from "./guest"

// Studio analysis (performance analyzer, intro, edit suggestions)
export { generateStudioAnalysis, suggestBestIntro, generateEditSuggestions } from "./analysis"
export type { YouTubeVideoStats, BestIntroResult, EditSuggestionsResult } from "./analysis"

// Content generation (newsletter)
export { generateNewsletterContent } from "./content"

// YouTube pack
export { generateYoutubePackFromTranscript, generateYoutubePackSectionFromTranscript } from "./youtube-pack"

// Deep analysis (content intelligence)
export { generateDeepAnalysis } from "./deep-analysis"

// Guest intelligence (guest detection and profiling)
export { generateGuestIntelligence } from "./guest-intelligence"

// Sponsorship AI (lead analysis + proposal generation)
export { analyzeSponsorshipLead, generateSponsorshipProposal } from "./sponsorship"

// Guest Application AI (analysis + concept + response drafts)
export { analyzeGuestApplication, generateGuestConcept, generateGuestResponseDrafts } from "./guest-application"

// Growth package (copy-ready YouTube growth deliverable — Goal 1)
export { generateGrowthPackage, emptyGrowthPackage } from "./growth"
export type { GrowthPackage, GrowthGenInput, GrowthChapter } from "./growth"
