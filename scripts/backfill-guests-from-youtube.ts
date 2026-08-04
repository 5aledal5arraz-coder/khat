/**
 * Give every episode its guest, from the names Khaled already wrote on YouTube.
 *
 * Before this: 3 guest rows, and 1 of 41 episodes linked to one. The names were
 * never missing — they were in the YouTube descriptions the whole time, in the
 * sentence that introduces the guest ("نستضيف …") and in the «حساب الضيف على
 * الإنستغرام» line under it.
 *
 * NOT PARSED AT RUN TIME, ON PURPOSE. The mapping below is a reviewed table,
 * not a regex over the description, because the two cases that matter most both
 * defeat pattern-matching:
 *   - 016 «قصة نور الدين زنكي» — نور الدين زنكي is the SUBJECT. The guest is
 *     فيصل المحيني, named only mid-paragraph. Any title-based extraction
 *     invents a guest who died in 1174.
 *   - 017 names two partners (فيصل الغضوري، سعد السند) and carries no guest
 *     account link to break the tie. Khaled confirmed فيصل الغضوري.
 * Ten of the names below were independently confirmed by following the
 * shortened «حساب الضيف» link to the Instagram handle it resolves to.
 *
 * MATCHING
 * The 3 pre-existing rows carry an honorific in `name` («الملازم عبدالله
 * البطي»), so matching is done on the DB's own `normalized_name` with a
 * contains test in BOTH directions. A guest is created only when nothing
 * matches — this never renames or merges an existing row.
 *
 * Usage
 *   npx tsx scripts/backfill-guests-from-youtube.ts --live           # dry run
 *   npx tsx scripts/backfill-guests-from-youtube.ts --live --apply
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

const DB_URL = readEnv(LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL")
if (!DB_URL) throw new Error(`${LIVE ? "LIVE_DATABASE_URL" : "DATABASE_URL"} is not set`)

interface GuestRow {
  /** YouTube video id === episodes.id */
  episode: string
  label: string
  name: string
  bio: string | null
  /** Instagram handle, when the «حساب الضيف» link resolved to one. */
  ig: string | null
}

export const GUESTS: GuestRow[] = [
  { episode: "gIgjLe_1_fA", label: "001", name: "ناصر سلطان سالمين", bio: "عقيد ركن متقاعد", ig: null },
  { episode: "SrT5ZBalYpM", label: "002", name: "جاسم العبوة", bio: "مؤسس كافيه دوز", ig: null },
  { episode: "Oc7CimUr4dQ", label: "003", name: "جاسم عباس", bio: "مؤسس شركة كومباس العالمية للرحلات", ig: null },
  { episode: "rKasyK7sdOE", label: "004", name: "الحارث المزيدي", bio: "دكتور", ig: null },
  { episode: "SmsIBiQ8uEA", label: "005", name: "حمزة تقي", bio: "الرئيس التنفيذي لشركة نولج للاستشارات", ig: null },
  { episode: "H2FK-9N7O4Q", label: "006", name: "محمد الوهيب", bio: "دكتور", ig: null },
  { episode: "bSRHYQVtK2Y", label: "007", name: "عبد العزيز الرومي", bio: "مؤلف كتاب «التميز»", ig: null },
  { episode: "J_A5Hovna5M", label: "008", name: "طلال العجمي", bio: "مؤسس ورئيس تنفيذي", ig: null },
  { episode: "0_mxyqK3sDk", label: "009", name: "علي دريساوي", bio: "مستشار إداري", ig: "ali.deris.kaabi" },
  { episode: "tqH-9fmPdI0", label: "010", name: "علي آل دريع", bio: "خبير العود والبخور", ig: "ali.alduraie" },
  { episode: "C_hN-U1qgUo", label: "011", name: "عبدالله البطي", bio: "ملازم — من أبطال حرب تحرير الكويت", ig: "buti61" },
  { episode: "tEEfMkbYfUY", label: "012", name: "زياد الرشيد", bio: "مدير أول قطاع الموارد البشرية", ig: "zalresheed" },
  { episode: "oISdxagKMBI", label: "013", name: "فهد الهاجري", bio: "لاعب كرة يد سابق ومحامٍ مختص بالعقود الرياضية", ig: "fahadalhajrei" },
  { episode: "rWmx74av4x4", label: "014", name: "باسم اللوغاني", bio: "باحث في التاريخ", ig: "basem_alloughani" },
  { episode: "s7Ajz6YL2ZE", label: "015", name: "صلاح الغزالي", bio: "شاهد عيان على الغزو العراقي", ig: "alghazalis" },
  // The subject of 016 is نور الدين زنكي. The guest is not.
  { episode: "ZPeBeS87EeI", label: "016", name: "فيصل المحيني", bio: null, ig: "faisalalm7iny" },
  // Two partners in the description; Khaled confirmed which one was in the room.
  { episode: "irSIienUQd4", label: "017", name: "فيصل الغضوري", bio: "شريك مؤسس في حلويات الفيصل", ig: null },
  { episode: "knyKlUZIwYQ", label: "018", name: "جاسم الزراعي", bio: "رائد أعمال", ig: "patekaholic" },
  { episode: "oNyFz82BVzY", label: "019", name: "حسام مطر", bio: "خطاط سوري", ig: null },

  // سالفة — one guest across the run.
  { episode: "Vn0A4aUTSbY", label: "سالفة 01", name: "باسم اللوغاني", bio: null, ig: null },
  { episode: "6F93shePog0", label: "سالفة 02", name: "باسم اللوغاني", bio: null, ig: null },
  { episode: "cDH4cPa7XJM", label: "سالفة 03", name: "باسم اللوغاني", bio: null, ig: null },
  // The description misspells him «اللوغلي»; the run is otherwise unambiguous.
  { episode: "xQtI8cE7Igc", label: "سالفة 04", name: "باسم اللوغاني", bio: null, ig: null },
  { episode: "VFlYnIQiIUo", label: "سالفة 05", name: "باسم اللوغاني", bio: null, ig: null },

  // فيصل الفرحان's run — five سالفات. The descriptions name him «فيصل» only,
  // first name and no more, so no amount of reading them could have resolved
  // which فيصل: this archive already holds فيصل الغضوري (017) and فيصل المحيني
  // (016). Khaled supplied the surname and the count, and the count is what
  // confirms the boundary — five here, six in the run below.
  { episode: "vHH0LheJQFs", label: "سالفة ف01", name: "فيصل الفرحان", bio: null, ig: null },
  { episode: "5ZYWspIqYLw", label: "سالفة ف02", name: "فيصل الفرحان", bio: null, ig: null },
  { episode: "0pMIwYMKE9w", label: "سالفة ف03", name: "فيصل الفرحان", bio: null, ig: null },
  { episode: "qGe25_jFNQ0", label: "سالفة ف04", name: "فيصل الفرحان", bio: null, ig: null },
  { episode: "v8e_tW3NX0Y", label: "سالفة ف05", name: "فيصل الفرحان", bio: null, ig: null },

  // علي دريساوي's run — six سالفات, and a SECOND numbered 01–06 series. Their
  // descriptions name nobody at all: they open on a verse or an idea and never
  // introduce a speaker, which is why they read as unattributed reflections.
  // He is already a guest here from 009; these attach to that same row.
  { episode: "I-sJTe9u0j4", label: "سالفة ع01", name: "علي دريساوي", bio: null, ig: null },
  { episode: "agDEZAVDYAU", label: "سالفة ع02", name: "علي دريساوي", bio: null, ig: null },
  { episode: "uNFmnch6DkU", label: "سالفة ع03", name: "علي دريساوي", bio: null, ig: null },
  { episode: "jJmOjPGDdHQ", label: "سالفة ع04", name: "علي دريساوي", bio: null, ig: null },
  { episode: "dFcdYCKkc3Q", label: "سالفة ع05", name: "علي دريساوي", bio: null, ig: null },
  { episode: "RVo_ar7OSDk", label: "سالفة ع06", name: "علي دريساوي", bio: null, ig: null },

  // Clips — the guest is inherited from the episode each was cut from.
  { episode: "r_NzVN4OmIs", label: "مقطع ← 001", name: "ناصر سلطان سالمين", bio: null, ig: null },
  { episode: "qhNxSY35WZU", label: "مقطع ← 011", name: "عبدالله البطي", bio: null, ig: "buti61" },
  { episode: "WEoJyqjOLDs", label: "مقطع ← 015", name: "صلاح الغزالي", bio: null, ig: "alghazalis" },
  { episode: "VrP9i5gRFmM", label: "مقطع ← 002", name: "جاسم العبوة", bio: null, ig: null },
  // «الزواج مو بس حب» — cut from 004, «أسرار الزواج الذكي». Its description
  // opens on the question and never names anyone, so unlike the four above it
  // could not be inherited by reading; Khaled placed it.
  { episode: "rkb-6qjO3YM", label: "مقطع ← 004", name: "الحارث المزيدي", bio: null, ig: null },
  // «لماذا يبقى الرجال في القمه» — cut from 007, the leadership episode with
  // عبد العزيز الرومي. Same as the one above: its description asks the question
  // and names nobody, so Khaled placed it rather than the text.
  { episode: "V3MNyEwmqr8", label: "مقطع ← 007", name: "عبد العزيز الرومي", bio: null, ig: null },
]

/** Mirrors the DB's own generated `normalized_name`, so matching agrees with it. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[^a-z0-9؀-ۿ\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * An existing row wins when either name contains the other, so «عبدالله البطي»
 * finds «الملازم عبدالله البطي» without renaming it.
 */
export function findExisting(
  name: string,
  existing: { id: string; normalized_name: string }[],
): string | null {
  const n = normalizeName(name)
  const hit = existing.find(
    (e) => e.normalized_name === n || e.normalized_name.includes(n) || n.includes(e.normalized_name),
  )
  return hit?.id ?? null
}

/** Arabic slug — Khaled cancelled English URLs; episode slugs are Arabic too. */
export function slugify(name: string): string {
  return normalizeName(name).replace(/\s+/g, "-")
}

async function main() {
  const pool = new Pool({
    connectionString: DB_URL.replace(/[?&]sslmode=[^&]*/, ""),
    ...(LIVE ? { ssl: { rejectUnauthorized: false } } : {}),
  })
  const target = LIVE ? "PRODUCTION" : "local"
  console.log(`\n▸ target: ${target}   mode: ${APPLY ? "APPLY (writes)" : "dry run"}\n`)

  const existing = (
    await pool.query<{ id: string; name: string; normalized_name: string }>(
      `select id, name, normalized_name from guests`,
    )
  ).rows
  console.log(`▸ ${existing.length} guest rows already exist\n`)

  const byName = new Map<string, { id: string | null; row: GuestRow }>()
  for (const g of GUESTS) {
    if (!byName.has(g.name)) byName.set(g.name, { id: findExisting(g.name, existing), row: g })
  }

  const toCreate = [...byName.values()].filter((v) => !v.id)
  const reused = [...byName.values()].filter((v) => v.id)
  console.log(`▸ ${reused.length} matched an existing row, ${toCreate.length} would be created:`)
  for (const v of toCreate) {
    console.log(`   + ${v.row.name.padEnd(20)} ${v.row.ig ? "@" + v.row.ig : ""}`)
  }
  console.log(`\n▸ ${GUESTS.length} episodes would be linked.`)

  if (!APPLY) {
    console.log("\nDry run — nothing was written. Re-run with --apply.\n")
    await pool.end()
    return
  }

  const backup = await pool.query(
    `select id, episode_number, guest_id from episodes where id = any($1::text[])`,
    [GUESTS.map((g) => g.episode)],
  )
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(process.cwd(), `guests-backup-${target}-${stamp}.json`)
  writeFileSync(backupPath, JSON.stringify({ episodes: backup.rows, guests: existing }, null, 1), "utf8")
  console.log(`\n▸ backup written to:\n  ${backupPath}\n`)

  const client = await pool.connect()
  let created = 0
  let linked = 0
  try {
    await client.query("BEGIN")
    for (const entry of byName.values()) {
      if (entry.id) continue
      const g = entry.row
      // `guests.id` has no DB-level default — Drizzle supplies it in app code
      // (`$defaultFn`), so a raw INSERT must too. The `guest-` prefix matches
      // the rows that already exist.
      const r = await client.query<{ id: string }>(
        `insert into guests (id, name, slug, bio, external_links)
              values ($1, $2, $3, $4, $5::jsonb)
         returning id`,
        [
          `guest-${crypto.randomUUID()}`,
          g.name,
          slugify(g.name),
          g.bio,
          JSON.stringify(g.ig ? { instagram: `https://www.instagram.com/${g.ig}` } : {}),
        ],
      )
      entry.id = r.rows[0].id
      created++
    }
    for (const g of GUESTS) {
      const id = byName.get(g.name)!.id!
      const r = await client.query(
        `update episodes set guest_id = $2, updated_at = now() where id = $1`,
        [g.episode, id],
      )
      linked += r.rowCount ?? 0
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    console.log(`✗ rolled back: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  } finally {
    client.release()
  }

  console.log(`▸ ${created} guests created, ${linked} episodes linked.\n`)
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
