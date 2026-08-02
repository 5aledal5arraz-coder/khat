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
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
