import type { CSSProperties } from "react"

/**
 * Admin workspace token OVERRIDES.
 *
 * The brand palette lives in one place — the `:root` block in
 * `app/globals.css` — and the admin inherits all of it. This object carries
 * only the three tokens the admin deliberately diverges on, so that when the
 * brand colours change in `:root` the admin follows automatically instead of
 * staying pinned to a stale copy. It used to restate the whole palette
 * (nineteen tokens, sixteen of them byte-identical to the base), which is
 * exactly how a palette change leaks: recolour the site, and the admin keeps
 * the old one.
 *
 * Applied to the admin content container (admin-layout-client.tsx,
 * admin/layout.tsx, admin/login/page.tsx). Because every admin primitive
 * reads the KHAT semantic tokens (`bg-card`, `text-foreground`,
 * `border-border`, `text-muted-foreground`, …), the three values below
 * recolour the whole subtree with no per-component edit.
 */
export const ADMIN_LIGHT_TOKENS = {
  /* Half a percent lighter than the site's `250 30% 96%`. Dense admin tables
     sit on secondary far more than the public site does. */
  "--secondary": "250 28% 96%",
  /* Secondary text. Darkened from the site's 46% L to 38% so muted copy
     clears WCAG AA (~6.7:1 on white) — the site value washed out in the
     admin, especially where callers reduced its opacity further. */
  "--muted-foreground": "250 14% 38%",
  /* The undimmed orange. The site steps this down to 40.5% L for contrast on
     body text; the admin uses accent almost entirely for chrome and status
     chips, where the brighter tone reads better. NOTE: any admin surface that
     puts `text-accent` on normal-size copy fails WCAG AA at this lightness —
     worth a separate audit, not a silent change here. */
  "--accent": "22 90% 53%",
} as CSSProperties
