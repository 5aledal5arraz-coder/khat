/**
 * Studio Wave 2, Stage 1 — raw-episode TIME MAP job handler.
 *
 * Transcribing a 2-hour raw recording with whisper-1 segment timestamps takes
 * minutes, so this runs as a background job, never inline in the request.
 *
 * Pipeline:
 *   1. Resolve the uploaded raw audio for the session.
 *   2. `transcribeWithTimestamps` (whisper-1 verbose_json) → absolute-timed
 *      segments (logged to ai_runs with phase="timestamp_map").
 *   3. Persist the segments onto the transcript record (so the map can be
 *      re-generated later without paying whisper again).
 *   4. `generateEpisodeMap` — ffmpeg breaks + windows → validated map.
 *   5. Persist the map.
 *
 * The registered type is "studio.episode_map"; its HANDLER_TIMEOUT_MS entry in
 * worker.ts uses the SAME string (a mismatch silently caps the handler at the
 * 5-min default — see worker.ts assertTimeoutKeysAreRegistered).
 */

import path from "path"
import fs from "fs/promises"
import { registerHandler } from "../registry"
import { getStudioSession } from "@/lib/studio"
import { getProjectByRawSession, transitionState } from "@/lib/studio/projects"
import { resolveEirIdForSession } from "@/lib/studio/analysis-records"
import { saveTimedSegments, saveEpisodeMap } from "@/lib/studio/transcripts"
import { transcribeWithTimestamps } from "@/lib/whisper"
import { generateEpisodeMap } from "@/lib/ai/episode-map"
import {
  estimateChunkCount,
  buildTranscriptionProgress,
} from "@/lib/studio/transcription-progress"

/** Matches the upload route's layout: data/studio-audio/{sessionId}/audio-{sessionId}{ext}. */
const AUDIO_DIR = path.join(process.cwd(), "data", "studio-audio")

interface EpisodeMapPayload extends Record<string, unknown> {
  sessionId?: string
  language?: string
}

interface EpisodeMapResult extends Record<string, unknown> {
  session_id: string
  episode_true_start: number
  break_count: number
  hook_count: number
  ai_run_id: string
  segment_count: number
}

/**
 * Resolve the raw audio path for a session from the standard upload location.
 * The uploader writes `audio-{sessionId}{ext}` where ext is the original
 * extension; we rebuild it and confirm the file is inside AUDIO_DIR before use
 * (defence against a crafted session id / extension).
 */
async function resolveSessionAudioPath(
  sessionId: string,
  audioFilename: string,
): Promise<string> {
  const ext = path.extname(audioFilename).toLowerCase()
  const sessionDir = path.join(AUDIO_DIR, sessionId)
  const filePath = path.join(sessionDir, `audio-${sessionId}${ext}`)
  if (!path.resolve(filePath).startsWith(path.resolve(sessionDir) + path.sep)) {
    throw new Error("episode-map: resolved audio path escapes the session directory")
  }
  await fs.access(filePath) // throws if the raw audio isn't on disk
  return filePath
}

registerHandler<EpisodeMapPayload, EpisodeMapResult>(
  "studio.episode_map",
  async (payload, ctx) => {
    const sessionId = payload.sessionId
    if (!sessionId) {
      throw new Error("episode-map: payload.sessionId is required")
    }

    const session = await getStudioSession(sessionId)
    if (!session) {
      throw new Error(`episode-map: studio session ${sessionId} not found`)
    }
    if (!session.audio_filename) {
      throw new Error(
        `episode-map: session ${sessionId} has no uploaded audio to map`,
      )
    }

    const eirId = await resolveEirIdForSession(sessionId)
    const language = payload.language ?? "ar"
    const audioPath = await resolveSessionAudioPath(sessionId, session.audio_filename)

    // ── live progress: transcription dominates (~90%); detecting_breaks →
    //    analyzing → done are the fast tail. Emit an immediate determinate
    //    scale (chunk 0 of ~N, from the stored duration) before whisper even
    //    splits the file, then refine per chunk. Post-transcription steps carry
    //    the real chunk count so the bar reads "transcription complete". Every
    //    write is best-effort (ctx.reportProgress never throws).
    const expectedChunks = estimateChunkCount(session.duration_seconds)
    let lastTotalChunks = expectedChunks
    void ctx.reportProgress(
      buildTranscriptionProgress({
        stage: "transcribing",
        currentChunk: 0,
        totalChunks: expectedChunks,
      }),
    )

    // ── whisper-1 timestamped transcription (logged: phase="timestamp_map") ──
    const transcriptionStartMs = Date.now()
    const transcription = await transcribeWithTimestamps(
      audioPath,
      language,
      { eirId, subjectTable: "studio_sessions", subjectId: sessionId },
      undefined, // phase — keep the default "timestamp_map"
      (p) => {
        lastTotalChunks = p.totalChunks
        void ctx.reportProgress(
          buildTranscriptionProgress({
            stage: "transcribing",
            currentChunk: p.currentChunk,
            totalChunks: p.totalChunks,
            elapsedMs: Date.now() - transcriptionStartMs,
          }),
        )
      },
    )
    if (!transcription.success || !transcription.segments) {
      throw new Error(
        transcription.error || "episode-map: timestamped transcription failed",
      )
    }
    const segments = transcription.segments

    // ── persist segments so the map can be re-generated without re-paying ────
    await saveTimedSegments(sessionId, segments, transcription.durationSeconds ?? null)

    // ── generate + validate the map (throws on any unvalidated output) ───────
    const map = await generateEpisodeMap({
      segments,
      audioFilePath: audioPath,
      sessionId,
      eirId,
      onStage: (stage) => {
        void ctx.reportProgress(
          buildTranscriptionProgress({
            stage,
            currentChunk: lastTotalChunks,
            totalChunks: lastTotalChunks,
          }),
        )
      },
    })

    // ── persist the validated map ────────────────────────────────────────────
    await saveEpisodeMap(sessionId, map)

    // Cosmetic terminal tick — the poller keys on the map appearing, but a
    // stored "done" closes the bar cleanly if it polls in between.
    void ctx.reportProgress(
      buildTranscriptionProgress({
        stage: "done",
        currentChunk: lastTotalChunks,
        totalChunks: lastTotalChunks,
      }),
    )

    // ── advance the linked project to `mapped` (Studio Wave 2) ────────────────
    // Best-effort bookkeeping: the expensive transcription + map are already
    // persisted, so a legacy raw session with no project, or a re-generate
    // (idempotent same-state no-op), must never fail the job.
    try {
      const project = await getProjectByRawSession(sessionId)
      if (project) await transitionState(project.id, "mapped")
    } catch (linkErr) {
      console.error(
        `episode-map: project state → mapped failed for ${sessionId} (map still saved):`,
        linkErr,
      )
    }

    return {
      session_id: sessionId,
      episode_true_start: map.episode_true_start,
      break_count: map.breaks.length,
      hook_count: map.hook_candidates.length,
      ai_run_id: map.ai_run_id,
      segment_count: segments.length,
    }
  },
)
