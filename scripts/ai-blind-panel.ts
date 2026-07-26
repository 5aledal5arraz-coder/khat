/**
 * Blind judgment panel CLI — build the 20 pairs Khaled will judge.
 *
 *   npm run ai:blind-panel                    # ESTIMATE ONLY — zero paid calls
 *   npm run ai:blind-panel -- --generate      # actually spend money
 *   npm run ai:blind-panel -- --generate --candidate gemini-3.6-flash
 *
 * Estimate is the DEFAULT and `--generate` is the opt-in, not the reverse.
 * This script is the only thing in the codebase that spends money without a
 * user request behind it, so the harmless mode is the one you get by
 * forgetting a flag.
 *
 * What `--estimate` actually does: everything free. It selects the episodes,
 * pulls their transcripts through yt-dlp (no API, no billing), builds the
 * REAL production prompts, and measures them. The cost figure it prints is
 * therefore derived from the actual byte counts that would be sent — not a
 * guess, and re-checkable by anyone who runs it again.
 *
 * The pairs are deliberately CONCENTRATED on one surface — published episode
 * titles and descriptions — rather than spread across task kinds. Spreading
 * them would measure a little of everything badly: each task kind would get
 * 3–4 pairs, far too few to say anything, and the differences that do exist
 * would be diluted by kinds where both models are identical. Concentration is
 * what makes 20 pairs enough to see a real difference if one is there.
 */

import "@/lib/jobs/load-env"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodes } from "@/lib/db/schema/episodes"
import { getYouTubeId } from "@/lib/utils"
import { fetchTranscriptServer } from "@/lib/youtube/transcript-server"
import { cleanTranscriptText } from "@/lib/studio/utils"
import {
  buildYoutubePackSectionPrompt,
  YOUTUBE_PACK_SECTION_PROMPT_VERSION,
} from "@/lib/ai/prompts/youtube-pack"
import { runAiTask } from "@/lib/ai-router/router"
import { lookupPricing } from "@/lib/ai-router/registry"
import { providerForModel } from "@/lib/ai-router/benchmark/run"
import {
  PANEL_PAIR_COUNT,
  BLIND_PANEL_VERSION,
  writeBlindPanel,
  readBlindPanel,
  type BlindPanelPair,
  type BlindPanelSession,
  type PanelSource,
  type PanelVerdict,
} from "@/lib/ai-router/blind-panel"

// ─── Defaults ────────────────────────────────────────────────────────────────

/**
 * The pair under test. `structural` is the task kind the YouTube pack runs
 * on, so gpt-5.6-luna is genuinely what produces these strings today.
 *
 * The candidate defaults to gemini-3.6-flash for a specific reason: the
 * automated suite rejected it at quality_net −34, and −34 came from the model
 * judge. If Khaled cannot tell the two apart on 20 pairs of the output that
 * matters most, that −34 was noise — which is a finding about the BENCHMARK,
 * not just about this candidate.
 */
const DEFAULT_CURRENT_MODEL = "gpt-5.6-luna"
const DEFAULT_CANDIDATE_MODEL = "gemini-3.6-flash"
const JUDGE_MODEL = "gpt-5.6-sol"

/** 10 episodes × 2 sections = 20 pairs. */
const EPISODES_NEEDED = PANEL_PAIR_COUNT / 2
const SECTIONS = ["titles", "description"] as const

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const has = (name: string) => process.argv.includes(`--${name}`)

// ─── Preparation (free) ──────────────────────────────────────────────────────

interface PreparedEpisode {
  id: string
  title: string
  guestName: string
  episodeUrl: string
  transcript: string
}

async function prepareEpisodes(limit: number): Promise<PreparedEpisode[]> {
  if (!db) throw new Error("Database not available")
  const rows = await db
    .select({
      id: episodes.id,
      title: episodes.title,
      youtube_url: episodes.youtube_url,
      release_date: episodes.release_date,
    })
    .from(episodes)
    .where(and(eq(episodes.status, "published"), isNotNull(episodes.youtube_url)))
    // Newest first: the most recent episodes are the ones whose style the
    // show is actually converging on, so they are the fairest test of the
    // text we would publish tomorrow.
    .orderBy(sql`${episodes.release_date} DESC`)

  const out: PreparedEpisode[] = []
  for (const row of rows) {
    if (out.length >= limit) break
    const videoId = getYouTubeId(row.youtube_url)
    if (!videoId) continue

    process.stdout.write(`  · ${row.title.slice(0, 50)}… `)
    const res = await fetchTranscriptServer(videoId)
    if (!res.success || !res.text) {
      console.log(`تخطّي (لا نص: ${res.error ?? "غير معروف"})`)
      continue
    }
    const transcript = cleanTranscriptText(res.text)
    if (transcript.length < 2_000) {
      console.log(`تخطّي (نص قصير: ${transcript.length} حرف)`)
      continue
    }
    console.log(`✓ ${transcript.length} حرف`)
    out.push({
      id: row.id,
      title: row.title,
      guestName: "—",
      episodeUrl: row.youtube_url,
      transcript,
    })
  }
  return out
}

interface PlannedCall {
  episodeId: string
  episodeTitle: string
  section: (typeof SECTIONS)[number]
  system: string
  user: string
}

function planCalls(prepared: PreparedEpisode[]): PlannedCall[] {
  const calls: PlannedCall[] = []
  for (const ep of prepared) {
    for (const section of SECTIONS) {
      const built = buildYoutubePackSectionPrompt({
        transcript: ep.transcript,
        episodeTitle: ep.title,
        guestName: ep.guestName,
        episodeUrl: ep.episodeUrl,
        sectionType: section,
      })
      calls.push({
        episodeId: ep.id,
        episodeTitle: ep.title,
        section,
        system: built.system,
        user: built.user,
      })
    }
  }
  return calls
}

// ─── Cost estimate (free) ────────────────────────────────────────────────────

/**
 * Arabic is dense in BPE tokenizers — roughly 2.2 characters per token on
 * GPT-5/Gemini vocabularies, against ~4 for English. Using the English ratio
 * here would under-estimate this panel's input by nearly half, which is the
 * same "ignorance shows up as savings" failure the unpriced-model guard
 * exists to prevent. Deliberately rounded DOWN (a lower chars/token is a
 * higher token count), so the printed figure leans expensive.
 */
const ARABIC_CHARS_PER_TOKEN = 2.2

const estTokens = (text: string) => Math.ceil(text.length / ARABIC_CHARS_PER_TOKEN)

/** Output sizes, from what the production prompt asks for. */
const OUTPUT_TOKENS: Record<(typeof SECTIONS)[number], number> = {
  titles: 120, // 3 short Arabic headlines
  description: 700, // 3–5 paragraphs
}
/** Reasoning tokens bill as output on the GPT-5 family; ignored for Gemini. */
const REASONING_TOKENS_PER_CALL = 400
/** Judge: sees both outputs plus a slice of the input, answers in one line. */
const JUDGE_OUTPUT_TOKENS = 120

function costFor(model: string, tokensIn: number, tokensOut: number): number | null {
  const pricing = lookupPricing(providerForModel(model), model)
  if (!pricing) return null
  return (
    (tokensIn / 1_000_000) * pricing.inputCostPer1M +
    (tokensOut / 1_000_000) * pricing.outputCostPer1M
  )
}

function printEstimate(calls: PlannedCall[], currentModel: string, candidateModel: string) {
  let genIn = 0
  let genOutCurrent = 0
  let genOutCandidate = 0
  let judgeIn = 0

  for (const c of calls) {
    const tin = estTokens(c.system) + estTokens(c.user)
    genIn += tin
    const tout = OUTPUT_TOKENS[c.section]
    genOutCurrent += tout + REASONING_TOKENS_PER_CALL
    genOutCandidate += tout
    // Each judge call carries both outputs + a 6k-char slice of the input,
    // and runs TWICE per pair (A/B then B/A, cancelling position bias).
    judgeIn += 2 * (tout * 2 + estTokens(c.user.slice(0, 6_000)))
  }

  const currentCost = costFor(currentModel, genIn, genOutCurrent)
  const candidateCost = costFor(candidateModel, genIn, genOutCandidate)
  const judgeCost = costFor(
    JUDGE_MODEL,
    judgeIn,
    calls.length * 2 * (JUDGE_OUTPUT_TOKENS + REASONING_TOKENS_PER_CALL),
  )

  const line = (label: string, model: string, usd: number | null, note: string) =>
    console.log(
      `  ${label.padEnd(22)} ${model.padEnd(22)} ` +
        `${usd === null ? "غير مسعّر!" : "$" + usd.toFixed(3)}   ${note}`,
    )

  console.log(`\n── تقدير الكلفة (${calls.length} زوج) ──`)
  line("التوليد — الحالي", currentModel, currentCost, `${calls.length} استدعاء`)
  line("التوليد — المرشّح", candidateModel, candidateCost, `${calls.length} استدعاء`)
  line("الحَكَم النموذجي", JUDGE_MODEL, judgeCost, `${calls.length * 2} استدعاء (بالاتجاهين)`)

  const known = [currentCost, candidateCost, judgeCost].filter(
    (c): c is number => c !== null,
  )
  const total = known.reduce((a, b) => a + b, 0)
  const anyUnpriced = [currentCost, candidateCost, judgeCost].some((c) => c === null)

  console.log(`  ${"".padEnd(22)} ${"".padEnd(22)} ─────────`)
  console.log(`  ${"الإجمالي التقديري".padEnd(22)} ${"".padEnd(22)} $${total.toFixed(2)}`)
  if (anyUnpriced) {
    console.log(
      `\n  ⚠️  أحد الموديلات غير مسعّر في EXTRA_PRICING — الإجمالي أعلاه أقل من الحقيقي.`,
    )
  }
  console.log(
    `\n  الأساس: ${genIn.toLocaleString()} توكن إدخال للتوليد، ` +
      `تقدير ${ARABIC_CHARS_PER_TOKEN} حرف/توكن للعربي، ` +
      `+${REASONING_TOKENS_PER_CALL} توكن تفكير لكل استدعاء OpenAI.`,
  )
  console.log(
    `  ما هو مشمول: yt-dlp مجاني. ما هو غير مشمول: أي إعادة محاولة بسبب خطأ عابر.\n`,
  )
}

// ─── Generation (paid) ───────────────────────────────────────────────────────

async function generateOutput(
  model: string,
  call: PlannedCall,
): Promise<string | null> {
  const r = await runAiTask<{ content?: string }>({
    taskKind: "structural",
    preferredModel: model,
    preferredProvider: providerForModel(model),
    promptVersion: YOUTUBE_PACK_SECTION_PROMPT_VERSION,
    input: { blind_panel: true, section: call.section, episode: call.episodeId },
    prompt: [
      { role: "system", content: call.system },
      { role: "user", content: call.user },
    ],
    expectJson: true,
    timeoutMs: 180_000,
    maxRetries: 1,
    bypassRateLimit: true,
    actorId: "blind-panel",
    subjectTable: "config_store",
    subjectId: "ai_blind_panel",
  })
  if (r.status !== "succeeded") return null
  const content = r.parsed?.content
  return typeof content === "string" && content.trim() ? content.trim() : null
}

/** One judge call. Returns which SLOT it preferred in the given order. */
async function judgeOnce(
  call: PlannedCall,
  first: string,
  second: string,
): Promise<"first" | "second" | "tie"> {
  const r = await runAiTask<{ winner?: unknown }>({
    taskKind: "verification",
    preferredModel: JUDGE_MODEL,
    providerOptions: { reasoningEffort: "high" },
    input: { blind_panel: true, section: call.section },
    prompt: [
      {
        role: "system",
        content:
          "أنت حكم تحريري صارم لبودكاست عربي معياره: عمق، أصالة، دقة لغوية، " +
          "واحترام ذكاء المستمع. ستقارن مخرجين (A وB) لنفس المهمة دون معرفة مصدرهما. " +
          'أجب بصيغة JSON فقط: {"winner": "A" | "B" | "tie"}. اختر tie فقط عند تعادل حقيقي.',
      },
      {
        role: "user",
        content:
          `المهمة: ${call.section === "titles" ? "عناوين حلقة" : "وصف حلقة"} على يوتيوب\n\n` +
          `المدخل المشترك (مختصر):\n${call.user.slice(0, 6_000)}\n\n` +
          `── المخرج A ──\n${first}\n\n── المخرج B ──\n${second}\n\n` +
          'أعد JSON: {"winner": ...}',
      },
    ],
    expectJson: true,
    timeoutMs: 120_000,
    maxRetries: 1,
    bypassRateLimit: true,
    actorId: "blind-panel-judge",
    subjectTable: "config_store",
    subjectId: "ai_blind_panel",
  })
  const w = r.parsed?.winner
  if (w === "A") return "first"
  if (w === "B") return "second"
  return "tie"
}

/**
 * The judge runs in BOTH orders and only a consistent answer counts.
 * A judge that says "A" both times is preferring the position, not the text;
 * folding that into agreement would flatter it. Disagreement across orders
 * resolves to a tie, which is the honest reading of "it could not tell".
 */
async function judgePair(
  call: PlannedCall,
  aText: string,
  bText: string,
): Promise<PanelVerdict> {
  const [ab, ba] = await Promise.all([
    judgeOnce(call, aText, bText),
    judgeOnce(call, bText, aText),
  ])
  const first = ab === "first" ? "a" : ab === "second" ? "b" : "tie"
  const second = ba === "first" ? "b" : ba === "second" ? "a" : "tie"
  return first === second ? (first as PanelVerdict) : "tie"
}

async function generate(currentModel: string, candidateModel: string): Promise<void> {
  const existing = await readBlindPanel()
  if (existing && !existing.revealedAt) {
    console.error(
      `\n✗ فيه جلسة تحكيم غير مكتملة (${existing.id}) — اكشفها أو خلّصها أولاً.\n` +
        `  التوليد فوقها يمحي أحكامًا موجودة.\n`,
    )
    process.exit(1)
  }

  console.log("\n── سحب النصوص (yt-dlp، مجاني) ──")
  const prepared = await prepareEpisodes(EPISODES_NEEDED)
  if (prepared.length < EPISODES_NEEDED) {
    console.error(
      `\n✗ حصّلنا ${prepared.length} حلقة بنص من أصل ${EPISODES_NEEDED} المطلوبة.\n`,
    )
    process.exit(1)
  }
  const calls = planCalls(prepared)
  printEstimate(calls, currentModel, candidateModel)

  console.log("── التوليد (استدعاءات مدفوعة) ──")
  const pairs: BlindPanelPair[] = []
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]
    process.stdout.write(`  زوج ${i + 1}/${calls.length} (${call.section})… `)

    const [currentText, candidateText] = await Promise.all([
      generateOutput(currentModel, call),
      generateOutput(candidateModel, call),
    ])
    if (!currentText || !candidateText) {
      console.log("تخطّي (أحد الموديلين ما رجّع نص)")
      continue
    }

    // Shuffle per pair. A fixed side would let a judge who notices one
    // pattern apply it to all twenty; independent draws make position
    // uninformative.
    const currentIsA = Math.random() < 0.5
    const aText = currentIsA ? currentText : candidateText
    const bText = currentIsA ? candidateText : currentText
    const aSource: PanelSource = currentIsA ? "current" : "candidate"
    const bSource: PanelSource = currentIsA ? "candidate" : "current"

    const judgeVerdict = await judgePair(call, aText, bText)
    console.log(`✓ (الحَكَم: ${judgeVerdict})`)

    pairs.push({
      index: pairs.length + 1,
      episodeId: call.episodeId,
      episodeTitle: call.episodeTitle,
      section: call.section,
      aText,
      aSource,
      bText,
      bSource,
      judgeVerdict,
    })
  }

  if (pairs.length < PANEL_PAIR_COUNT) {
    console.error(
      `\n✗ تولّد ${pairs.length} زوج فقط من ${PANEL_PAIR_COUNT} — ما نكتب لوحة ناقصة.\n` +
        `  قاعدة التوقف معرّفة على ${PANEL_PAIR_COUNT} زوجًا بالضبط.\n`,
    )
    process.exit(1)
  }

  const session: BlindPanelSession = {
    version: BLIND_PANEL_VERSION,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    currentModel,
    candidateModel,
    judgeModel: JUDGE_MODEL,
    promptVersion: YOUTUBE_PACK_SECTION_PROMPT_VERSION,
    pairs,
    verdicts: {},
    revealedAt: null,
  }
  await writeBlindPanel(session)
  console.log(
    `\n✓ انكتبت جلسة ${session.id} بـ ${pairs.length} زوج.\n` +
      `  افتح /admin/blind-panel محلياً وابدأ التحكيم.\n`,
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const currentModel = arg("current") ?? DEFAULT_CURRENT_MODEL
  const candidateModel = arg("candidate") ?? DEFAULT_CANDIDATE_MODEL

  console.log(
    `لوحة الحكم الأعمى — الحالي: ${currentModel} · المرشّح: ${candidateModel} · ` +
      `الحَكَم: ${JUDGE_MODEL}`,
  )

  if (!has("generate")) {
    console.log("\nوضع التقدير — صفر استدعاء مدفوع. أضف --generate للتوليد الفعلي.")
    console.log("\n── سحب النصوص (yt-dlp، مجاني) ──")
    const prepared = await prepareEpisodes(EPISODES_NEEDED)
    if (prepared.length === 0) {
      console.error("\n✗ ما قدرنا نسحب أي نص حلقة — تأكد إن yt-dlp مثبّت.\n")
      process.exit(1)
    }
    const calls = planCalls(prepared)
    printEstimate(calls, currentModel, candidateModel)
    if (prepared.length < EPISODES_NEEDED) {
      console.log(
        `  ملاحظة: حصّلنا ${prepared.length} حلقة من ${EPISODES_NEEDED} — ` +
          `التقدير أعلاه لـ ${calls.length} زوج لا ${PANEL_PAIR_COUNT}.\n`,
      )
    }
    process.exit(0)
  }

  await generate(currentModel, candidateModel)
  process.exit(0)
}

main().catch((err) => {
  console.error("ai-blind-panel failed:", err)
  process.exit(1)
})
