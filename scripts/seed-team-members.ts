/**
 * The three people who make بودكاست خط, on `/about`.
 *
 * ── WHERE THE WORDS CAME FROM ──────────────────────────────────────────────
 * Khaled gave the facts on 2026-08-06 and asked me to shape the titles:
 * «عاد انت غير المسميات بما يتناسب وكل واحد».
 *
 *   خالد   — المقدم والمعد والمؤسس
 *   فيصل   — المخرج وصاحب الرؤية ومسؤول الإضاءة والصوت والمونتاج
 *   شاهين  — المعد والتنسيق العام، يتواصل مع الضيوف ويحدد مواعيد التصوير
 *            ويساعد في الإعداد
 *
 * ── HOW THE TITLES WERE SHAPED, AND WHY NOT AS GIVEN ───────────────────────
 * Listing four jobs in a row reads as a small operation covering gaps. Each
 * `role` is therefore the ONE thing the person is, and the `description`
 * carries the rest — which is also the order a reader takes them in.
 *
 *   خالد  «المؤسس والمقدّم»    — founder first: it is his show before it is
 *                                 his voice, and the preparation belongs in the
 *                                 line below with the work.
 *   فيصل  «المخرج»             — «صاحب الرؤية» is not a job title, it is a
 *                                 compliment, and it lands harder as his own
 *                                 sentence than as a label. Lighting, sound and
 *                                 the edit sit in the description where their
 *                                 weight shows.
 *   شاهين «معدّ ومنسّق الإنتاج» — «التنسيق العام» is vague; coordinating the
 *                                 PRODUCTION is what he actually does, and it
 *                                 names guests and shoot dates without listing
 *                                 them.
 *
 * ── THE `message` FIELD ────────────────────────────────────────────────────
 * One line per person, rendered as a pull quote with the KHAT rule under it.
 * These are DRAFTS in each man's role, not quotes any of them said — Khaled
 * should replace them with their own words, and the page is designed so that a
 * member with no message simply renders without a quote.
 *
 * Photos and videos are left EMPTY on purpose. There is no admin screen for
 * this content (`saveAboutContent` has no caller), so they arrive by handing me
 * the files or by building that screen — flagged rather than faked.
 *
 * Usage
 *   npx tsx scripts/seed-team-members.ts            # local, dry run
 *   npx tsx scripts/seed-team-members.ts --apply
 *   npx tsx scripts/seed-team-members.ts --live --apply
 */

import { readFileSync, writeFileSync } from "fs"
import path from "path"
import { Pool } from "pg"

const argv = process.argv.slice(2)
const APPLY = argv.includes("--apply")
const LIVE = argv.includes("--live")

function readEnv(name: string): string {
  const fromProcess = process.env[name]
  if (fromProcess) return fromProcess
  const file = readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
  return (file.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^["']|["']$/g, "")
}

const KEY = LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL"
const DB_URL = readEnv(KEY)
if (!DB_URL) throw new Error(`${KEY} is not set`)

export const TEAM = [
  {
    id: "khaled",
    name: "خالد",
    role: "المؤسس والمقدّم",
    description:
      "أسّس خط، ويُعدّ كل حلقة قبل أن يجلس أمام ضيفها. يقرأ عن الضيف، يكتب الأسئلة، ثم يترك الورق ويُنصت.",
    message: "أحسن سؤال هو اللي يخلّي الضيف يفكّر قبل لا يجاوب.",
    image: "",
    order: 1,
  },
  {
    id: "faisal",
    name: "فيصل",
    role: "المخرج",
    description:
      "صاحب الرؤية البصرية للبودكاست. يضبط الإضاءة والصوت في الاستوديو، ويقود المونتاج حتى تخرج الحلقة بالشكل الذي رآه في رأسه.",
    message: "الصورة ما تنقل الكلام — تنقل الإحساس اللي قيل فيه.",
    image: "",
    order: 2,
  },
  {
    id: "shaheen",
    name: "شاهين",
    role: "معدّ ومنسّق الإنتاج",
    description:
      "يتواصل مع الضيوف ويحدّد مواعيد التصوير، ويشارك في إعداد الحلقة. كل حلقة تصل إلى الاستوديو جاهزة لأنه رتّبها قبل أن تبدأ.",
    message: "الحلقة الناجحة تبدأ قبل ما تشتغل الكاميرا بأسابيع.",
    image: "",
    order: 3,
  },
]

async function main() {
  const pool = new Pool({
    connectionString: DB_URL.replace(/[?&]sslmode=[^&]*/, ""),
    ...(LIVE ? { ssl: { rejectUnauthorized: false } } : {}),
  })
  const target = LIVE ? "PRODUCTION" : "local"
  console.log(`\n▸ target: ${target}   mode: ${APPLY ? "APPLY" : "dry run"}\n`)

  const rows = (await pool.query(`select content from static_content where key='about'`)).rows
  if (!rows[0]) {
    console.log("  no `about` row — nothing to update.\n")
    await pool.end()
    return
  }
  const content = rows[0].content as { teamMembers?: typeof TEAM }
  const existing = content.teamMembers ?? []

  console.log(`  existing members: ${existing.length}`)
  for (const m of TEAM) {
    const was = existing.find((e) => e.id === m.id)
    console.log(`\n  ${m.name} — ${m.role}`)
    console.log(`    ${m.description}`)
    console.log(`    «${m.message}»`)
    // PHOTOS AND VIDEOS ARE NEVER OVERWRITTEN. Khaled adds them; a re-run of
    // this script must not wipe what he put in.
    if (was?.image) console.log(`    keeping existing photo: ${was.image}`)
    if ((was as { videoUrl?: string } | undefined)?.videoUrl) {
      console.log(`    keeping existing video`)
    }
  }

  const merged = TEAM.map((m) => {
    const was = existing.find((e) => e.id === m.id) as (typeof TEAM)[number] & {
      videoUrl?: string
    }
    return {
      ...m,
      image: was?.image || m.image,
      ...(was?.videoUrl ? { videoUrl: was.videoUrl } : {}),
    }
  })

  console.log(`\n▸ ${merged.length} member(s) to write.`)
  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply.\n")
    await pool.end()
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(process.cwd(), `about-team-backup-${LIVE ? "prod" : "local"}-${stamp}.json`)
  writeFileSync(backupPath, JSON.stringify(rows[0].content, null, 1), "utf8")
  console.log(`\n▸ the whole about row backed up to:\n  ${backupPath}\n`)

  await pool.query(`update static_content set content = $1 where key='about'`, [
    JSON.stringify({ ...content, teamMembers: merged }),
  ])
  console.log(`▸ ${merged.length} member(s) written.\n`)
  await pool.end()
}

const invokedDirectly =
  !!process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
