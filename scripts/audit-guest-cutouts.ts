/**
 * Fail the build if any guest photo has no background-free version.
 *
 * WHY THIS AND NOT AUTOMATIC REMOVAL. Khaled asked for the cut-out to happen by
 * itself. It cannot happen where it would need to: the droplet is **1 CPU core
 * and 1.9 GB of RAM** — measured, not assumed — and the production build there
 * already runs with `--max-old-space-size=3584`, above physical memory. A
 * segmentation model doing inference on that box is not a tradeoff, it is an
 * outage. The alternative, a WASM remover running in the admin's browser, means
 * adding a dependency whose licence is dual and unread; that is not something to
 * put on a live site on my own judgement.
 *
 * So the removal stays one command on a Mac — `scripts/cut-out-guest-photos.ts`,
 * on-device via Vision — and THIS is what makes forgetting it impossible.
 * فيصل الغضوري's photo was uploaded after that script last ran and his card
 * quietly fell back to the uncut photograph; Khaled found it by eye. Nothing in
 * the codebase had an opinion. Now the build does.
 *
 * IT IS A HARD FAILURE, NOT A WARNING. A warning is something a person has to
 * read and act on, and this file's whole reason for existing is that the last
 * one was found by the person who should never have had to look.
 *
 *   npx tsx scripts/audit-guest-cutouts.ts
 */
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"

const PHOTOS = path.join(process.cwd(), "public", "guests")
const CUTOUTS = path.join(PHOTOS, "cutout")

function main() {
  if (!existsSync(PHOTOS)) {
    console.log("no public/guests — nothing to check")
    return
  }

  // `!f.startsWith(".")` IS LOAD-BEARING, and it was missing.
  //
  // The first production run of this audit reported «50/50» against 32 real
  // portraits — and `public/guests/cutout` held 64 files where 32 exist. The
  // extras were AppleDouble sidecars, `._name.jpg`: macOS metadata companions
  // that `ls` hides because they are dotfiles. The audit was pairing `._x.jpg`
  // with `._x.png` and counting both as a pass, so its own number was
  // meaningless in exactly the direction that matters.
  //
  // 215 of them existed on the droplet, 79 under `public/` and therefore
  // publicly served. They are deleted. I do not know when they arrived — the
  // archive from today's deploy contains zero `._` entries, checked — so this
  // is not a claim about their origin, only about what was there and what the
  // guard did with it. A guard that counts phantoms is worse than no guard.
  const photos = readdirSync(PHOTOS).filter(
    (f) => !f.startsWith(".") && /\.(jpe?g|png|webp)$/i.test(f),
  )
  const missing = photos.filter(
    (f) => !existsSync(path.join(CUTOUTS, f.replace(/\.[^.]+$/, ".png"))),
  )

  console.log(`GUEST CUT-OUTS — ${photos.length - missing.length}/${photos.length} portraits`)

  if (missing.length === 0) return

  console.error(
    `\n${missing.length} portrait(s) have no cut-out, so their card falls back to the\n` +
      `plain photograph while every other guest stands on the indigo:\n  ` +
      missing.join("\n  ") +
      `\n\nRun this on a Mac, then deploy:\n` +
      `  npx tsx scripts/cut-out-guest-photos.ts\n`,
  )
  process.exit(1)
}

main()
