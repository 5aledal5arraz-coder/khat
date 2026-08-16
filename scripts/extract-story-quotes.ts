/**
 * Pull the quotable sentences OUT OF WHAT THE GUEST ACTUALLY SAID.
 *
 * Usage:
 *   npx tsx scripts/extract-story-quotes.ts <youtube-id> [--count 12]
 *
 * WHY THIS EXISTS.
 * On 2026-08-15 the second Google result for «صلاح الغزالي الأسر» was a KHAT
 * quote page carrying «تجربة الأسر علمتني قيمة الحياة والحرية» under his name.
 * Measured against his full transcript — 19,683 words — the sentence is absent,
 * «علمتني قيمة» is absent, and «حرية» appears in two paragraphs, in one of which
 * the HOST is the one saying it. It was written for him, not by him.
 *
 * The existing quotes read like that because they were produced from a summary:
 * aphorisms with no speaker in them — «المعارك تشكل الهوية الوطنية»، «الدعاء
 * يكسر قوانين الطبيعة». This script cannot produce that failure, because it
 * never writes a sentence. It SELECTS from the transcript and then PROVES the
 * selection is verbatim before it will save it.
 *
 * The model's only job is judgement: which of these sentences carries weight.
 * Every candidate it returns is checked back against the source, and anything
 * that does not appear there — even reworded slightly — is dropped and counted.
 */
import "@/lib/jobs/load-env"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { runAiTask } from "@/lib/ai-router/router"
import type { StoryTranscript } from "@/lib/stories/story"

/** Sentences shorter than this are fragments; longer ones are paragraphs. */
const MIN_WORDS = 7
const MAX_WORDS = 40

export interface StoryQuote {
  /** Verbatim, exactly as it appears in the transcript. */
  text: string
  /** Seconds — the paragraph the sentence was taken from. */
  start: number
  speaker: string
  /** The model's one-line reason, for the editor deciding what to publish. */
  why: string
}

/** Same folding the reader's search uses, so "verbatim" survives orthography. */
function fold(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

interface Candidate {
  id: number
  text: string
  start: number
  speaker: string
}

function candidates(doc: StoryTranscript, hostName: string): Candidate[] {
  const out: Candidate[] = []
  let id = 0
  for (const p of doc.paragraphs) {
    // The host asks; the guest testifies. A question is not a quote.
    if (p.speaker === hostName) continue
    for (const raw of p.text.split(/(?<=[.؟!])\s+/)) {
      const text = raw.trim()
      const words = text.split(/\s+/).length
      if (words < MIN_WORDS || words > MAX_WORDS) continue
      if (!/^[\p{L}"«]/u.test(text)) continue
      out.push({ id: id++, text, start: p.start, speaker: p.speaker })
    }
  }
  return out
}

const PROMPT_VERSION = "story-quotes@1"

function buildPrompt(guestName: string, want: number, batch: Candidate[]): string {
  return `أمامك جُمل قالها ${guestName} حرفياً في حلقة بودكاست. مهمتك **الاختيار فقط**.

اختر أقوى ${want} جملة. الجملة القوية:
- تقف وحدها ويُفهم معناها بلا سياق
- فيها لحظة أو موقف أو تفصيل ملموس — لا كلام عام
- فيها صوت صاحبها، لا حكمة يمكن أن يقولها أي أحد

ارفض: الحشو · «يعني» و«وكذا» · الجمل الناقصة · العبارات العامة مثل «الحياة تعلمنا» · أي جملة لا يظهر فيها شخص أو حدث.

**ممنوع منعاً باتاً أن تكتب أو تعدّل أو تكمّل أو تختصر أي جملة.** انسخ نص الجملة كما هو حرفاً بحرف. أنت تختار أرقاماً، لا تؤلّف.

الجُمل:
${batch.map((c) => `[${c.id}] ${c.text}`).join("\n")}

أعد JSON فقط:
{"picks":[{"id":<الرقم>,"text":"<نص الجملة منسوخاً حرفياً>","why":"<سبب الاختيار في سطر>"}]}`
}

async function main() {
  const args = process.argv.slice(2)
  const videoId = args.find((a) => !a.startsWith("--"))
  if (!videoId) {
    console.error("usage: npx tsx scripts/extract-story-quotes.ts <youtube-id> [--count N]")
    process.exit(1)
  }
  const countArg = args.indexOf("--count")
  const want = countArg >= 0 ? Number(args[countArg + 1]) : 12

  const path = join(process.cwd(), "content", "stories", `${videoId}.json`)
  const doc = JSON.parse(readFileSync(path, "utf8")) as StoryTranscript
  const hostName = "خالد"

  const pool = candidates(doc, hostName)
  console.log(`${doc.guestName} — ${doc.paragraphs.length} paragraphs → ${pool.length} candidate sentences`)

  // Batched so the model sees a manageable list, and so one bad batch cannot
  // take the whole run down.
  const BATCH = 120
  const perBatch = Math.max(2, Math.ceil((want * 2) / Math.ceil(pool.length / BATCH)))
  const picked: StoryQuote[] = []
  let rejected = 0
  let costUsd = 0
  let model = ""

  for (let i = 0; i < pool.length; i += BATCH) {
    const batch = pool.slice(i, i + BATCH)
    const res = await runAiTask<{ picks: { id: number; text: string; why: string }[] }>({
      taskKind: "editorial",
      subjectTable: "episodes",
      subjectId: videoId,
      promptVersion: PROMPT_VERSION,
      expectJson: true,
      input: { videoId, batch: i / BATCH, candidates: batch.length },
      prompt: buildPrompt(doc.guestName, perBatch, batch),
    })
    model = res.modelName
    costUsd += res.costUsd ?? 0

    for (const p of res.parsed?.picks ?? []) {
      const source = batch.find((c) => c.id === Number(p.id))
      if (!source) {
        rejected++
        continue
      }
      // THE PROOF. The model was told to copy; this checks that it did. A
      // returned sentence that is not the source sentence — reworded, trimmed,
      // "improved" — is exactly the failure that put words in صلاح الغزالي's
      // mouth, and it is dropped here rather than published.
      if (fold(String(p.text ?? "")) !== fold(source.text)) {
        rejected++
        continue
      }
      picked.push({
        text: source.text,
        start: source.start,
        speaker: source.speaker,
        why: String(p.why ?? "").trim(),
      })
    }
    process.stdout.write(`  ${picked.length} kept · ${rejected} rejected · $${costUsd.toFixed(4)}\r`)
  }

  console.log(`\n${picked.length} verbatim quotes · ${rejected} rejected as not-verbatim · $${costUsd.toFixed(4)} · ${model}`)

  // EVERY SAVED QUOTE IS RE-PROVED against the transcript as a whole, not just
  // against the batch it came from. Belt and braces: this is the file that
  // would be published under a real person's name.
  const haystack = fold(doc.paragraphs.map((p) => p.text).join(" "))
  const unverified = picked.filter((q) => !haystack.includes(fold(q.text)))
  if (unverified.length > 0) {
    console.error(`\n✗ ${unverified.length} quote(s) are not in the transcript — refusing to write.`)
    unverified.forEach((q) => console.error(`   "${q.text.slice(0, 70)}…"`))
    process.exit(1)
  }

  picked.sort((a, b) => a.start - b.start)
  const out = join(process.cwd(), "content", "stories", `${videoId}.quotes.json`)
  writeFileSync(
    out,
    JSON.stringify({ videoId, guestName: doc.guestName, model, generatedAt: new Date().toISOString(), quotes: picked }, null, 1),
    "utf8",
  )
  console.log(`✓ all ${picked.length} verified verbatim → ${out}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
