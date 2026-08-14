/**
 * A real audit of every customer-facing email against the KHAT identity.
 *
 * WHY IT LOOKS LIKE THIS. The first version of this script checked hex colours
 * and nothing else, reported "0 off-palette" and called the templates
 * identity-compliant. Khalid then pointed at the screenshot it had just
 * produced and asked about the footer icons — which were circles, while the
 * identity's icon tile is a near-square. The logo was also sitting on a white
 * plate in the same image. Both were visible; neither was checked, because the
 * audit only knew how to look at colour.
 *
 * An identity is colour AND type AND geometry AND the assets themselves. Every
 * dimension below exists because leaving it out let something through.
 *
 *   npx tsx scripts/audit-email-identity.ts
 *
 * Exits non-zero when anything fails, so it can gate a deploy.
 */

import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"

// ─── the identity, as measured from the designer's file ─────────────────────

const PALETTE: Record<string, string> = {
  "#362e6d": "Deep Indigo",
  "#fd4f04": "KHAT Orange",
  "#f8f3ef": "Warm Ivory",
  "#d9d0c8": "Warm Stone",
  "#fff7f5": "Soft Blush",
  "#ffaa82": "Peach Glow",
  "#c83b0d": "Burnt Orange",
  "#342c6b": "Signature Purple",
  "#d9d5e8": "Lavender Mist",
  "#7570a3": "Dusty Violet",
  "#fff0e6": "Secondary Counter",
}

/**
 * The identity's typeface, hardcoded.
 *
 * IT MUST NOT BE READ FROM `EMAIL_FONT_STACK`. The first version of this audit
 * compared each template's `font-family` against that export — i.e. against the
 * very module under test — so swapping Manifa V2 for Segoe UI moved both sides
 * of the comparison and the audit stayed green. Proved by mutation on
 * 2026-08-14. An audit that takes its expectation from the code it audits can
 * only ever confirm that the code agrees with itself.
 */
const IDENTITY_TYPEFACE = "Manifa V2"

/**
 * The icon tile in the identity file is a square with a 2.76% corner radius —
 * measured off the artwork on p.13 (a 5.41-unit arc on a 196.4-unit side). The
 * designer draws no circles anywhere. A `border-radius:50%` chip is therefore
 * our invention, not his.
 */
const IDENTITY_TILE_RADIUS_PCT = 2.76

interface Finding {
  template: string
  dimension: string
  severity: "fail" | "warn"
  detail: string
}

const findings: Finding[] = []
const add = (
  template: string,
  dimension: string,
  severity: Finding["severity"],
  detail: string,
) => findings.push({ template, dimension, severity, detail })

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")

function nearest(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  let best = ""
  let bd = Infinity
  for (const p of Object.keys(PALETTE)) {
    const [R, G, B] = [1, 3, 5].map((i) => parseInt(p.slice(i, i + 2), 16))
    const d = Math.hypot(r - R, g - G, b - B)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  return { best, distance: bd }
}

// ─── the dimensions ─────────────────────────────────────────────────────────

/** 1. Colour — hex AND rgba, because rgba is how #3a2d70 survived a cleanup. */
function auditColour(name: string, html: string) {
  const seen = new Set<string>()
  for (const m of html.matchAll(/#[0-9a-fA-F]{6}\b/g)) seen.add(m[0].toLowerCase())
  for (const m of html.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g))
    seen.add(toHex(+m[1], +m[2], +m[3]))
  for (const h of seen) {
    if (PALETTE[h]) continue
    const n = nearest(h)
    add(name, "colour", "fail", `${h} is in no palette — nearest ${n.best} ${PALETTE[n.best]} (d=${n.distance.toFixed(0)})`)
  }
}

/** 2. Type — every font-family must be the shared stack, none invented inline. */
function auditType(name: string, html: string, stack: string) {
  // The stack the code exports must itself lead with the identity's face.
  if (!stack.startsWith(`'${IDENTITY_TYPEFACE}'`)) {
    add(name, "type", "fail", `EMAIL_FONT_STACK does not lead with ${IDENTITY_TYPEFACE}: ${stack.slice(0, 50)}`)
  }
  // The stack contains single quotes ('Manifa V2'), so the terminator is `;`
  // or the end of the style attribute — NOT a quote. Getting this wrong made
  // the first run report eight failures with an empty value.
  // `@font-face` legitimately declares `font-family: 'Manifa V2'` on its own —
  // that is the face being DEFINED, not a stack being applied. Strip those
  // blocks first or every template reports a false failure.
  const applied = html.replace(/@font-face\s*\{[^}]*\}/g, "")
  const families = [...applied.matchAll(/font-family:\s*([^;"]+)/g)].map((m) => m[1].trim())
  for (const f of new Set(families)) {
    if (f === stack) continue
    add(name, "type", "fail", `font-family that is not EMAIL_FONT_STACK: ${f.slice(0, 60)}`)
  }
  if (!/@font-face/.test(html)) add(name, "type", "fail", "no @font-face — Manifa V2 can never load")
  if (!html.includes(`'${IDENTITY_TYPEFACE}'`))
    add(name, "type", "fail", `${IDENTITY_TYPEFACE} absent from the rendered html`)
  // The face has to be the FIRST family, not merely present somewhere.
  const first = (/font-family:\s*'([^']+)'/.exec(applied) ?? [])[1]
  if (first && first !== IDENTITY_TYPEFACE)
    add(name, "type", "fail", `the first family applied is '${first}', not '${IDENTITY_TYPEFACE}'`)
}

/**
 * 3. Geometry — the designer's shapes are near-squares. Anything at or near
 * 50% is a circle we introduced; anything unrounded-but-large is worth seeing.
 */
function auditGeometry(name: string, html: string) {
  const radii = [...html.matchAll(/border-radius:\s*([^;"']+)/g)].map((m) => m[1].trim())
  for (const r of new Set(radii)) {
    if (/^(50%|999px|9999px)$/.test(r)) {
      // FAIL, not warn. A warning is something a person has to read and act
      // on; the circles survived months of "audits" precisely because nothing
      // ever stopped for them.
      add(name, "geometry", "fail", `border-radius:${r} — a circle/pill. The identity's tile is ${IDENTITY_TILE_RADIUS_PCT}% and the file draws no circles`)
    }
  }
}

/**
 * Is this image the designer's drawing, or ours?
 *
 * WHY THIS EXISTS. Every other check in this dimension passed on a footer full
 * of stock platform silhouettes: they had alpha, alt text, explicit dimensions
 * and a palette-legal ink. They were simply not KHAT — hand-written monochrome
 * copies of Instagram's and TikTok's own marks, sitting one row under the real
 * logo. Khaled found them in a screenshot. The audit did not, because nothing
 * here asked where the artwork came from.
 *
 * The test that separates the two: **the diamond**. The designer signs each of
 * the six social marks with the dot of the خ in KHAT Orange, and no stock
 * platform mark has one. So a social PNG with no orange pixels is not his.
 *
 * And because a PNG can drift from the vector it claims to come from, the raster
 * must still re-render from its sibling SVG — the same source
 * `scripts/extract-social-icons.ts` splits out of the identity file.
 */
async function auditAssetProvenance(
  name: string,
  rel: string,
  file: string,
  fills: Map<string, number>,
) {
  if (!/^\/brand\/social\/.+\.png$/.test(rel)) return

  const orange = (fills.get("#fd4f04") ?? 0) + (fills.get("#c83b0d") ?? 0)
  if (orange === 0) {
    add(
      name,
      "assets",
      "fail",
      `${rel} carries no KHAT Orange — the identity signs every social mark with the diamond, so this is a stock glyph, not the designer's`,
    )
  }

  const svg = file.replace(/\.png$/, ".svg")
  if (!existsSync(svg)) {
    add(name, "assets", "fail", `${rel} has no source vector at ${rel.replace(/\.png$/, ".svg")}`)
    return
  }
  const sharp = (await import("sharp")).default
  const { readFileSync } = await import("node:fs")
  const meta = await sharp(file).metadata()
  const source = readFileSync(svg, "utf8")
    .replace(/currentColor/g, "#362e6d")
    .replace("<svg ", `<svg width="${meta.width}" height="${meta.height}" `)
  const fresh = await sharp(Buffer.from(source)).png({ compressionLevel: 9 }).toBuffer()
  if (!fresh.equals(readFileSync(file))) {
    add(
      name,
      "assets",
      "fail",
      `${rel} is not what its source vector renders — re-run scripts/build-email-social-icons.ts`,
    )
  }
}

/**
 * 4. Assets — every image a client must fetch. Checked on disk, not asserted:
 * whether it exists, whether it has alpha, whether it is flattened onto a
 * colour that is in the palette, and whether it is the designer's drawing.
 */
async function auditAssets(name: string, html: string) {
  const sharp = (await import("sharp")).default
  const srcs = [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1])
  for (const src of new Set(srcs)) {
    const rel = src.replace(/^https?:\/\/[^/]+/, "")
    const file = join(process.cwd(), "public", rel)
    if (!existsSync(file)) {
      add(name, "assets", "fail", `${rel} does not exist in public/`)
      continue
    }
    if (statSync(file).size === 0) {
      add(name, "assets", "fail", `${rel} is a zero-byte file`)
      continue
    }
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let opaque = 0
    const fills = new Map<string, number>()
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] < 10) continue
      opaque++
      fills.set(toHex(data[i], data[i + 1], data[i + 2]), (fills.get(toHex(data[i], data[i + 1], data[i + 2])) ?? 0) + 1)
    }
    const total = info.width * info.height
    const dominant = [...fills.entries()].sort((a, b) => b[1] - a[1])[0]
    // A fully opaque asset is flattened onto something. That something has to
    // be a palette colour, or it paints a foreign plate inside the message.
    if (opaque / total > 0.99 && dominant && !PALETTE[dominant[0]]) {
      add(name, "assets", "fail", `${rel} is fully opaque and its plate is ${dominant[0]}, which is in no palette`)
    }
    await auditAssetProvenance(name, rel, file, fills)
  }
  // Every image needs alt text and explicit dimensions, or a blocked-images
  // inbox shows a broken box and the layout jumps.
  for (const m of html.matchAll(/<img[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) add(name, "assets", "fail", `an <img> has no alt: ${m[0].slice(0, 70)}`)
    if (!/\swidth="/.test(m[0]) || !/\sheight="/.test(m[0]))
      add(name, "assets", "warn", `an <img> has no explicit width/height: ${m[0].slice(0, 70)}`)
  }
}

/** 5. Structure — RTL, language, and the shared chrome every message needs. */
function auditStructure(name: string, html: string) {
  if (!/dir="rtl"/.test(html)) add(name, "structure", "fail", "no dir=\"rtl\" anywhere")
  if (!/lang="ar"/.test(html)) add(name, "structure", "warn", "no lang=\"ar\" on the document")
  if (!/khatpodcast\.com/.test(html)) add(name, "structure", "warn", "links to no khatpodcast.com URL")
  // A dark-mode inbox recolours anything that does not opt out.
  if (!/color-scheme/.test(html))
    add(name, "structure", "warn", "no color-scheme declaration — a dark-mode client may invert the palette")
}

/** 6. Consistency — the lockup and the footer must be the same in all of them. */
function auditConsistency(rendered: { name: string; html: string }[]) {
  const lockups = new Set(
    rendered.map((r) => (/<img[^>]*brand\/([a-z-]+\.png)[^>]*alt="بودكاست خط"/.exec(r.html) ?? [])[1] ?? "none"),
  )
  if (lockups.size > 1)
    add("(all)", "consistency", "fail", `templates disagree on the lockup asset: ${[...lockups].join(", ")}`)
  const withoutLockup = rendered.filter((r) => !/alt="بودكاست خط"/.test(r.html)).map((r) => r.name)
  if (withoutLockup.length)
    add("(all)", "consistency", "warn", `no brand lockup in: ${withoutLockup.join(", ")}`)
}

// ─── run ────────────────────────────────────────────────────────────────────

async function main() {
  const t = await import("../lib/email/templates")

  const CASES: { name: string; html: string }[] = [
    { name: "newsletter-welcome", html: t.newsletterWelcomeHtml("https://khatpodcast.com/unsubscribe?t=demo") },
    { name: "community-contribution-confirm", html: t.communityContributionConfirmHtml("خالد", "فكرة حلقة", "KHAT-1042") },
    { name: "guest-application-confirm", html: t.guestApplicationConfirmHtml("خالد", "KHAT-2031") },
    { name: "guest-prep-confirm", html: t.guestPrepConfirmHtml("خالد") },
    { name: "sponsor-application-confirm", html: t.sponsorApplicationConfirmHtml("خالد", "KHAT-3007") },
    { name: "newsletter-issue", html: t.newsletterHtml("<h2>عنوان</h2><p>فقرة.</p>", "https://khatpodcast.com/unsubscribe?t=demo") },
    { name: "direct-email", html: t.directEmailHtml("خالد", "موضوع", "نص الرسالة.", "فريق خط") },
    { name: "guest-application-admin", html: t.guestApplicationAdminHtml({ name: "ضيف", email: "g@example.com", phone: "+96500000000", country: "الكويت" }) },
  ]

  const OUT = join(process.cwd(), "outputs", "email-audit")
  mkdirSync(OUT, { recursive: true })

  for (const c of CASES) {
    writeFileSync(join(OUT, `${c.name}.html`), c.html)
    auditColour(c.name, c.html)
    auditType(c.name, c.html, t.EMAIL_FONT_STACK)
    auditGeometry(c.name, c.html)
    auditStructure(c.name, c.html)
    await auditAssets(c.name, c.html)
  }
  auditConsistency(CASES)

  const byDim = new Map<string, Finding[]>()
  for (const f of findings) byDim.set(f.dimension, [...(byDim.get(f.dimension) ?? []), f])

  const DIMENSIONS = ["colour", "type", "geometry", "assets", "structure", "consistency"]
  console.log(`\nEMAIL IDENTITY AUDIT — ${CASES.length} templates × ${DIMENSIONS.length} dimensions\n`)
  for (const d of DIMENSIONS) {
    const hits = byDim.get(d) ?? []
    const fails = hits.filter((h) => h.severity === "fail").length
    const warns = hits.length - fails
    const mark = fails ? "✗" : warns ? "!" : "✓"
    console.log(`${mark} ${d.padEnd(12)} ${fails} fail  ${warns} warn`)
    const seen = new Set<string>()
    for (const h of hits) {
      const key = `${h.severity}|${h.detail}`
      if (seen.has(key)) continue
      seen.add(key)
      const where = hits.filter((x) => x.detail === h.detail).map((x) => x.template)
      console.log(`    [${h.severity}] ${h.detail}`)
      console.log(`           in: ${where.length === CASES.length ? "ALL templates" : where.join(", ")}`)
    }
  }

  const fails = findings.filter((f) => f.severity === "fail").length
  console.log(`\n${fails} failures, ${findings.length - fails} warnings — rendered HTML in outputs/email-audit/`)
  process.exit(fails > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
