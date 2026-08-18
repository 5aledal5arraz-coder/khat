/**
 * Fix the ORTHOGRAPHY of the extracted quotes, without touching a single word.
 *
 * WHY. `extract-story-quotes.ts` is built so it cannot fabricate: every
 * sentence is folded-compared against the transcript and dropped on mismatch.
 * That guard did its job — and in doing it, faithfully inherited the speech
 * recogniser's spelling. The live quotes say «القصه» for القصة, «احس اني» for
 * أحس أني, and «همست بإذنه» (permission) for بأذنه (his ear). Khaled read them
 * on the site and was right.
 *
 * WHAT MAKES THIS SAFE. `fold()` already erases exactly the marks we are
 * restoring — it maps ة→ه, أإآ→ا, ى→ي and drops tashkeel, because Arabic
 * SEARCH has to. So a correctly-spelled sentence and the recogniser's version
 * fold to the SAME string. Restoring orthography therefore passes the existing
 * verbatim proof untouched, while swapping a WORD fails it. The guard sorts
 * the two apart on its own; we do not have to trust the model.
 *
 * WHAT IT CANNOT FIX. Garbled proper nouns — «اواس» for هواسا, «ادي سبابا» for
 * أديس أبابا, «بات كولك» for whatever was said. Those are word substitutions
 * and the guard rejects them, correctly. They are listed at the end for a
 * human; the script never edits them.
 *
 *   npx tsx scripts/proofread-story-quotes.ts            # every episode
 *   npx tsx scripts/proofread-story-quotes.ts <videoId>  # one
 *   npx tsx scripts/proofread-story-quotes.ts --dry      # report, write nothing
 */
import "@/lib/jobs/load-env"
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs"
import { join } from "node:path"
import { runAiTask } from "@/lib/ai-router/router"
import { fold } from "@/lib/stories/story"

const DIR = join(process.cwd(), "content", "stories")
const BACKUP = join(DIR, "quotes-preproofread")
const PROMPT_VERSION = "quote-proofread-v1"
const BATCH = 25

interface Quote {
  text: string
  start: number
  speaker: string
  why: string
}

/**
 * The letters alone. `fold()` normalises Arabic but keeps punctuation and
 * spacing, and a proofreader legitimately moves commas. Comparing letters only
 * lets punctuation move while still refusing any change to the words.
 */
function letters(s: string): string {
  return fold(s).replace(/[^ء-ي0-9a-z]/g, "")
}

function buildPrompt(batch: { id: number; text: string }[]): string {
  return `أنت مدقق إملائي للعربية. النصوص التالية مأخوذة حرفياً من تفريغ صوتي آلي لحلقات بودكاست، وفيها أخطاء إملائية من التعرّف الصوتي.

مهمتك: تصحيح الإملاء فقط.

المسموح:
- التاء المربوطة: «القصه» ← «القصة»، «الساعه» ← «الساعة»
- الهمزات: «انا» ← «أنا»، «احس» ← «أحس»، «اذا» ← «إذا»
- الألف المقصورة: «الي» ← «إلى» حين تكون حرف جر
- علامات الترقيم والمسافات
- تصحيح الهمزة حين تغيّر المعنى: «همست بإذنه» ← «همست بأذنه» (الأُذن)

الممنوع منعاً باتاً:
- تغيير أي كلمة بكلمة أخرى
- حذف أو إضافة كلمة
- إعادة صياغة أو تحسين الأسلوب
- تصحيح اللهجة إلى الفصحى — «قلتلك» و«مش عارف» و«شنو» تبقى كما هي
- تصحيح أسماء الأعلام المشوّهة — اتركها كما وصلتك تماماً

النص المصحَّح يجب أن يتطابق مع الأصل حرفاً بحرف بعد تجريد الهمزات والتاء المربوطة. إن لم تجد خطأً إملائياً، أعد النص كما هو.

أعد JSON فقط:
{"fixed":[{"id":<الرقم>,"text":"<النص المصحَّح>"}]}

النصوص:
${batch.map((b) => `${b.id}. ${b.text}`).join("\n")}`
}

async function proofreadFile(file: string, dry: boolean) {
  const path = join(DIR, file)
  const doc = JSON.parse(readFileSync(path, "utf8")) as {
    videoId: string
    guestName: string
    quotes: Quote[]
  }

  const indexed = doc.quotes.map((q, i) => ({ id: i, text: q.text }))
  const fixes = new Map<number, string>()
  const rejected: { text: string; proposed: string }[] = []

  for (let i = 0; i < indexed.length; i += BATCH) {
    const batch = indexed.slice(i, i + BATCH)
    let res
    try {
      res = await runAiTask<{ fixed: { id: number; text: string }[] }>({
        taskKind: "editorial",
        subjectTable: "episodes",
        subjectId: doc.videoId,
        promptVersion: PROMPT_VERSION,
        expectJson: true,
        input: { videoId: doc.videoId, batch: i / BATCH, quotes: batch.length },
        prompt: buildPrompt(batch),
      })
    } catch (e) {
      console.log(`  ✗ batch ${i / BATCH}: ${e instanceof Error ? e.message.slice(0, 60) : e}`)
      continue
    }

    for (const f of res.parsed?.fixed ?? []) {
      const original = doc.quotes[f.id]?.text
      if (!original || typeof f.text !== "string") continue
      const proposed = f.text.trim()
      if (proposed === original) continue
      // THE GUARD. Same letters after folding = orthography only. Anything
      // else is a word change and does not get written, whatever the model
      // claims it did.
      if (letters(proposed) !== letters(original)) {
        rejected.push({ text: original, proposed })
        continue
      }
      fixes.set(f.id, proposed)
    }
  }

  if (!dry && fixes.size > 0) {
    if (!existsSync(BACKUP)) mkdirSync(BACKUP, { recursive: true })
    const bak = join(BACKUP, file)
    if (!existsSync(bak)) copyFileSync(path, bak)
    for (const [id, text] of fixes) doc.quotes[id].text = text
    writeFileSync(path, JSON.stringify(doc, null, 1) + "\n", "utf8")
  }

  // A COUNT IS NOT A VERIFICATION. Print every accepted correction in a dry
  // run — «10 corrected» is exactly the kind of number that has been green
  // over broken output before.
  if (dry) {
    for (const [id, text] of fixes) {
      console.log(`  كان:  ${doc.quotes[id].text}`)
      console.log(`  صار:  ${text}\n`)
    }
  }

  return { guest: doc.guestName, total: doc.quotes.length, fixed: fixes.size, rejected }
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes("--dry")
  const only = args.find((a) => !a.startsWith("--"))

  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".quotes.json"))
    .filter((f) => !only || f.startsWith(only))
  if (files.length === 0) throw new Error("no quote files matched")

  console.log(`${files.length} episode(s)${dry ? " — DRY RUN" : ""}\n`)

  let totalQuotes = 0
  let totalFixed = 0
  const allRejected: { guest: string; text: string; proposed: string }[] = []

  for (const f of files) {
    const r = await proofreadFile(f, dry)
    totalQuotes += r.total
    totalFixed += r.fixed
    for (const x of r.rejected) allRejected.push({ guest: r.guest, ...x })
    console.log(`${r.guest} … ${r.fixed}/${r.total} corrected${r.rejected.length ? `, ${r.rejected.length} refused` : ""}`)
  }

  console.log(`\n${totalFixed}/${totalQuotes} quotes corrected (${((totalFixed / totalQuotes) * 100).toFixed(0)}%)`)

  if (allRejected.length > 0) {
    console.log(`\n── REFUSED — the model changed words, not spelling (${allRejected.length}) ──`)
    console.log(`These are NOT written. Fix by hand or drop the quote.\n`)
    for (const r of allRejected.slice(0, 40)) {
      console.log(`${r.guest}`)
      console.log(`  كان:  ${r.text}`)
      console.log(`  صار:  ${r.proposed}\n`)
    }
    if (allRejected.length > 40) console.log(`… and ${allRejected.length - 40} more`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
