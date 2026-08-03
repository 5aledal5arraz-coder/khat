import type { MetadataRoute } from "next"

/**
 * Web app manifest — added so the PWA / Android home-screen icon is the brand
 * mark rather than a screenshot of the page. Deliberately minimal: this is not
 * an installable app, the manifest exists for the icons and the tile colour.
 *
 * `theme_color` is the brand indigo (#362e6d) because it paints the Android
 * status bar behind the icon, and `background_color` is the brand ivory. Both
 * are the identity file's own values, not the CSS tokens — a manifest is a
 * static JSON document that cannot read them, and the two must not drift apart
 * silently, so they are imported from the one place the palette lives in code.
 */
import { KHAT_INDIGO, KHAT_IVORY } from "@/components/brand/khat-logo-art"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "بودكاست خط",
    short_name: "خط",
    description:
      "بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين.",
    start_url: "/",
    display: "browser",
    dir: "rtl",
    lang: "ar",
    background_color: KHAT_IVORY,
    theme_color: KHAT_INDIGO,
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        // A SEPARATE asset, not icon-512 listed twice. Android may crop a
        // maskable icon to any shape inside a circle of 80% of the canvas. The
        // shared asset reached 98.2% of that safe radius — it fit, with 1.8% to
        // spare, which is not a margin — and on the current tile the same reuse
        // would reach 112% and lose the bubble's tail. This canvas is padded
        // wider so the artwork lands at 84.3%, measured from the rendered
        // pixels by scripts/build-brand-icons.ts.
        //
        // That script is run by hand — it is NOT wired into `prebuild`, which
        // is validate-env + check-migration-drift. An earlier version of this
        // comment said it "fails the build"; it does not, and never did. What
        // actually holds the line is tests/brand/icon-policy.test.ts, which
        // re-measures THIS committed file's pixels on every test run.
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
