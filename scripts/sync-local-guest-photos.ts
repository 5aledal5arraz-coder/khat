/**
 * Bring the LOCAL database's guest photos up to what production already has.
 *
 * WHY THIS EXISTS. Local had 0 of 20 guests with a `photo_url`; production has
 * 17. Every guest card, guest page and episode page rendered locally was
 * therefore missing the one element that makes it a portrait — so a visual
 * review done locally was reviewing a layout nobody sees. That is the same
 * class of gap as the deploy drift: a difference between the two sides that
 * nothing reports until someone looks.
 *
 * DIRECTION IS ONE-WAY AND NARROW:
 *   · reads production, writes local — never the reverse
 *   · only fills rows where `photo_url IS NULL`; an existing local value is
 *     left alone, so this can never overwrite work in progress
 *   · touches one column, and no other table
 *
 * It refuses to run against anything but a localhost database. The guard is the
 * point of the script existing at all — a sync that can be pointed at
 * production by editing one env var is a footgun, not a tool.
 *
 *   npx tsx scripts/sync-local-guest-photos.ts            # apply
 *   npx tsx scripts/sync-local-guest-photos.ts --dry-run  # report only
 *
 * The image files themselves live in `public/guests/` and are fetched
 * separately; a row whose file is missing locally is reported, not skipped —
 * the app would render a broken portrait and you want to know.
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { Pool } from "pg"

type Row = { slug: string; photo_url: string }

const DRY_RUN = process.argv.includes("--dry-run")

function localConnectionString(): string {
  const url =
    process.env.DATABASE_URL ??
    readFileSync(path.join(process.cwd(), ".env.local"), "utf8").match(
      /^DATABASE_URL=(.*)$/m,
    )?.[1]
  if (!url) throw new Error("no DATABASE_URL — nothing to sync into")
  const trimmed = url.trim().replace(/^["']|["']$/g, "")
  const host = new URL(trimmed).hostname
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      `refusing to run: DATABASE_URL points at ${host}, not localhost. ` +
        `This script writes, and it is only ever meant to write to a dev database.`,
    )
  }
  return trimmed
}

async function main() {
  const source = process.argv.find((a) => a.startsWith("--source="))?.slice(9)
  if (!source) {
    throw new Error(
      "pass --source=<path to a JSON array of {slug, photo_url}> exported from production",
    )
  }
  const rows: Row[] = JSON.parse(readFileSync(source, "utf8"))
  const pool = new Pool({ connectionString: localConnectionString() })

  try {
    let filled = 0
    let untouched = 0
    const missingFiles: string[] = []

    for (const row of rows) {
      if (!existsSync(path.join(process.cwd(), "public", row.photo_url))) {
        missingFiles.push(row.photo_url)
      }
      if (DRY_RUN) continue
      const res = await pool.query(
        "update guests set photo_url = $1 where slug = $2 and photo_url is null",
        [row.photo_url, row.slug],
      )
      if (res.rowCount) filled++
      else untouched++
    }

    const after = await pool.query<{ total: number; with_photo: number }>(
      "select count(*)::int as total, count(photo_url)::int as with_photo from guests",
    )
    console.log(
      DRY_RUN
        ? `dry run — ${rows.length} rows in the export`
        : `filled ${filled}, left alone ${untouched} (already set, or slug not in this database)`,
    )
    console.log(`local guests: ${after.rows[0].with_photo}/${after.rows[0].total} with a photo`)
    if (missingFiles.length) {
      console.log(
        `\n${missingFiles.length} image file(s) not in public/guests — these will render broken:\n  ` +
          missingFiles.join("\n  "),
      )
    }
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
