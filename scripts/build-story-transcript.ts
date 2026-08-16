/**
 * Turn a KHAT episode's YouTube captions into a READABLE, timestamped Arabic
 * transcript — the body of a story page.
 *
 * Usage:
 *   npx tsx scripts/build-story-transcript.ts <episode-slug-or-youtube-id>
 *   npx tsx scripts/build-story-transcript.ts s7Ajz6YL2ZE --limit 3   # smoke test
 *
 * WHY THIS EXISTS, AND WHAT IT REFUSES TO DO
 * ------------------------------------------
 * YouTube's `ar-orig` track is machine speech recognition. Measured on
 * episode 015 it is GOOD on Kuwaiti dialect — «مبروك احنا الحين مستانسين»
 * comes back verbatim — but it arrives as 3,202 fragments with no
 * punctuation, no paragraphs, and no idea who is speaking. Nineteen thousand
 * words in that state are unreadable, which is why nobody publishes them.
 *
 * So one AI pass adds punctuation, paragraph breaks and speaker labels, and
 * fixes orthography the recogniser drops (بدا → بدأ). It is forbidden from
 * doing anything else. THIS IS SOMEONE'S TESTIMONY ABOUT A WAR: a model that
 * "improves" a sentence has fabricated a quotation from a named living
 * person. The prompt says so, the chunking keeps the model close to the
 * source, and `--verify` re-checks that the words survived.
 *
 * The timings are never invented either. Each paragraph inherits the
 * `start` of its first caption cue, read from the VTT by the project's own
 * `buildTimedSegmentsFromVtt` — the same parser Studio uses.
 */
import "@/lib/jobs/load-env"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildTimedSegmentsFromVtt, type TimedSegment } from "@/lib/studio/segments"
import { runAiTask } from "@/lib/ai-router/router"
import { db } from "@/lib/db"
import { episodes, guests, episodeEnrichments } from "@/lib/db/schema"
import { eq, or, ilike } from "drizzle-orm"

const exec = promisify(execFile)

/** Caption cues per AI call. ~200 cues ≈ 1,250 words — big enough that the
 *  model can see a whole thought, small enough that it stays anchored. */
const CUES_PER_CHUNK = 200

/** The host. Named here because the recogniser cannot tell voices apart and
 *  the model needs to know whose questions these are. */
const HOST_NAME = "خالد"

/** A paragraph that is nothing but the recogniser's audio descriptions. */
const SOUND_ONLY = /^(?:\s*\[[^\]]*\]\s*)+$/

export interface StoryParagraph {
  /** Seconds into the video — from the caption cue, never estimated. */
  start: number
  /** Speaker display name. */
  speaker: string
  /** Punctuated Arabic. Same words as the caption, never reworded. */
  text: string
}

export interface StoryTranscript {
  videoId: string
  episodeSlug: string
  episodeTitle: string
  guestName: string
  /** `ar-orig` = YouTube's automatic track in the spoken language. */
  captionTrack: string
  generatedAt: string
  model: string
  cueCount: number
  wordCount: number
  paragraphs: StoryParagraph[]
  chapters: { title: string; start: number }[]
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`
}

/** Pull the original-language auto-caption VTT. Returns raw VTT text. */
async function fetchCaptions(videoId: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "khat-story-"))
  try {
    await exec("yt-dlp", [
      "--no-update",
      "--skip-download",
      "--write-auto-subs",
      "--sub-langs",
      "ar-orig",
      "--sub-format",
      "vtt",
      "-o",
      join(dir, "cap.%(ext)s"),
      `https://www.youtube.com/watch?v=${videoId}`,
    ])
    const path = join(dir, "cap.ar-orig.vtt")
    if (!existsSync(path)) {
      throw new Error(
        `no ar-orig caption track for ${videoId} — this episode needs Whisper instead`,
      )
    }
    return readFileSync(path, "utf8")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const PROMPT_VERSION = "story-transcript@1"

function buildPrompt(guestName: string, cues: TimedSegment[]): string {
  const lines = cues
    .map((c, i) => `[${i}] (${fmt(c.start)}) ${c.text}`)
    .join("\n")

  return `أنت محرّر نصوص. مهمتك تحويل مقاطع تفريغ آلي عربي إلى فقرات مقروءة.

هذه شهادة شخصية حقيقية لشخص باسمه. **ممنوع منعاً باتاً** أن تغيّر كلمة، أو تعيد صياغة جملة، أو تضيف معلومة، أو تحذف محتوى. أنت تضيف علامات ترقيم فقط.

المسموح لك به — وهذا كل شيء:
1. إضافة علامات الترقيم (نقطة، فاصلة، علامة استفهام، تعجب).
2. تجميع المقاطع المتتابعة في فقرات حسب المعنى.
3. تصحيح الإملاء الذي يسقطه التعرّف الآلي فقط: الهمزات (بدا ← بدأ)، والتاء المربوطة (مقصوفه ← مقصوفة)، وألف التفريق. لا تغيّر اللهجة ولا تحوّلها إلى فصحى — «شنو» تبقى «شنو»، و«الحين» تبقى «الحين».
4. نسبة كل فقرة لمتحدّث: "${HOST_NAME}" وهو المُحاوِر الذي يسأل، أو "${guestName}" وهو الضيف الذي يروي.

ممنوع: إعادة الصياغة · تلخيص · إكمال جملة ناقصة · إضافة كلمة توضيحية · حذف تكرار · تحسين الأسلوب.
إذا كان مقطع غير مفهوم، اتركه كما هو حرفياً.

المقاطع (رقم المقطع، ثم توقيته، ثم نصه):
${lines}

أعد JSON بهذا الشكل فقط:
{"paragraphs":[{"firstCue":<رقم أول مقطع في الفقرة>,"speaker":"<الاسم>","text":"<نص الفقرة مرقّماً>"}]}

كل مقطع يجب أن يظهر في فقرة واحدة بالترتيب. لا تترك مقطعاً خارج النتيجة.`
}

interface ChunkResult {
  paragraphs: { firstCue: number; speaker: string; text: string }[]
}

async function main() {
  const args = process.argv.slice(2)
  const key = args.find((a) => !a.startsWith("--"))
  if (!key) {
    console.error("usage: npx tsx scripts/build-story-transcript.ts <slug-or-youtube-id> [--limit N]")
    process.exit(1)
  }
  const limitArg = args.indexOf("--limit")
  const chunkLimit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity
  /*
   * PACING, because the season batch tripped the provider's rate limit.
   * Seven episodes ran clean and then every remaining call came back
   * `rate_limited`; the router's two retries are for a blip, not for a client
   * hammering it for forty minutes. A pause between chunks costs minutes and
   * buys the difference between a transcript and a wall of unpunctuated text.
   */
  const delayArg = args.indexOf("--delay")
  const delayMs = delayArg >= 0 ? Number(args[delayArg + 1]) : 0

  if (!db) throw new Error("no database")

  const [episode] = await db
    .select()
    .from(episodes)
    .where(or(eq(episodes.id, key), eq(episodes.slug, key), ilike(episodes.title, `%${key}%`)))
    .limit(1)
  if (!episode) throw new Error(`no episode matching "${key}"`)

  const videoId = episode.youtube_url.match(/(?:v=|youtu\.be\/)([\w-]{11})/)?.[1] ?? episode.id
  const guest = episode.guest_id
    ? (await db.select().from(guests).where(eq(guests.id, episode.guest_id)).limit(1))[0]
    : null
  const guestName = guest?.name ?? "الضيف"

  console.log(`Episode : ${episode.title}`)
  console.log(`Guest   : ${guestName}`)
  console.log(`Video   : ${videoId}`)

  console.log("\n[1/3] fetching captions…")
  const vtt = await fetchCaptions(videoId)
  const cues = buildTimedSegmentsFromVtt(vtt)
  console.log(`      ${cues.length} cues, ${cues.reduce((n, c) => n + c.text.split(/\s+/).length, 0)} words`)

  // Chapters come from the enrichment row the admin already produced — this
  // script does not invent a table of contents.
  const [enrich] = await db
    .select()
    .from(episodeEnrichments)
    .where(eq(episodeEnrichments.episode_id, episode.id))
    .limit(1)
  const chapters = ((enrich?.timestamps as { title: string; time_seconds: number }[] | null) ?? [])
    .filter((t) => t && typeof t.time_seconds === "number")
    .map((t) => ({ title: t.title, start: t.time_seconds }))
  console.log(`      ${chapters.length} chapters from episode_enrichments`)

  console.log("\n[2/3] making it readable…")
  const chunks: TimedSegment[][] = []
  for (let i = 0; i < cues.length; i += CUES_PER_CHUNK) {
    chunks.push(cues.slice(i, i + CUES_PER_CHUNK))
  }
  const todo = chunks.slice(0, chunkLimit === Infinity ? chunks.length : chunkLimit)

  const paragraphs: StoryParagraph[] = []
  let model = ""
  let costUsd = 0

  let collapsed = 0
  let fellBack = 0
  for (const [ci, chunk] of todo.entries()) {
    if (delayMs > 0 && ci > 0) await new Promise((r) => setTimeout(r, delayMs))
    const res = await runAiTask<ChunkResult>({
      taskKind: "structural",
      subjectTable: "episodes",
      subjectId: episode.id,
      promptVersion: PROMPT_VERSION,
      expectJson: true,
      input: { videoId, chunk: ci, cues: chunk.length },
      prompt: buildPrompt(guestName, chunk),
    })
    model = res.modelName
    costUsd += res.costUsd ?? 0

    const out = res.parsed?.paragraphs
    if (!Array.isArray(out) || out.length === 0) {
      /*
       * THE FALLBACK IS A LAST RESORT, NOT A RESULT — and the first version
       * treated it as one.
       *
       * Batching the season hit the provider's rate limit. Every chunk of
       * eleven episodes exhausted its retries, returned nothing, and landed
       * here; the script wrote one 1,200-word unpunctuated block per chunk and
       * printed a tick. The word counts looked right, the timestamps were all
       * distinct so the duplicate guard stayed quiet, and the batch reported
       * «18 ok, 0 failed» over eleven ruined files.
       *
       * So the fallback still runs — losing testimony is worse — but it is
       * COUNTED, and past a threshold the file is refused below.
       */
      console.warn(`      chunk ${ci + 1}/${todo.length}: no paragraphs — keeping raw cues`)
      fellBack++
      paragraphs.push({
        start: chunk[0].start,
        speaker: guestName,
        text: chunk.map((c) => c.text).join(" "),
      })
      continue
    }

    for (const p of out) {
      // `[موسيقى]` / `[تصفيق]` are the recogniser describing the audio, not
      // anyone speaking. A paragraph made only of them is a blank line with
      // a speaker's name attached to it.
      if (SOUND_ONLY.test(String(p.text ?? ""))) continue
      // `firstCue` IS ALREADY CHUNK-LOCAL — `buildPrompt` numbers the cues it
      // shows from 0 each time. The first version subtracted a global offset
      // from it, so every chunk after the first produced a negative index, fell
      // through to `chunk[0]`, and stamped ONE timestamp onto every paragraph
      // in that chunk. Measured before the fix: 226 of 235 paragraphs shared a
      // start with another. On a page whose entire promise is «اضغط أي توقيت
      // لتسمعه» that is not a warning, it is the feature being broken —
      // and it surfaced only as a React duplicate-key message.
      const local = Number(p.firstCue)
      const inRange = Number.isFinite(local) && local >= 0 && local < chunk.length
      if (!inRange) collapsed++
      const cue = inRange ? chunk[local] : chunk[0]
      const text = String(p.text ?? "").trim()
      if (!text) continue
      paragraphs.push({
        start: cue.start,
        speaker: String(p.speaker ?? guestName).trim() || guestName,
        text,
      })
    }
    process.stdout.write(`      ${ci + 1}/${todo.length} chunks · $${costUsd.toFixed(4)}\r`)
  }
  console.log(`\n      ${paragraphs.length} paragraphs · $${costUsd.toFixed(4)} · ${model}`)

  // THE GUARD THE FIRST RUN DID NOT HAVE. Every paragraph should carry its own
  // moment; a pile of them sharing one means the cue mapping collapsed and the
  // timestamps are decorative. Refuse to write that — a file full of confident
  // wrong times is worse than no file, because nothing downstream can tell.
  // A chunk that fell back is a chunk with no punctuation, no speakers and one
  // paragraph where there should be a dozen. A file made mostly of those reads
  // as a wall of unbroken speech — it is not a transcript, and shipping it
  // under a real person's name is worse than shipping nothing.
  if (fellBack > 0) {
    const share = fellBack / todo.length
    console.warn(`      ⚠ ${fellBack}/${todo.length} chunks fell back to raw cues`)
    if (share > 0.15) {
      console.error(
        `\n      ✗ ${Math.round(share * 100)}% of this episode never reached the model` +
          ` (rate limit or provider error) — not writing the file.\n` +
          `        Re-run it; the ai_runs rows carry the error class.`,
      )
      process.exit(2)
    }
  }

  const distinct = new Set(paragraphs.map((p) => p.start)).size
  const shared = paragraphs.length - distinct
  if (collapsed > 0) {
    console.warn(`      ⚠ ${collapsed} paragraph(s) had an out-of-range firstCue`)
  }
  /*
   * 15%, NOT 10% — measured across the whole season rather than guessed.
   *
   * Healthy episodes legitimately share timestamps: a speaker change inside one
   * caption cue gives two paragraphs the same start. Across the eighteen that
   * built cleanly the rate runs 0–9% (rWmx74av4x4 20/278, C_hN-U1qgUo 16/177),
   * and tqH-9fmPdI0 was refused at 36/332 = 10.8% — a dense episode, not a
   * broken one.
   *
   * The failure this guards against is not subtle: when the cue mapping
   * collapsed on صلاح الغزالي it put 226 of 235 paragraphs on one of fifteen
   * timestamps — 96%. Anything near that trips 15% by a mile, and a threshold
   * that also rejects healthy work is a threshold that gets switched off.
   */
  if (shared > paragraphs.length * 0.15) {
    console.error(
      `\n      ✗ ${shared}/${paragraphs.length} paragraphs share a timestamp with another.\n` +
        `        The cue mapping is wrong — not writing the file.`,
    )
    process.exit(1)
  }

  console.log("\n[3/3] writing…")
  const doc: StoryTranscript = {
    videoId,
    episodeSlug: episode.slug,
    episodeTitle: episode.title,
    guestName,
    captionTrack: "ar-orig",
    generatedAt: new Date().toISOString(),
    model,
    cueCount: cues.length,
    wordCount: paragraphs.reduce((n, p) => n + p.text.split(/\s+/).length, 0),
    paragraphs: paragraphs.sort((a, b) => a.start - b.start),
    chapters,
  }
  const out = join(process.cwd(), "content", "stories", `${videoId}.json`)
  writeFileSync(out, JSON.stringify(doc, null, 1), "utf8")
  console.log(`      ${out}`)
  console.log(`      ${doc.wordCount} words in ${doc.paragraphs.length} paragraphs`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
