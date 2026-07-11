import { env } from "@/lib/env"
import { execFile } from "child_process"
import { promisify } from "util"
import fs from "fs/promises"
import path from "path"
import OpenAI, { toFile } from "openai"

const execFileAsync = promisify(execFile)

/**
 * Transcription model. gpt-4o-transcribe supersedes whisper-1: same
 * ~$0.006/min price, measurably lower word-error rate (the gap is
 * largest on non-English audio — our episodes are Arabic). whisper-1
 * still works but is no longer the recommended default.
 */
const TRANSCRIBE_MODEL = "gpt-4o-transcribe"

const WHISPER_MAX_SIZE = 24 * 1024 * 1024 // 24 MB (audio endpoint limit is 25MB, leave margin)
const CHUNK_DURATION_SECONDS = 600 // 10 minutes per chunk

/**
 * Tail of the previous chunk's transcript passed as `prompt` to the next
 * chunk — gives the model continuity across the 10-minute cut points
 * (names, running topics, sentence fragments). Kept short: the prompt is
 * guidance, not content.
 */
const CHUNK_CONTEXT_CHARS = 600

interface TranscribeResult {
  success: boolean
  text?: string
  error?: string
}

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    const apiKey = env.OPENAI_API_KEY
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set")
    client = new OpenAI({ apiKey })
  }
  return client
}

/**
 * Get audio duration in seconds using ffprobe.
 */
export async function probeAudioDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ])
    const seconds = parseFloat(stdout.trim())
    return isNaN(seconds) ? null : Math.round(seconds)
  } catch {
    return null
  }
}

/**
 * Transcribe a single audio file via the transcription API.
 * `contextPrompt` carries the tail of the previous chunk for continuity.
 */
async function transcribeChunk(
  openai: OpenAI,
  filePath: string,
  language: string,
  contextPrompt?: string
): Promise<string> {
  const buffer = await fs.readFile(filePath)
  const filename = path.basename(filePath)
  const file = await toFile(buffer, filename)

  const response = await openai.audio.transcriptions.create({
    model: TRANSCRIBE_MODEL,
    file,
    language,
    ...(contextPrompt ? { prompt: contextPrompt } : {}),
  })
  return response.text
}

/**
 * Split audio into chunks using ffmpeg segment muxer.
 * Returns paths to chunk files.
 */
async function splitIntoChunks(
  inputPath: string,
  chunksDir: string,
  ext: string
): Promise<string[]> {
  await fs.mkdir(chunksDir, { recursive: true })

  // For WAV files, transcode to MP3 first for smaller chunk sizes
  const outputExt = ext === ".wav" ? "mp3" : ext.slice(1)
  const outputPattern = path.join(chunksDir, `chunk_%03d.${outputExt}`)

  const args = [
    "-i", inputPath,
    "-f", "segment",
    "-segment_time", String(CHUNK_DURATION_SECONDS),
    "-c", "copy",
  ]

  // WAV needs transcoding to MP3 for copy to work with segment
  if (ext === ".wav") {
    args.splice(args.indexOf("copy"), 1, "libmp3lame")
    args.splice(args.indexOf("-c") + 1, 0, "-q:a", "2")
  }

  args.push("-y", outputPattern)

  await execFileAsync("ffmpeg", args, { timeout: 300_000 })

  // Read chunk files sorted by name
  const files = await fs.readdir(chunksDir)
  return files
    .filter((f) => f.startsWith("chunk_"))
    .sort()
    .map((f) => path.join(chunksDir, f))
}

/**
 * Transcribe an audio file using OpenAI's transcription API
 * (gpt-4o-transcribe). If the file exceeds 24MB, it will be split into
 * chunks using ffmpeg.
 */
export async function transcribeAudioFile(
  filePath: string,
  language: string = "ar"
): Promise<TranscribeResult> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const stat = await fs.stat(filePath)
    const ext = path.extname(filePath).toLowerCase()

    if (stat.size <= WHISPER_MAX_SIZE) {
      // Small file — send directly
      const text = await transcribeChunk(openai, filePath, language)
      return { success: true, text }
    }

    // Large file — split into chunks
    const chunksDir = path.join(path.dirname(filePath), "chunks")

    try {
      const chunkPaths = await splitIntoChunks(filePath, chunksDir, ext)

      if (chunkPaths.length === 0) {
        return { success: false, error: "فشل في تقسيم الملف الصوتي" }
      }

      // Transcribe chunks sequentially, feeding each chunk the tail of
      // the previous transcript so cut-point sentences stay coherent.
      const texts: string[] = []
      for (const chunkPath of chunkPaths) {
        const prev = texts[texts.length - 1]
        const contextPrompt = prev ? prev.slice(-CHUNK_CONTEXT_CHARS) : undefined
        const text = await transcribeChunk(openai, chunkPath, language, contextPrompt)
        texts.push(text)
      }

      return { success: true, text: texts.join(" ") }
    } finally {
      // Clean up chunks
      try {
        await fs.rm(chunksDir, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "فشل في تحويل الصوت إلى نص"
    return { success: false, error: msg }
  }
}
