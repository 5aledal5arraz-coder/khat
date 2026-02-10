import { createClient } from "@/lib/supabase/server"
import fs from "fs/promises"
import path from "path"
import { deleteEpisodeEnrichment } from "@/lib/episode-enrichments"
import { deleteEpisodeOverride } from "@/lib/episode-overrides"
import { deleteEpisodeQuotesEntry } from "@/lib/episode-quotes"
import type {
  StudioSession, StudioTranscript, StudioTranscriptSource,
  StudioAiOutput, StudioAiOutputStatus,
  StudioChapters, StudioChaptersStatus, StudioChapterItem,
  StudioClips, StudioClipsStatus, StudioClipItem,
  StudioWebsitePackage, StudioWebsitePackageStatus,
  WebsiteQuoteItem, WebsiteResourceItem, WebsiteTimestampItem,
  StudioAnalyzer, StudioAnalyzerStatus, StudioAnalyzerData,
} from "@/types/database"

const AUDIO_DIR = path.join(process.cwd(), "data", "studio-audio")

const USE_MOCK_DATA =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("placeholder") ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL

// In-memory stores for mock mode
let mockSessions: StudioSession[] = []
let mockTranscripts: StudioTranscript[] = []
let mockAiOutputs: StudioAiOutput[] = []
let mockChapters: StudioChapters[] = []
let mockClips: StudioClips[] = []
let mockWebsitePackages: StudioWebsitePackage[] = []
let mockAnalyzers: StudioAnalyzer[] = []

export async function getStudioSessions(): Promise<StudioSession[]> {
  if (USE_MOCK_DATA) {
    return [...mockSessions].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_sessions")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching studio sessions:", error)
    return []
  }

  return data as StudioSession[]
}

export async function getStudioSession(id: string): Promise<StudioSession | null> {
  if (USE_MOCK_DATA) {
    return mockSessions.find((s) => s.id === id) || null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_sessions")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return null
  return data as StudioSession
}

export async function createStudioSession(
  session: Omit<StudioSession, "id" | "created_at" | "updated_at">
): Promise<{ success: boolean; data?: StudioSession; error?: string }> {
  if (USE_MOCK_DATA) {
    const now = new Date().toISOString()
    const newSession: StudioSession = {
      ...session,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    }
    mockSessions.push(newSession)
    return { success: true, data: newSession }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_sessions")
    .insert(session)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as StudioSession }
}

export async function updateStudioSession(
  id: string,
  updates: Partial<StudioSession>
): Promise<{ success: boolean; data?: StudioSession; error?: string }> {
  if (USE_MOCK_DATA) {
    const idx = mockSessions.findIndex((s) => s.id === id)
    if (idx === -1) return { success: false, error: "Session not found" }
    mockSessions[idx] = {
      ...mockSessions[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    }
    return { success: true, data: mockSessions[idx] }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_sessions")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as StudioSession }
}

export async function deleteStudioSession(id: string): Promise<boolean> {
  // Clean up pushed episode data if this session was linked to an episode
  const pkg = await getWebsitePackageForSession(id)
  if (pkg?.linked_episode_id) {
    try {
      await deleteEpisodeEnrichment(pkg.linked_episode_id)
      await deleteEpisodeOverride(pkg.linked_episode_id)
      await deleteEpisodeQuotesEntry(pkg.linked_episode_id)
    } catch {
      // ignore — config files may not exist
    }
  }

  // Clean up audio files if they exist
  const audioDir = path.join(AUDIO_DIR, id)
  try {
    await fs.rm(audioDir, { recursive: true, force: true })
  } catch {
    // ignore — directory may not exist for YouTube sessions
  }

  if (USE_MOCK_DATA) {
    const before = mockSessions.length
    mockSessions = mockSessions.filter((s) => s.id !== id)
    mockTranscripts = mockTranscripts.filter((t) => t.session_id !== id)
    mockAiOutputs = mockAiOutputs.filter((o) => o.session_id !== id)
    mockChapters = mockChapters.filter((c) => c.session_id !== id)
    mockClips = mockClips.filter((c) => c.session_id !== id)
    mockWebsitePackages = mockWebsitePackages.filter((w) => w.session_id !== id)
    mockAnalyzers = mockAnalyzers.filter((a) => a.session_id !== id)
    return mockSessions.length < before
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("studio_sessions")
    .delete()
    .eq("id", id)

  return !error
}

// ---------------------------------------------------------------------------
// Studio Transcripts
// ---------------------------------------------------------------------------

export async function getTranscriptForSession(sessionId: string): Promise<StudioTranscript | null> {
  if (USE_MOCK_DATA) {
    return mockTranscripts.find((t) => t.session_id === sessionId) || null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_transcripts")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("Error fetching transcript:", error)
    return null
  }

  return data as StudioTranscript | null
}

export async function createTranscript(
  sessionId: string,
  source: StudioTranscriptSource,
  rawText: string,
  language: string = "ar"
): Promise<{ success: boolean; data?: StudioTranscript; error?: string }> {
  const cleanText = cleanTranscriptText(rawText)
  const wordCount = countWords(cleanText)
  const charCount = cleanText.length

  const entry: Omit<StudioTranscript, "id" | "created_at" | "updated_at"> = {
    session_id: sessionId,
    source,
    language,
    transcript_raw: rawText,
    transcript_clean: cleanText,
    word_count: wordCount,
    char_count: charCount,
    status: "ready",
    error_message: null,
  }

  if (USE_MOCK_DATA) {
    const now = new Date().toISOString()
    // Replace any existing transcript for this session
    mockTranscripts = mockTranscripts.filter((t) => t.session_id !== sessionId)
    const newTranscript: StudioTranscript = {
      ...entry,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    }
    mockTranscripts.push(newTranscript)
    return { success: true, data: newTranscript }
  }

  const supabase = await createClient()

  // Delete any existing transcript for this session first
  await supabase
    .from("studio_transcripts")
    .delete()
    .eq("session_id", sessionId)

  const { data, error } = await supabase
    .from("studio_transcripts")
    .insert(entry)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as StudioTranscript }
}

export async function createTranscriptError(
  sessionId: string,
  errorMessage: string
): Promise<void> {
  const entry = {
    session_id: sessionId,
    source: "youtube_captions" as StudioTranscriptSource,
    language: "ar",
    transcript_raw: "",
    transcript_clean: "",
    word_count: 0,
    char_count: 0,
    status: "error" as const,
    error_message: errorMessage,
  }

  if (USE_MOCK_DATA) {
    const now = new Date().toISOString()
    mockTranscripts = mockTranscripts.filter((t) => t.session_id !== sessionId)
    mockTranscripts.push({
      ...entry,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    })
    return
  }

  const supabase = await createClient()
  await supabase
    .from("studio_transcripts")
    .delete()
    .eq("session_id", sessionId)

  await supabase.from("studio_transcripts").insert(entry)
}

// ---------------------------------------------------------------------------
// Studio AI Outputs
// ---------------------------------------------------------------------------

export async function getAiOutputForSession(sessionId: string): Promise<StudioAiOutput | null> {
  if (USE_MOCK_DATA) {
    return mockAiOutputs.find((o) => o.session_id === sessionId) || null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_ai_outputs")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("Error fetching AI output:", error)
    return null
  }

  return data as StudioAiOutput | null
}

export async function createAiOutput(
  sessionId: string,
  output: {
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
  }
): Promise<{ success: boolean; data?: StudioAiOutput; error?: string }> {
  const entry = {
    session_id: sessionId,
    ...output,
  }

  if (USE_MOCK_DATA) {
    const now = new Date().toISOString()
    // Replace any existing output for this session
    mockAiOutputs = mockAiOutputs.filter((o) => o.session_id !== sessionId)
    const newOutput: StudioAiOutput = {
      ...entry,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    }
    mockAiOutputs.push(newOutput)
    return { success: true, data: newOutput }
  }

  const supabase = await createClient()

  // Delete any existing output for this session first
  await supabase
    .from("studio_ai_outputs")
    .delete()
    .eq("session_id", sessionId)

  const { data, error } = await supabase
    .from("studio_ai_outputs")
    .insert(entry)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as StudioAiOutput }
}

export async function updateAiOutput(
  id: string,
  updates: Partial<Pick<StudioAiOutput, "title_best" | "title_alternatives" | "thumbnail_text_options" | "youtube_description" | "seo_keywords" | "hashtags">>
): Promise<{ success: boolean; data?: StudioAiOutput; error?: string }> {
  if (USE_MOCK_DATA) {
    const idx = mockAiOutputs.findIndex((o) => o.id === id)
    if (idx === -1) return { success: false, error: "Output not found" }
    mockAiOutputs[idx] = {
      ...mockAiOutputs[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    }
    return { success: true, data: mockAiOutputs[idx] }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_ai_outputs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as StudioAiOutput }
}

// ---------------------------------------------------------------------------
// Studio Chapters
// ---------------------------------------------------------------------------

export async function getChaptersForSession(sessionId: string): Promise<StudioChapters | null> {
  if (USE_MOCK_DATA) {
    return mockChapters.find((c) => c.session_id === sessionId) || null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_chapters")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("Error fetching chapters:", error)
    return null
  }

  return data as StudioChapters | null
}

export async function createChapters(
  sessionId: string,
  entry: {
    status: StudioChaptersStatus
    chapters: StudioChapterItem[]
    raw_openai_response: Record<string, unknown> | null
    error_message: string | null
  }
): Promise<{ success: boolean; data?: StudioChapters; error?: string }> {
  const row = { session_id: sessionId, ...entry }

  if (USE_MOCK_DATA) {
    const now = new Date().toISOString()
    mockChapters = mockChapters.filter((c) => c.session_id !== sessionId)
    const newRow: StudioChapters = { ...row, id: crypto.randomUUID(), created_at: now, updated_at: now }
    mockChapters.push(newRow)
    return { success: true, data: newRow }
  }

  const supabase = await createClient()
  await supabase.from("studio_chapters").delete().eq("session_id", sessionId)
  const { data, error } = await supabase.from("studio_chapters").insert(row).select().single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: data as StudioChapters }
}

export async function updateChapters(
  id: string,
  updates: { chapters?: StudioChapterItem[] }
): Promise<{ success: boolean; data?: StudioChapters; error?: string }> {
  if (USE_MOCK_DATA) {
    const idx = mockChapters.findIndex((c) => c.id === id)
    if (idx === -1) return { success: false, error: "Not found" }
    mockChapters[idx] = { ...mockChapters[idx], ...updates, updated_at: new Date().toISOString() }
    return { success: true, data: mockChapters[idx] }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_chapters")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: data as StudioChapters }
}

// ---------------------------------------------------------------------------
// Studio Clips
// ---------------------------------------------------------------------------

export async function getClipsForSession(sessionId: string): Promise<StudioClips | null> {
  if (USE_MOCK_DATA) {
    return mockClips.find((c) => c.session_id === sessionId) || null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_clips")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("Error fetching clips:", error)
    return null
  }

  return data as StudioClips | null
}

export async function createClips(
  sessionId: string,
  entry: {
    status: StudioClipsStatus
    clips: StudioClipItem[]
    raw_openai_response: Record<string, unknown> | null
    error_message: string | null
  }
): Promise<{ success: boolean; data?: StudioClips; error?: string }> {
  const row = { session_id: sessionId, ...entry }

  if (USE_MOCK_DATA) {
    const now = new Date().toISOString()
    mockClips = mockClips.filter((c) => c.session_id !== sessionId)
    const newRow: StudioClips = { ...row, id: crypto.randomUUID(), created_at: now, updated_at: now }
    mockClips.push(newRow)
    return { success: true, data: newRow }
  }

  const supabase = await createClient()
  await supabase.from("studio_clips").delete().eq("session_id", sessionId)
  const { data, error } = await supabase.from("studio_clips").insert(row).select().single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: data as StudioClips }
}

export async function updateClips(
  id: string,
  updates: { clips?: StudioClipItem[] }
): Promise<{ success: boolean; data?: StudioClips; error?: string }> {
  if (USE_MOCK_DATA) {
    const idx = mockClips.findIndex((c) => c.id === id)
    if (idx === -1) return { success: false, error: "Not found" }
    mockClips[idx] = { ...mockClips[idx], ...updates, updated_at: new Date().toISOString() }
    return { success: true, data: mockClips[idx] }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_clips")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: data as StudioClips }
}

// ---------------------------------------------------------------------------
// Studio Website Packages
// ---------------------------------------------------------------------------

export async function getWebsitePackageForSession(sessionId: string): Promise<StudioWebsitePackage | null> {
  if (USE_MOCK_DATA) {
    return mockWebsitePackages.find((w) => w.session_id === sessionId) || null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_website_packages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("Error fetching website package:", error)
    return null
  }

  return data as StudioWebsitePackage | null
}

export async function createWebsitePackage(
  sessionId: string,
  entry: {
    status: StudioWebsitePackageStatus
    hero_summary: string | null
    full_summary: string | null
    takeaways: string[]
    quotes: WebsiteQuoteItem[]
    topics: string[]
    resources: WebsiteResourceItem[]
    timestamps: WebsiteTimestampItem[]
    linked_episode_id: string | null
    raw_openai_response: Record<string, unknown> | null
    error_message: string | null
  }
): Promise<{ success: boolean; data?: StudioWebsitePackage; error?: string }> {
  const row = { session_id: sessionId, ...entry }

  if (USE_MOCK_DATA) {
    const now = new Date().toISOString()
    mockWebsitePackages = mockWebsitePackages.filter((w) => w.session_id !== sessionId)
    const newRow: StudioWebsitePackage = { ...row, id: crypto.randomUUID(), created_at: now, updated_at: now }
    mockWebsitePackages.push(newRow)
    return { success: true, data: newRow }
  }

  const supabase = await createClient()
  await supabase.from("studio_website_packages").delete().eq("session_id", sessionId)
  const { data, error } = await supabase.from("studio_website_packages").insert(row).select().single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: data as StudioWebsitePackage }
}

export async function updateWebsitePackage(
  id: string,
  updates: Partial<Pick<StudioWebsitePackage, "hero_summary" | "full_summary" | "takeaways" | "quotes" | "topics" | "resources" | "timestamps" | "linked_episode_id">>
): Promise<{ success: boolean; data?: StudioWebsitePackage; error?: string }> {
  if (USE_MOCK_DATA) {
    const idx = mockWebsitePackages.findIndex((w) => w.id === id)
    if (idx === -1) return { success: false, error: "Not found" }
    mockWebsitePackages[idx] = { ...mockWebsitePackages[idx], ...updates, updated_at: new Date().toISOString() }
    return { success: true, data: mockWebsitePackages[idx] }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_website_packages")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: data as StudioWebsitePackage }
}

// ---------------------------------------------------------------------------
// Studio Analyzers
// ---------------------------------------------------------------------------

export async function getAnalyzerForSession(sessionId: string): Promise<StudioAnalyzer | null> {
  if (USE_MOCK_DATA) {
    return mockAnalyzers.find((a) => a.session_id === sessionId) || null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("studio_analyzers")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("Error fetching analyzer:", error)
    return null
  }

  return data as StudioAnalyzer | null
}

export async function createAnalyzer(
  sessionId: string,
  entry: {
    status: StudioAnalyzerStatus
    data: StudioAnalyzerData | null
    prompt_version: string
    raw_openai_response: Record<string, unknown> | null
    error_message: string | null
  }
): Promise<{ success: boolean; data?: StudioAnalyzer; error?: string }> {
  const row = { session_id: sessionId, ...entry }

  if (USE_MOCK_DATA) {
    const now = new Date().toISOString()
    mockAnalyzers = mockAnalyzers.filter((a) => a.session_id !== sessionId)
    const newRow: StudioAnalyzer = { ...row, id: crypto.randomUUID(), created_at: now, updated_at: now }
    mockAnalyzers.push(newRow)
    return { success: true, data: newRow }
  }

  const supabase = await createClient()
  await supabase.from("studio_analyzers").delete().eq("session_id", sessionId)
  const { data, error } = await supabase.from("studio_analyzers").insert(row).select().single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: data as StudioAnalyzer }
}

// ---------------------------------------------------------------------------
// Transcript cleaning pipeline
// ---------------------------------------------------------------------------

/**
 * Clean a raw transcript string: strip SRT/VTT formatting, normalize whitespace,
 * remove duplicate lines, but preserve Arabic text intact.
 */
export function cleanTranscriptText(raw: string): string {
  let text = raw

  // Strip VTT header + metadata
  text = text.replace(/^WEBVTT[\s\S]*?\n\n/i, "")
  text = text.replace(/^Kind:.*\n/gm, "")
  text = text.replace(/^Language:.*\n/gm, "")
  text = text.replace(/^NOTE[\s\S]*?\n\n/gm, "")

  // Strip SRT sequence numbers (standalone digits on their own line)
  text = text.replace(/^\d+\s*$/gm, "")

  // Strip SRT/VTT timestamps (e.g., 00:01:23,456 --> 00:01:26,789)
  text = text.replace(/\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]\d{3}.*/g, "")
  // Also short-form timestamps (01:23.456 --> 01:26.789)
  text = text.replace(/\d{1,2}:\d{2}\.\d{3}\s*-->\s*\d{1,2}:\d{2}\.\d{3}.*/g, "")

  // Strip VTT inline tags like <c>, </c>, <00:01:23.456>, etc.
  text = text.replace(/<[^>]+>/g, "")

  // Strip noise markers like [music], [applause], (موسيقى), etc.
  text = text.replace(/\[.*?\]/g, "")
  text = text.replace(/\(.*?\)/g, "")

  // Normalize line breaks into spaces
  text = text.replace(/\r\n/g, "\n")
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)

  // Deduplicate consecutive identical lines
  const deduped: string[] = []
  for (const line of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
      deduped.push(line)
    }
  }

  // Join and normalize whitespace
  return deduped.join(" ").replace(/\s+/g, " ").trim()
}

function countWords(text: string): number {
  if (!text) return 0
  // Split on whitespace; works for Arabic + Latin
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Parse uploaded file content (SRT, VTT, or plain TXT) into raw text.
 */
export function parseUploadedTranscript(content: string, filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() || ""

  if (ext === "srt" || ext === "vtt") {
    // For SRT/VTT, return as-is — cleaning pipeline handles the stripping
    return content
  }

  // For .txt or unknown, return as-is
  return content
}
