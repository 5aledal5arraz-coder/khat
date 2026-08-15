/**
 * Lift every guest out of their photograph, so the episode card can use the
 * composition the designer actually drew.
 *
 * WHY. `غلاف الحلقة 02/thumnails vr 02.pdf` puts the guest on flat Deep Indigo
 * with no frame and no edge — because his guest is a CUT-OUT. Our photos are
 * rectangles, so the first build of `<GuestCard>` had to fake it with a
 * gradient and drop the two Signature Purple arcs, which would have sat
 * invisibly underneath a rectangle. With a real cut-out, none of that is
 * needed: the drawing works as drawn.
 *
 * IT RUNS ON THIS MAC AND NOWHERE ELSE. `scripts/native/subject-cutout.swift`
 * calls Vision's `VNGenerateForegroundInstanceMaskRequest` — the same engine as
 * "Remove Background" in Preview. No photograph is uploaded to any service,
 * which matters: these are real people whose pictures Khaled was given for a
 * podcast, not for a third party's training set.
 *
 * OUTPUT IS A SEPARATE FILE, NOT A REPLACEMENT. `photo_url` keeps pointing at
 * the original: a cut-out is right on the indigo card and wrong everywhere else
 * — on the guests list and the guest page a floating head on a pale ground
 * looks like a mistake. So the cut-outs live beside the originals and only the
 * card reaches for them.
 *
 * A GENERATED MANIFEST, NOT A GUESSED PATH. The card could derive
 * `/guests/cutout/<hash>.png` from `photo_url` and hope — and would render a
 * broken image for every guest uploaded after this ran. `lib/media/guest-cutouts.ts`
 * lists what actually exists on disk, so a missing cut-out falls back to the
 * plain photo instead of 404ing.
 *
 *   npx tsx scripts/cut-out-guest-photos.ts           # only what is missing
 *   npx tsx scripts/cut-out-guest-photos.ts --force   # redo everything
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"

const SOURCE_DIR = path.join(process.cwd(), "public", "guests")
const OUT_DIR = path.join(SOURCE_DIR, "cutout")
const SWIFT = path.join(process.cwd(), "scripts", "native", "subject-cutout.swift")
const MANIFEST = path.join(process.cwd(), "lib", "media", "guest-cutouts.ts")

const FORCE = process.argv.includes("--force")

/**
 * Below this, Vision found something but not a person — a shadow, a highlight,
 * a slice of chair. Measured across the set: a real portrait covers 45-70% of
 * its frame, and the one false positive seen covered 4%.
 */
const MIN_SUBJECT_COVERAGE = 0.15
/** Above this it kept the background too, and the "cut-out" is the whole photo. */
const MAX_SUBJECT_COVERAGE = 0.97

async function coverageOf(file: string): Promise<number> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let opaque = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] > 200) opaque++
  }
  return opaque / (info.width * info.height)
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("this needs macOS Vision — run it on the Mac that has the photos")
  }
  if (!existsSync(SWIFT)) throw new Error(`missing ${path.relative(process.cwd(), SWIFT)}`)

  mkdirSync(OUT_DIR, { recursive: true })
  const photos = readdirSync(SOURCE_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f))

  const kept: string[] = []
  const rejected: string[] = []

  for (const file of photos) {
    const base = file.replace(/\.[^.]+$/, "")
    const out = path.join(OUT_DIR, `${base}.png`)

    if (!FORCE && existsSync(out) && statSync(out).size > 0) {
      kept.push(base)
      continue
    }

    try {
      execFileSync("swift", [SWIFT, path.join(SOURCE_DIR, file), out], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
      })
    } catch {
      rejected.push(`${base}  — Vision found no subject`)
      continue
    }

    const coverage = await coverageOf(out)
    if (coverage < MIN_SUBJECT_COVERAGE || coverage > MAX_SUBJECT_COVERAGE) {
      // Leave the file; report it. A silently dropped cut-out is a guest whose
      // card quietly looks different from every other one.
      rejected.push(`${base}  — subject is ${(coverage * 100).toFixed(1)}% of the frame`)
      continue
    }
    kept.push(base)
    console.log(`  ✓ ${base}  ${(coverage * 100).toFixed(1)}%`)
  }

  mkdirSync(path.dirname(MANIFEST), { recursive: true })
  writeFileSync(
    MANIFEST,
    `// GENERATED FILE — do not edit by hand.
// Source of truth: public/guests/cutout/*.png, produced from public/guests/*.jpg
// by scripts/cut-out-guest-photos.ts (macOS Vision, entirely on-device).
// Regenerate after adding guest photos: npx tsx scripts/cut-out-guest-photos.ts

/**
 * Guests whose portrait has a background-free version on disk.
 *
 * A guest uploaded after this last ran is simply absent, and the card falls
 * back to the plain photograph — which is why this is a list of what exists
 * rather than a path the card guesses at.
 */
const CUTOUTS = new Set(${JSON.stringify(kept.sort(), null, 2)})

/** The cut-out for a \`photo_url\`, or null when there isn't one. */
export function guestCutoutUrl(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null
  const base = photoUrl.split("/").pop()?.replace(/\\.[^.]+$/, "")
  return base && CUTOUTS.has(base) ? \`/guests/cutout/\${base}.png\` : null
}
`,
  )

  console.log(`\n${kept.length} cut-outs → public/guests/cutout/`)
  if (rejected.length) {
    console.log(`\n${rejected.length} left on the plain photo:\n  ` + rejected.join("\n  "))
  }
  console.log(`wrote ${path.relative(process.cwd(), MANIFEST)}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
