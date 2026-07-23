import { NextRequest, NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { validateAudioFile, normalizeAudioStage, MAGIC_BYTE_MISMATCH_ERROR } from "@/lib/validation/audio"
import { probeAudioDuration } from "@/lib/whisper"
import {
  createStudioSession,
  revalidateStudio,
  createProject,
  attachEditedSession,
  getProjectByRawSession,
} from "@/lib/studio"
import { resolveEirIdForSession } from "@/lib/studio/analysis-records"
import { requireAdminAPI } from "@/lib/api-utils"

export const maxDuration = 300

const AUDIO_DIR = path.join(process.cwd(), "data", "studio-audio")

/** studio_sessions.id is a uuid — guard the client-supplied raw ref before it
 *  hits a uuid column (a malformed value would otherwise throw a cast error). */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/admin/studio/upload — upload audio file and create studio session
 * Body: FormData with `file` (audio) and optional `title` (string)
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const title = (formData.get("title") as string) || null

    // Studio Wave 2 — which audio journey. Absent/unknown ⇒ 'edited' so a
    // client that doesn't send the field keeps the pre-existing full pipeline.
    const audioStage = normalizeAudioStage(formData.get("audio_stage"))

    // Studio Wave 2 — the raw session this edited cut belongs to, carried by
    // the «المرحلة ٢» button. Only meaningful for the edited journey; used to
    // attach this upload to the SAME project instead of orphaning it.
    const rawSessionRef = (formData.get("raw_session_id") as string) || null

    if (!file) {
      return NextResponse.json(
        { error: "يرجى اختيار ملف صوتي" },
        { status: 400 }
      )
    }

    // Read header bytes for magic byte check
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const headerBytes = buffer.subarray(0, 12)

    const validation = validateAudioFile(file.name, file.size, headerBytes)
    // Extension / size / empty are hard failures. A magic-byte mismatch is NOT:
    // the hand-rolled byte check rejects real-world audio (leading-padded MP3s,
    // some M4A/WAV variants). For this admin-only endpoint we log it and defer to
    // ffprobe below, which is the authoritative audio decoder.
    if (!validation.valid && validation.error !== MAGIC_BYTE_MISMATCH_ERROR) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }
    if (!validation.valid) {
      console.warn(
        `[studio-upload] magic-byte check failed for "${file.name}" ` +
          `(header: ${headerBytes.toString("hex")}) — deferring to ffprobe`
      )
    }

    // Create session directory
    const sessionId = crypto.randomUUID()
    const sessionDir = path.join(AUDIO_DIR, sessionId)
    await fs.mkdir(sessionDir, { recursive: true })

    // Sanitize filename to prevent path traversal
    const ext = path.extname(file.name).toLowerCase()
    const safeName = `audio-${sessionId}${ext}`
    const filePath = path.join(sessionDir, safeName)
    // Final safety check: ensure resolved path is inside sessionDir
    if (!path.resolve(filePath).startsWith(path.resolve(sessionDir))) {
      return NextResponse.json({ error: "اسم ملف غير صالح" }, { status: 400 })
    }
    await fs.writeFile(filePath, buffer)

    // Probe duration with ffprobe — the authoritative content check. A file that
    // isn't decodable audio returns null here → reject and clean up.
    const duration = await probeAudioDuration(filePath)
    if (duration === null || duration <= 0) {
      await fs.rm(sessionDir, { recursive: true, force: true })
      return NextResponse.json(
        { error: "تعذّرت قراءة الملف كملف صوتي صالح. تأكد أنه ملف mp3 أو wav أو m4a أو webm سليم." },
        { status: 400 }
      )
    }

    // Create studio session
    const result = await createStudioSession({
      youtube_url: null,
      video_id: null,
      source: "audio",
      audio_stage: audioStage,
      status: "fetched",
      video_title: title || file.name.replace(/\.[^.]+$/, ""),
      channel_title: null,
      published_at: null,
      duration_seconds: duration,
      thumbnail_url: null,
      raw_youtube_response: null,
      audio_filename: file.name,
      audio_file_size: file.size,
      audio_start_seconds: null,
      audio_end_seconds: null,
      audio_best_intro: null,
      audio_edit_suggestions: null,
      episode_id: null,
      episode_title: null,
      source_type: null,
      notes: null,
    })

    if (!result.success) {
      // Clean up file on failure
      await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {})
      return NextResponse.json(
        { error: result.error || "فشل في إنشاء الجلسة" },
        { status: 500 }
      )
    }

    // The DB mints its own session id, but we wrote the file under a temp uuid.
    // The map/review job resolves the audio as AUDIO_DIR/<sessionId>/audio-<sessionId><ext>,
    // so BOTH the directory AND the file inside must be renamed to the DB id.
    // (Renaming only the directory — as before — left the file as audio-<tempUuid>,
    // and the job died with ENOENT.) A failed rename orphans the audio, so this is
    // a hard error, not a silent swallow.
    if (result.data && result.data.id !== sessionId) {
      const newId = result.data.id
      const newDir = path.join(AUDIO_DIR, newId)
      try {
        await fs.rename(sessionDir, newDir)
        await fs.rename(
          path.join(newDir, `audio-${sessionId}${ext}`),
          path.join(newDir, `audio-${newId}${ext}`)
        )
      } catch (e) {
        await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {})
        await fs.rm(newDir, { recursive: true, force: true }).catch(() => {})
        console.error("[studio-upload] failed to align audio path with session id:", e)
        return NextResponse.json(
          { error: "تعذّر حفظ الملف الصوتي. حاول مرة أخرى." },
          { status: 500 }
        )
      }
    }

    // Studio Wave 2 — link this session into an episode project. Best-effort:
    // a session without a project is a valid "not part of a linked journey"
    // state (youtube/legacy uploads), so a linking failure must NEVER break
    // the upload — the session is already persisted.
    if (result.data) {
      const newSessionId = result.data.id
      try {
        if (audioStage === "raw") {
          // Phase 1 — a raw recording starts a new project at raw_uploaded,
          // carrying the session's EIR as the spine link.
          const eirId = await resolveEirIdForSession(newSessionId)
          await createProject({ rawSessionId: newSessionId, eirId })
        } else if (audioStage === "edited" && rawSessionRef && UUID_REGEX.test(rawSessionRef)) {
          // Phase 2 — the post-montage cut attaches to the SAME project the
          // raw session created (the orphan fix). If the raw session had no
          // project (a legacy raw upload predating Wave 2), there is nothing
          // to attach to — leave the edited session standalone, as before.
          const project = await getProjectByRawSession(rawSessionRef)
          if (project) {
            await attachEditedSession(project.id, newSessionId)
          }
        }
      } catch (linkErr) {
        console.error(
          "[Studio] episode-project link failed (upload still succeeded):",
          linkErr,
        )
      }
    }

    revalidateStudio()
    return NextResponse.json(result.data)
  } catch (error) {
    console.error("Audio upload error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء رفع الملف الصوتي" },
      { status: 500 }
    )
  }
}
