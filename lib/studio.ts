import { db, USE_DB } from "@/lib/db"
import { eq, desc, sql } from 'drizzle-orm'
import { studioSessions, studioTranscripts, studioAiOutputs, studioChapters, studioClips, studioWebsitePackages, studioAnalyzers } from '@/lib/db/schema'
import fs from "fs/promises"
import path from "path"
import { deleteEpisodeEnrichment } from "@/lib/episode-enrichments"
import { deleteEpisodeOverride } from "@/lib/episode-overrides"
import { deleteEpisodeQuotesEntry } from "@/lib/episode-quotes"
import type {
  StudioSession, StudioTranscript, StudioTranscriptSource,
  StudioTranscriptProcessingStatus, StudioTranscriptSummary, StudioTranscriptQuote,
  StudioAiOutput, StudioAiOutputStatus,
  StudioChapters, StudioChaptersStatus, StudioChapterItem,
  StudioClips, StudioClipsStatus, StudioClipItem,
  StudioWebsitePackage, StudioWebsitePackageStatus,
  WebsiteQuoteItem, WebsiteResourceItem, WebsiteTimestampItem,
  StudioAnalyzer, StudioAnalyzerStatus, StudioAnalyzerData,
} from "@/types/database"

const AUDIO_DIR = path.join(process.cwd(), "data", "studio-audio")
const MOCK_DIR = path.join(process.cwd(), "data", "studio-mock")

const USE_MOCK_DATA = !USE_DB

// File-based mock stores (persists across Turbopack route bundles)
interface MockStore {
  sessions: StudioSession[]
  transcripts: StudioTranscript[]
  aiOutputs: StudioAiOutput[]
  chapters: StudioChapters[]
  clips: StudioClips[]
  websitePackages: StudioWebsitePackage[]
  analyzers: StudioAnalyzer[]
}

const MOCK_DEFAULTS: MockStore = {
  sessions: [],
  transcripts: [],
  aiOutputs: [],
  chapters: [],
  clips: [],
  websitePackages: [],
  analyzers: [],
}

async function readMock(): Promise<MockStore> {
  try {
    const data = await fs.readFile(path.join(MOCK_DIR, "store.json"), "utf-8")
    return JSON.parse(data) as MockStore
  } catch {
    return { ...MOCK_DEFAULTS }
  }
}

async function writeMock(store: MockStore): Promise<void> {
  await fs.mkdir(MOCK_DIR, { recursive: true })
  await fs.writeFile(path.join(MOCK_DIR, "store.json"), JSON.stringify(store, null, 2), "utf-8")
}

export async function getStudioSessions(): Promise<StudioSession[]> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    return [...store.sessions].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  try {
    const rows = await db!.select().from(studioSessions).orderBy(desc(studioSessions.created_at))
    return rows as unknown as StudioSession[]
  } catch (err) {
    console.error("Error fetching studio sessions:", err)
    return []
  }
}

export async function getStudioSession(id: string): Promise<StudioSession | null> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    return store.sessions.find((s) => s.id === id) || null
  }

  try {
    const rows = await db!.select().from(studioSessions).where(eq(studioSessions.id, id))
    return (rows[0] as unknown as StudioSession) || null
  } catch {
    return null
  }
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
    const store = await readMock()
    store.sessions.push(newSession)
    await writeMock(store)
    return { success: true, data: newSession }
  }

  try {
    const { episode_id, episode_title, youtube_url, source_type, notes } = session as Record<string, unknown>
    const rows = await db!.insert(studioSessions).values({
      episode_id: episode_id as string,
      episode_title: episode_title as string,
      youtube_url: youtube_url as string,
      source_type: source_type as string,
      notes: notes as string,
    }).returning()
    return { success: true, data: rows[0] as unknown as StudioSession }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function updateStudioSession(
  id: string,
  updates: Partial<StudioSession>
): Promise<{ success: boolean; data?: StudioSession; error?: string }> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    const idx = store.sessions.findIndex((s) => s.id === id)
    if (idx === -1) return { success: false, error: "Session not found" }
    store.sessions[idx] = {
      ...store.sessions[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    }
    await writeMock(store)
    return { success: true, data: store.sessions[idx] }
  }

  try {
    const setObj: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      setObj[key] = value
    }
    setObj.updated_at = new Date()

    const rows = await db!.update(studioSessions).set(setObj).where(eq(studioSessions.id, id)).returning()
    if (!rows[0]) return { success: false, error: "Session not found" }
    return { success: true, data: rows[0] as unknown as StudioSession }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
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
    const store = await readMock()
    const before = store.sessions.length
    store.sessions = store.sessions.filter((s) => s.id !== id)
    store.transcripts = store.transcripts.filter((t) => t.session_id !== id)
    store.aiOutputs = store.aiOutputs.filter((o) => o.session_id !== id)
    store.chapters = store.chapters.filter((c) => c.session_id !== id)
    store.clips = store.clips.filter((c) => c.session_id !== id)
    store.websitePackages = store.websitePackages.filter((w) => w.session_id !== id)
    store.analyzers = store.analyzers.filter((a) => a.session_id !== id)
    await writeMock(store)
    return store.sessions.length < before
  }

  try {
    const result = await db!.delete(studioSessions).where(eq(studioSessions.id, id))
    return (result.rowCount ?? 0) > 0
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Studio Transcripts
// ---------------------------------------------------------------------------

export async function getTranscriptForSession(sessionId: string): Promise<StudioTranscript | null> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    return store.transcripts.find((t) => t.session_id === sessionId) || null
  }

  try {
    const rows = await db!.select().from(studioTranscripts)
      .where(eq(studioTranscripts.session_id, sessionId))
      .orderBy(desc(studioTranscripts.created_at))
      .limit(1)
    return (rows[0] as unknown as StudioTranscript) || null
  } catch (err) {
    console.error("Error fetching transcript:", err)
    return null
  }
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
    transcript_article: null,
    summary: null,
    quotes_extracted: null,
    processing_status: "idle",
  }

  if (USE_MOCK_DATA) {
    const now = new Date().toISOString()
    const store = await readMock()
    // Replace any existing transcript for this session
    store.transcripts = store.transcripts.filter((t) => t.session_id !== sessionId)
    const newTranscript: StudioTranscript = {
      ...entry,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    }
    store.transcripts.push(newTranscript)
    await writeMock(store)
    return { success: true, data: newTranscript }
  }

  try {
    // Delete any existing transcript for this session first
    await db!.delete(studioTranscripts).where(eq(studioTranscripts.session_id, sessionId))

    const rows = await db!.insert(studioTranscripts).values({
      session_id: entry.session_id,
      source: entry.source,
      language: entry.language,
      transcript_raw: entry.transcript_raw,
      transcript_clean: entry.transcript_clean,
      word_count: entry.word_count,
      char_count: entry.char_count,
      status: entry.status,
      error_message: entry.error_message,
      transcript_article: entry.transcript_article,
      summary: entry.summary,
      quotes_extracted: entry.quotes_extracted,
      processing_status: entry.processing_status,
    }).returning()
    return { success: true, data: rows[0] as unknown as StudioTranscript }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
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
    transcript_article: null as string | null,
    summary: null as StudioTranscriptSummary | null,
    quotes_extracted: null as StudioTranscriptQuote[] | null,
    processing_status: "idle" as StudioTranscriptProcessingStatus,
  }

  if (USE_MOCK_DATA) {
    const now = new Date().toISOString()
    const store = await readMock()
    store.transcripts = store.transcripts.filter((t) => t.session_id !== sessionId)
    store.transcripts.push({
      ...entry,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    })
    await writeMock(store)
    return
  }

  await db!.delete(studioTranscripts).where(eq(studioTranscripts.session_id, sessionId))

  await db!.insert(studioTranscripts).values({
    session_id: entry.session_id,
    source: entry.source,
    language: entry.language,
    transcript_raw: entry.transcript_raw,
    transcript_clean: entry.transcript_clean,
    word_count: entry.word_count,
    char_count: entry.char_count,
    status: entry.status,
    error_message: entry.error_message,
    transcript_article: entry.transcript_article,
    summary: entry.summary,
    quotes_extracted: entry.quotes_extracted,
    processing_status: entry.processing_status,
  })
}

// ---------------------------------------------------------------------------
// Studio Transcript Processing (AI article, summary, quotes)
// ---------------------------------------------------------------------------

export async function updateTranscriptProcessing(
  transcriptId: string,
  updates: {
    transcript_article?: string | null
    summary?: StudioTranscriptSummary | null
    quotes_extracted?: StudioTranscriptQuote[] | null
    processing_status?: StudioTranscriptProcessingStatus
  }
): Promise<{ success: boolean; data?: StudioTranscript; error?: string }> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    const idx = store.transcripts.findIndex((t) => t.id === transcriptId)
    if (idx === -1) return { success: false, error: "Transcript not found" }
    store.transcripts[idx] = {
      ...store.transcripts[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    }
    await writeMock(store)
    return { success: true, data: store.transcripts[idx] }
  }

  try {
    const setObj: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      setObj[key] = value
    }
    setObj.updated_at = new Date()

    const rows = await db!.update(studioTranscripts).set(setObj).where(eq(studioTranscripts.id, transcriptId)).returning()
    if (!rows[0]) return { success: false, error: "Transcript not found" }
    return { success: true, data: rows[0] as unknown as StudioTranscript }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Studio AI Outputs
// ---------------------------------------------------------------------------

export async function getAiOutputForSession(sessionId: string): Promise<StudioAiOutput | null> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    return store.aiOutputs.find((o) => o.session_id === sessionId) || null
  }

  try {
    const rows = await db!.select().from(studioAiOutputs)
      .where(eq(studioAiOutputs.session_id, sessionId))
      .orderBy(desc(studioAiOutputs.created_at))
      .limit(1)
    return (rows[0] as unknown as StudioAiOutput) || null
  } catch (err) {
    console.error("Error fetching AI output:", err)
    return null
  }
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
    const store = await readMock()
    // Replace any existing output for this session
    store.aiOutputs = store.aiOutputs.filter((o) => o.session_id !== sessionId)
    const newOutput: StudioAiOutput = {
      ...entry,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    }
    store.aiOutputs.push(newOutput)
    await writeMock(store)
    return { success: true, data: newOutput }
  }

  try {
    // Delete any existing output for this session first
    await db!.delete(studioAiOutputs).where(eq(studioAiOutputs.session_id, sessionId))

    const rows = await db!.insert(studioAiOutputs).values({
      session_id: entry.session_id,
      model: entry.model,
      prompt_version: entry.prompt_version,
      status: entry.status,
      title_best: entry.title_best,
      title_alternatives: entry.title_alternatives,
      thumbnail_text_options: entry.thumbnail_text_options,
      youtube_description: entry.youtube_description,
      seo_keywords: entry.seo_keywords,
      hashtags: entry.hashtags,
      raw_openai_response: entry.raw_openai_response,
      error_message: entry.error_message,
    }).returning()
    return { success: true, data: rows[0] as unknown as StudioAiOutput }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function updateAiOutput(
  id: string,
  updates: Partial<Pick<StudioAiOutput, "title_best" | "title_alternatives" | "thumbnail_text_options" | "youtube_description" | "seo_keywords" | "hashtags">>
): Promise<{ success: boolean; data?: StudioAiOutput; error?: string }> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    const idx = store.aiOutputs.findIndex((o) => o.id === id)
    if (idx === -1) return { success: false, error: "Output not found" }
    store.aiOutputs[idx] = {
      ...store.aiOutputs[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    }
    await writeMock(store)
    return { success: true, data: store.aiOutputs[idx] }
  }

  try {
    const setObj: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      setObj[key] = value
    }
    setObj.updated_at = new Date()

    const rows = await db!.update(studioAiOutputs).set(setObj).where(eq(studioAiOutputs.id, id)).returning()
    if (!rows[0]) return { success: false, error: "Output not found" }
    return { success: true, data: rows[0] as unknown as StudioAiOutput }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Studio Chapters
// ---------------------------------------------------------------------------

export async function getChaptersForSession(sessionId: string): Promise<StudioChapters | null> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    return store.chapters.find((c) => c.session_id === sessionId) || null
  }

  try {
    const rows = await db!.select().from(studioChapters)
      .where(eq(studioChapters.session_id, sessionId))
      .orderBy(desc(studioChapters.created_at))
      .limit(1)
    return (rows[0] as unknown as StudioChapters) || null
  } catch (err) {
    console.error("Error fetching chapters:", err)
    return null
  }
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
    const store = await readMock()
    store.chapters = store.chapters.filter((c) => c.session_id !== sessionId)
    const newRow: StudioChapters = { ...row, id: crypto.randomUUID(), created_at: now, updated_at: now }
    store.chapters.push(newRow)
    await writeMock(store)
    return { success: true, data: newRow }
  }

  try {
    await db!.delete(studioChapters).where(eq(studioChapters.session_id, sessionId))
    const rows = await db!.insert(studioChapters).values({
      session_id: row.session_id,
      status: row.status,
      chapters: row.chapters,
      raw_openai_response: row.raw_openai_response,
      error_message: row.error_message,
    }).returning()
    return { success: true, data: rows[0] as unknown as StudioChapters }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function updateChapters(
  id: string,
  updates: { chapters?: StudioChapterItem[] }
): Promise<{ success: boolean; data?: StudioChapters; error?: string }> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    const idx = store.chapters.findIndex((c) => c.id === id)
    if (idx === -1) return { success: false, error: "Not found" }
    store.chapters[idx] = { ...store.chapters[idx], ...updates, updated_at: new Date().toISOString() }
    await writeMock(store)
    return { success: true, data: store.chapters[idx] }
  }

  try {
    const setObj: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      setObj[key] = value
    }
    setObj.updated_at = new Date()

    const rows = await db!.update(studioChapters).set(setObj).where(eq(studioChapters.id, id)).returning()
    if (!rows[0]) return { success: false, error: "Not found" }
    return { success: true, data: rows[0] as unknown as StudioChapters }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Studio Clips
// ---------------------------------------------------------------------------

export async function getClipsForSession(sessionId: string): Promise<StudioClips | null> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    return store.clips.find((c) => c.session_id === sessionId) || null
  }

  try {
    const rows = await db!.select().from(studioClips)
      .where(eq(studioClips.session_id, sessionId))
      .orderBy(desc(studioClips.created_at))
      .limit(1)
    return (rows[0] as unknown as StudioClips) || null
  } catch (err) {
    console.error("Error fetching clips:", err)
    return null
  }
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
    const store = await readMock()
    store.clips = store.clips.filter((c) => c.session_id !== sessionId)
    const newRow: StudioClips = { ...row, id: crypto.randomUUID(), created_at: now, updated_at: now }
    store.clips.push(newRow)
    await writeMock(store)
    return { success: true, data: newRow }
  }

  try {
    await db!.delete(studioClips).where(eq(studioClips.session_id, sessionId))
    const rows = await db!.insert(studioClips).values({
      session_id: row.session_id,
      status: row.status,
      clips: row.clips,
      raw_openai_response: row.raw_openai_response,
      error_message: row.error_message,
    }).returning()
    return { success: true, data: rows[0] as unknown as StudioClips }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function updateClips(
  id: string,
  updates: { clips?: StudioClipItem[] }
): Promise<{ success: boolean; data?: StudioClips; error?: string }> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    const idx = store.clips.findIndex((c) => c.id === id)
    if (idx === -1) return { success: false, error: "Not found" }
    store.clips[idx] = { ...store.clips[idx], ...updates, updated_at: new Date().toISOString() }
    await writeMock(store)
    return { success: true, data: store.clips[idx] }
  }

  try {
    const setObj: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      setObj[key] = value
    }
    setObj.updated_at = new Date()

    const rows = await db!.update(studioClips).set(setObj).where(eq(studioClips.id, id)).returning()
    if (!rows[0]) return { success: false, error: "Not found" }
    return { success: true, data: rows[0] as unknown as StudioClips }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Studio Website Packages
// ---------------------------------------------------------------------------

export async function getWebsitePackageForSession(sessionId: string): Promise<StudioWebsitePackage | null> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    return store.websitePackages.find((w) => w.session_id === sessionId) || null
  }

  try {
    const rows = await db!.select().from(studioWebsitePackages)
      .where(eq(studioWebsitePackages.session_id, sessionId))
      .orderBy(desc(studioWebsitePackages.created_at))
      .limit(1)
    return (rows[0] as unknown as StudioWebsitePackage) || null
  } catch (err) {
    console.error("Error fetching website package:", err)
    return null
  }
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
    custom_title?: string | null
    selected_quote_indices?: number[] | null
    selected_takeaway_indices?: number[] | null
    linked_episode_id: string | null
    raw_openai_response: Record<string, unknown> | null
    error_message: string | null
  }
): Promise<{ success: boolean; data?: StudioWebsitePackage; error?: string }> {
  const row = { session_id: sessionId, ...entry, custom_title: entry.custom_title ?? null, selected_quote_indices: entry.selected_quote_indices ?? null, selected_takeaway_indices: entry.selected_takeaway_indices ?? null }

  if (USE_MOCK_DATA) {
    const now = new Date().toISOString()
    const store = await readMock()
    store.websitePackages = store.websitePackages.filter((w) => w.session_id !== sessionId)
    const newRow: StudioWebsitePackage = { ...row, id: crypto.randomUUID(), created_at: now, updated_at: now }
    store.websitePackages.push(newRow)
    await writeMock(store)
    return { success: true, data: newRow }
  }

  try {
    await db!.delete(studioWebsitePackages).where(eq(studioWebsitePackages.session_id, sessionId))
    const rows = await db!.insert(studioWebsitePackages).values({
      session_id: row.session_id,
      status: row.status,
      hero_summary: row.hero_summary,
      full_summary: row.full_summary,
      takeaways: row.takeaways,
      quotes: row.quotes,
      topics: row.topics,
      resources: row.resources,
      timestamps: row.timestamps,
      custom_title: row.custom_title,
      selected_quote_indices: row.selected_quote_indices,
      selected_takeaway_indices: row.selected_takeaway_indices,
      linked_episode_id: row.linked_episode_id,
      raw_openai_response: row.raw_openai_response,
      error_message: row.error_message,
    }).returning()
    return { success: true, data: rows[0] as unknown as StudioWebsitePackage }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function updateWebsitePackage(
  id: string,
  updates: Partial<Pick<StudioWebsitePackage, "hero_summary" | "full_summary" | "takeaways" | "quotes" | "topics" | "resources" | "timestamps" | "custom_title" | "selected_quote_indices" | "selected_takeaway_indices" | "linked_episode_id">>
): Promise<{ success: boolean; data?: StudioWebsitePackage; error?: string }> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    const idx = store.websitePackages.findIndex((w) => w.id === id)
    if (idx === -1) return { success: false, error: "Not found" }
    store.websitePackages[idx] = { ...store.websitePackages[idx], ...updates, updated_at: new Date().toISOString() }
    await writeMock(store)
    return { success: true, data: store.websitePackages[idx] }
  }

  try {
    const setObj: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      setObj[key] = value
    }
    setObj.updated_at = new Date()

    const rows = await db!.update(studioWebsitePackages).set(setObj).where(eq(studioWebsitePackages.id, id)).returning()
    if (!rows[0]) return { success: false, error: "Not found" }
    return { success: true, data: rows[0] as unknown as StudioWebsitePackage }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Studio Analyzers
// ---------------------------------------------------------------------------

export async function getAnalyzerForSession(sessionId: string): Promise<StudioAnalyzer | null> {
  if (USE_MOCK_DATA) {
    const store = await readMock()
    return store.analyzers.find((a) => a.session_id === sessionId) || null
  }

  try {
    const rows = await db!.select().from(studioAnalyzers)
      .where(eq(studioAnalyzers.session_id, sessionId))
      .orderBy(desc(studioAnalyzers.created_at))
      .limit(1)
    return (rows[0] as unknown as StudioAnalyzer) || null
  } catch (err) {
    console.error("Error fetching analyzer:", err)
    return null
  }
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
    const store = await readMock()
    store.analyzers = store.analyzers.filter((a) => a.session_id !== sessionId)
    const newRow: StudioAnalyzer = { ...row, id: crypto.randomUUID(), created_at: now, updated_at: now }
    store.analyzers.push(newRow)
    await writeMock(store)
    return { success: true, data: newRow }
  }

  try {
    await db!.delete(studioAnalyzers).where(eq(studioAnalyzers.session_id, sessionId))
    const rows = await db!.insert(studioAnalyzers).values({
      session_id: row.session_id,
      status: row.status,
      data: row.data as unknown as Record<string, unknown> | undefined,
      prompt_version: row.prompt_version,
      raw_openai_response: row.raw_openai_response,
      error_message: row.error_message,
    }).returning()
    return { success: true, data: rows[0] as unknown as StudioAnalyzer }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
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
