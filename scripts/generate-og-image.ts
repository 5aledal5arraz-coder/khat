/**
 * Generates `public/og-image.png` — the site-wide Open Graph card.
 *
 * WHY THIS EXISTS
 * `site_settings.seo.defaultOgImage` ships as "/og-image.png" (seeded from
 * config/site-settings.json), and the root layout feeds that value into
 * `openGraph.images` + `twitter:image` for every page that does not override it.
 * The asset itself was never created, so ~10 public pages advertised a 404 image
 * on a `summary_large_image` card — every WhatsApp / X / LinkedIn share rendered
 * blank. This script produces the missing asset at the canonical OG size.
 *
 * NO TEXT IS RENDERED. Arabic shaping in an SVG rasteriser is unreliable (this is
 * why a Satori/next-og route was rejected), so the wordmark comes from the
 * existing brand asset `public/logo-wide.jpg` — already correctly-shaped Arabic.
 * That JPEG is indigo-on-white, so to place it on an indigo card we rebuild it as
 * WHITE artwork: greyscale → negate gives a mask where the glyphs are bright and
 * the paper is black, and that mask becomes the alpha channel of a white plate.
 * Everything else on the card is a plain rectangle.
 *
 * Run: npx tsx scripts/generate-og-image.ts
 * The generated PNG is committed; nothing at runtime depends on this script.
 */
import path from "node:path"
import sharp from "sharp"

/** Open Graph canonical card size (1.91:1) — what WhatsApp / X / LinkedIn crop to. */
const WIDTH = 1200
const HEIGHT = 630

/** KHAT brand tokens, mirrored from `:root` in app/globals.css. A PNG cannot read
 *  CSS variables, so these are a hand-kept copy — update them with the palette. */
const INDIGO = "#493597" // --primary: 252 48% 40%
const INDIGO_DEEP = "#2f2560" // the dark stop of the KhatLogo gradient
const ORANGE = "#f36a1b" // --accent at full chroma; on indigo it is decorative,
// not text, so the 40.5% AA-safe variant would only mute it.

const ROOT = path.join(__dirname, "..")
const WORDMARK = path.join(ROOT, "public", "logo-wide.jpg")
const OUTPUT = path.join(ROOT, "public", "og-image.png")

async function main() {
  // The source is 2560x424 but the glyphs occupy only its middle band — the rest
  // is white padding. Trim first, otherwise "scale to N% of the card" scales the
  // padding too and the mark lands small and visually off-centre.
  const markWidth = Math.round(WIDTH * 0.62)
  const mask = await sharp(WORDMARK)
    .trim({ threshold: 12 })
    .resize({ width: markWidth })
    .greyscale()
    .negate() // glyphs → bright, paper → black
    // The wordmark is indigo (~L 40%), not black, so negate alone tops out around
    // alpha 170/255 and the mark renders washed-out grey on the indigo card.
    // normalise stretches the mask so the glyph core reaches full opacity.
    .normalise()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const markHeight = mask.info.height

  // White plate + the mask as its alpha channel = the wordmark in white, with the
  // paper fully transparent so the indigo card shows through.
  const whiteMark = await sharp({
    create: { width: markWidth, height: markHeight, channels: 3, background: "#ffffff" },
  })
    .joinChannel(mask.data, {
      raw: { width: markWidth, height: markHeight, channels: 1 },
    })
    .png()
    .toBuffer()

  // Centre the wordmark + rule as ONE optical group, nudged slightly above true
  // centre so the card does not read as bottom-heavy.
  const GAP = 44
  const RULE_HEIGHT = 8
  const RULE_WIDTH = Math.round(WIDTH * 0.14)
  const groupHeight = markHeight + GAP + RULE_HEIGHT
  const markTop = Math.round((HEIGHT - groupHeight) / 2) - 16
  const ruleTop = markTop + markHeight + GAP

  // "خط" means "a line" — an orange rule under the wordmark is the brand's own
  // motif (the same orange period that closes «أن تبقى.» on the homepage).
  const background = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" stop-color="#54409f"/>
           <stop offset="55%" stop-color="${INDIGO}"/>
           <stop offset="100%" stop-color="${INDIGO_DEEP}"/>
         </linearGradient>
         <radialGradient id="glow" cx="50%" cy="42%" r="55%">
           <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>
           <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
       <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
     </svg>`,
  )

  const rule = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
       <rect x="${Math.round((WIDTH - RULE_WIDTH) / 2)}" y="${ruleTop}"
             width="${RULE_WIDTH}" height="${RULE_HEIGHT}"
             rx="${RULE_HEIGHT / 2}" fill="${ORANGE}"/>
     </svg>`,
  )

  await sharp(background)
    .composite([
      { input: whiteMark, top: markTop, left: Math.round((WIDTH - markWidth) / 2) },
      { input: rule, top: 0, left: 0 },
    ])
    .png()
    .toFile(OUTPUT)

  const { size } = await sharp(OUTPUT).metadata()
  console.log(`Wrote ${OUTPUT} (${WIDTH}x${HEIGHT}, ${size} bytes)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
