// Phase 2.0 Batch 2 — both AI calls now route through runAiTask.
// Prompt bodies live in `lib/ai/prompts/guest-extract.ts`.
import { runAiTask } from "@/lib/ai-router"
import {
  buildGuestExtractPrompt,
  GUEST_EXTRACT_PROMPT_VERSION,
  buildGuestDetectionBatchPrompt,
  GUEST_DETECTION_BATCH_PROMPT_VERSION,
} from "@/lib/ai/prompts/guest-extract"

const LEGACY_ACTOR = "system:legacy-callsite"

// ---------------------------------------------------------------------------
// Studio: Guest-only AI extraction (name + bio)
// ---------------------------------------------------------------------------

export interface GuestAIResult {
  guest_name: string | null
  guest_bio: string | null
}

interface ActorOpts {
  actorId?: string | null
  eirId?: string | null
}

export async function generateGuestFromTranscript(
  transcript: string,
  videoTitle: string,
  opts?: ActorOpts,
): Promise<{ success: true; data: GuestAIResult; runId?: string } | { success: false; error: string; runId?: string }> {
  try {
    const built = buildGuestExtractPrompt({ transcript, videoTitle })

    const result = await runAiTask<{
      guest_name?: string | null
      guest_bio?: string | null
    }>({
      taskKind: "structural",
      eirId: opts?.eirId ?? null,
      subjectTable: "studio_guests",
      subjectId: null,
      actorId: opts?.actorId ?? LEGACY_ACTOR,
      promptVersion: GUEST_EXTRACT_PROMPT_VERSION,
      input: built.input,
      prompt: [
        { role: "system", content: built.system },
        { role: "user", content: built.user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.3, max_tokens: 500 },
    })

    if (result.status !== "succeeded") {
      return {
        success: false,
        error: result.errorMessage || "لم يتم إنتاج رد من OpenAI",
        runId: result.runId,
      }
    }

    const parsed = result.parsed
    if (!parsed) {
      return { success: false, error: "لم يتم إنتاج رد من OpenAI", runId: result.runId }
    }

    return {
      success: true,
      runId: result.runId,
      data: {
        guest_name:
          typeof parsed.guest_name === "string" &&
          parsed.guest_name.toLowerCase() !== "null" &&
          parsed.guest_name.trim()
            ? parsed.guest_name
            : null,
        guest_bio:
          typeof parsed.guest_bio === "string" &&
          parsed.guest_bio.toLowerCase() !== "null" &&
          parsed.guest_bio.trim()
            ? parsed.guest_bio
            : null,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء استخراج بيانات الضيف"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Auto-detect guests & generate bios (batch)
// ---------------------------------------------------------------------------

export interface GuestDetectionInput {
  episode_id: string
  title: string
  description: string | null
  transcript_snippet: string | null
}

export interface GuestDetectionResult {
  episode_id: string
  guest_name: string | null
  guest_bio: string | null
  confidence: "high" | "medium" | "low"
  needs_review: boolean
}

/**
 * Batch detect guest names and generate bios from episode data.
 * Processes episodes in chunks to stay within token limits.
 * Optionally calls `onChunkProgress` after each chunk completes.
 *
 * Phase 2.0 Batch 2 — each chunk routes via runAiTask.
 */
export async function detectGuestsForEpisodes(
  episodes: GuestDetectionInput[],
  onChunkProgress?: (chunkIndex: number, totalChunks: number) => void,
  opts?: ActorOpts,
): Promise<{ success: boolean; data?: GuestDetectionResult[]; error?: string }> {
  const CHUNK_SIZE = 15
  const allResults: GuestDetectionResult[] = []
  const totalChunks = Math.ceil(episodes.length / CHUNK_SIZE)

  for (let i = 0; i < episodes.length; i += CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / CHUNK_SIZE)
    const chunk = episodes.slice(i, i + CHUNK_SIZE)

    const episodesData = chunk.map((ep) => ({
      episode_id: ep.episode_id,
      title: ep.title,
      description: (ep.description || "").slice(0, 500),
      transcript_snippet: (ep.transcript_snippet || "").slice(0, 800) || undefined,
    }))

    try {
      const built = buildGuestDetectionBatchPrompt({
        episodesPayload: episodesData,
        chunkIndex,
        totalChunks,
      })

      const completion = await runAiTask<{ results: GuestDetectionResult[] }>({
        taskKind: "structural",
        eirId: opts?.eirId ?? null,
        subjectTable: "episodes_guest_detection",
        subjectId: null,
        actorId: opts?.actorId ?? LEGACY_ACTOR,
        promptVersion: GUEST_DETECTION_BATCH_PROMPT_VERSION,
        input: { ...built.input, episodeCount: chunk.length },
        prompt: [
          { role: "system", content: built.system },
          { role: "user", content: built.user },
        ],
        expectJson: true,
        providerOptions: { temperature: 0.2 },
      })

      if (completion.status !== "succeeded") {
        // Mark failed chunk episodes as needs_review
        for (const ep of chunk) {
          allResults.push({
            episode_id: ep.episode_id,
            guest_name: null,
            guest_bio: null,
            confidence: "low",
            needs_review: true,
          })
        }
      } else {
        const parsed = completion.parsed
        if (parsed && Array.isArray(parsed.results)) {
          allResults.push(...parsed.results)
        }
      }
    } catch (error) {
      console.error(`Guest detection chunk error (offset ${i}):`, error)
      for (const ep of chunk) {
        allResults.push({
          episode_id: ep.episode_id,
          guest_name: null,
          guest_bio: null,
          confidence: "low",
          needs_review: true,
        })
      }
    }

    onChunkProgress?.(chunkIndex, totalChunks)
  }

  return { success: true, data: allResults }
}
