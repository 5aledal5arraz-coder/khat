/**
 * «نسخة الضيف» — LOCAL demo for Khaled.
 *
 * Inserts ONE self-contained demo: a guest, an EIR, a course-format prep_v2
 * shaped like the Bader prep, a guest link, a published snapshot, a fake home
 * address + map link + a placeholder house photo. Prints the local URL.
 *
 * Every row is tagged: guest name / EIR title / prep title start with «[DEMO]»,
 * created_by = "demo-guest-link". Re-running first removes the previous demo
 * (same tags only) so the printed URL is always fresh. Undo with:
 *
 *   npx tsx scripts/demo-guest-link-cleanup.ts
 *
 * Local only — refuses any non-localhost DATABASE_URL. No AI calls.
 *
 *   npx tsx scripts/demo-guest-link.ts [--submitted]
 *     --submitted  also pre-fills + submits the questionnaire, so the URL
 *                  opens straight on the welcome cards → prep view.
 */

import { loadEnvFiles } from "../lib/env-file"
import type { PrepV2Payload, SectionKind } from "../lib/preparation/v2/types"

loadEnvFiles()

const url = process.env.DATABASE_URL ?? ""
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("REFUSED: DATABASE_URL does not point at localhost. This script is local-only.")
  process.exit(1)
}

export const DEMO_TAG = "[DEMO]"
export const DEMO_ACTOR = "demo-guest-link"

async function main() {
  const { db } = await import("../lib/db")
  const { guests } = await import("../lib/db/schema/guests")
  const { episodeIntelligenceRecords } = await import("../lib/db/schema/eir")
  const { episodePreparations } = await import("../lib/db/schema/preparation")
  const { guestEpisodeLinks } = await import("../lib/db/schema/guest-episode-links")
  const { generateGuestLinkToken, fallbackExpiry } = await import("../lib/guest-link/access")
  const { toGuestPrepView } = await import("../lib/guest-link/view")
  const { saveHousePhoto } = await import("../lib/guest-link/house-photo")
  const { cleanupDemo } = await import("./demo-guest-link-cleanup")
  if (!db) throw new Error("db unavailable")

  const removed = await cleanupDemo()
  if (removed.eirs) console.log(`· removed previous demo (${removed.eirs} EIR)`)

  const submitted = process.argv.includes("--submitted")
  const now = new Date()
  // Five days out, 7:30pm Kuwait (16:30 UTC).
  const recordingAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 5, 16, 30))

  const [guest] = await db
    .insert(guests)
    .values({
      name: `${DEMO_TAG} د. بدر التجريبي`,
      slug: `demo-guest-link-${Date.now()}`,
    })
    .returning({ id: guests.id })

  const [eir] = await db
    .insert(episodeIntelligenceRecords)
    .values({
      working_title: `${DEMO_TAG} القيادة بعين الطبيب`,
      phase: "prepared",
      guest_id: guest.id,
      recording_scheduled_at: recordingAt,
      created_by: DEMO_ACTOR,
      editorial_intent: { source: "manual", goal: "دورة مصغّرة في القيادة" },
    })
    .returning({ id: episodeIntelligenceRecords.id })

  const prep = demoCoursePrep()
  const [prepRow] = await db
    .insert(episodePreparations)
    .values({
      title: `${DEMO_TAG} القيادة بعين الطبيب`,
      guest_name: "د. بدر التجريبي",
      episode_goal: "دورة مصغّرة في القيادة (قرابة ساعتين).",
      eir_id: eir.id,
      prep_v2: prep as never,
      status: "approved",
      created_by: DEMO_ACTOR,
    })
    .returning({ id: episodePreparations.id, updated_at: episodePreparations.updated_at })

  const photo = await saveHousePhoto(placeholderPng(1200, 900), "png")
  const location = {
    location_label: "بيت بو فهد — اليرموك (عنوان تجريبي)",
    address: "اليرموك، قطعة 3، شارع 12، منزل 7\n(عنوان تجريبي للعرض فقط)",
    map_url: "https://maps.apple.com/?ll=29.3117,47.9675&q=Demo",
    house_photo: photo,
  }
  const { view, refs } = toGuestPrepView({
    prep,
    schedule_at: recordingAt,
    show_schedule: true,
    location,
  })

  const { token, hash } = generateGuestLinkToken()
  await db.insert(guestEpisodeLinks).values({
    eir_id: eir.id,
    guest_id: guest.id,
    guest_display_name: "د. بدر التجريبي",
    token_hash: hash,
    status: "active",
    expires_at: fallbackExpiry(now),
    ...location,
    location_updated_at: now,
    published_view: view as never,
    published_ref_map: refs as never,
    published_at: new Date(now.getTime() + 1000),
    published_by: DEMO_ACTOR,
    published_source_prep_id: prepRow.id,
    published_source_prep_updated_at: prepRow.updated_at,
    published_schedule_at: recordingAt,
    created_by: DEMO_ACTOR,
    ...(submitted
      ? {
          questionnaire: {
            honorific: "خبير إداري",
            kunya: "بو فهد",
            pronunciation_notes: null,
            phone_whatsapp: "+965 0000 0000",
            preferred_drink: "قهوة عربية",
            technical_needs: null,
            social_accounts: {},
            team_notes: null,
            arrival_confirmation: true,
            clothing_acknowledgment: true,
          },
          questionnaire_submitted_at: now,
        }
      : {}),
  })

  const port = process.env.PORT ?? "3000"
  console.log("")
  console.log(`[DEMO] EIR:   ${eir.id}`)
  console.log(`[DEMO] Admin: http://localhost:${port}/admin/khat-brain/episodes/${eir.id}?tab=preparation`)
  console.log(`[DEMO] Guest: http://localhost:${port}/prepare/${token}`)
  console.log(`[DEMO] Samples published: ${view.axes.reduce((n, a) => n + a.samples.length, 0)} across ${view.axes.length} axes`)
  console.log("")
  process.exit(0)
}

// ─── Fixture: a course prep shaped like the Bader prep ─────────────────

type Q = PrepV2Payload["question_bank"][number]

function demoCoursePrep(): PrepV2Payload {
  const modules: [SectionKind, string, string[]][] = [
    ["opening", "من هو بدر", [
      "كيف انتقلت من غرفة العمليات إلى غرفة الاجتماعات؟",
      "شنو أول درس إداري تعلمته وأنت طبيب؟",
      "مين الشخص اللي غيّر نظرتك للقيادة؟",
    ]],
    ["build_up", "تشخيص المؤسسات بعين الطبيب", [
      "كيف تفرّق بين العَرَض والمرض في مؤسسة؟",
      "شنو المؤشرات اللي تعتبرها «فحص دم» للمؤسسة؟",
      "كيف تسأل الموظفين عشان تسمع الحقيقة؟",
      "متى تعرف إن التشخيص كان غلط؟",
    ]],
    ["conflict", "أول 100 يوم", [
      "شنو أول شي تسويه في يومك الأول كقائد جديد؟",
      "كيف تتعامل مع الفريق الموروث؟",
      "شنو المكسب السريع اللي ما يمحي شغل اللي قبلك؟",
    ]],
    ["deep_dive", "القيادة في زمن الذكاء الاصطناعي", [
      "شنو اللي يبقى إنساني في القيادة لما الأدوات تسوي نص الشغل؟",
      "كيف تقود فريق نصه أدوات؟",
      "شنو المهارة اللي تنصح القادة يتعلمونها الحين؟",
    ]],
    ["resolution", "الخلاصة وحقيبة الأدوات", [
      "لو المستمع طلع بأداة وحدة، شنو هي؟",
      "شنو الخطوة الأولى اللي يبدأ فيها بكرة؟",
    ]],
  ]
  const questions: Q[] = []
  for (const [kind, , texts] of modules) {
    texts.forEach((text, i) =>
      questions.push({
        id: `demo-${kind}-${i}`,
        section: kind,
        text,
        types: ["factual", "reflective"],
        priority: i === 0 ? "must_ask" : "if_time",
        purpose: "يستخرج خطوة عملية من المنهج",
        follow_up_prompt: "أعطنا مثالاً محدداً.",
        risk_level: "low",
      }),
    )
    // Internal-only questions the guest must NEVER see (projection test fodder).
    questions.push({
      id: `demo-${kind}-hard`,
      section: kind,
      text: "سؤال داخلي حساس — لا يظهر للضيف",
      types: ["confrontational"],
      priority: "must_ask",
      purpose: "داخلي",
      follow_up_prompt: "داخلي",
      risk_level: "high",
    })
  }
  const sections = modules.map(([kind, title], i) => ({
    kind,
    title,
    intent: `محور ${title}`,
    target_emotion: "وضوح",
    estimated_minutes: [18, 30, 30, 30, 8][i],
    transition_goal: "الانتقال للمحور التالي",
    learning_objective: `أن يطبّق المستمع ${title}`,
    key_concepts: ["مفهوم أ", "مفهوم ب"],
    takeaway_tool: `قائمة فحص: ${title}`,
    guest_experience_fit: "مثال من تجربته",
  }))
  return {
    format: "course" as const,
    target_minutes: 120,
    thesis: "[DEMO] أطروحة داخلية — لا تظهر للضيف",
    axes_of_tension: ["[DEMO] محور توتر داخلي"],
    guest_extraction_strategy: "[DEMO] استراتيجية داخلية — لا تظهر للضيف",
    episode_sections: sections,
    question_bank: questions,
    host_guidance: {
      overall_tone: "[DEMO] توجيه داخلي للمضيف",
      do_list: ["اطلب مثالاً"],
      dont_list: ["لا تستجوب"],
      energy_curve: "فهم يتراكم",
    },
    director_guidance: { shot_priorities: ["[DEMO]"], silence_moments: [], cut_warnings: [] },
    sensitive_zones: ["[DEMO] منطقة حساسة داخلية"],
    opening_options: [{ approach: "وعد", text: "[DEMO] افتتاحية داخلية" }],
    closing_options: [{ approach: "أداة", text: "[DEMO] خاتمة داخلية" }],
    total_estimated_minutes: 116,
    generator_version: "v2.1" as const,
    generated_at: new Date(Date.now() - 86_400_000).toISOString(),
    ai_run_ids: {
      pass1_research: null,
      pass2_structure: null,
      pass3_questions: null,
      pass4_critique: null,
      pass5_insights: null,
    },
  }
}

// ─── A placeholder "house photo": a soft two-tone PNG, no external asset ──

function placeholderPng(w: number, h: number): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require("node:zlib") as typeof import("node:zlib")
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < w; x++) {
      const sky = y < h * 0.55
      const t = y / h
      const o = row + 1 + x * 3
      raw[o] = sky ? 214 - t * 40 : 196 - t * 30
      raw[o + 1] = sky ? 223 - t * 30 : 170 - t * 20
      raw[o + 2] = sky ? 236 - t * 10 : 140 - t * 20
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, "ascii"), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function crc32(buf: Buffer): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
