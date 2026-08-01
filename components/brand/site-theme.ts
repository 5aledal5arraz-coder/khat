import type { CSSProperties } from "react"

/**
 * Khat 2.0 public site — light, Apple-editorial palette.
 *
 * Scoped onto the public layout wrapper so the whole public experience (header,
 * content, footer, mobile nav) renders on a bright near-white canvas with deep
 * indigo as the brand ink and orange as the spark. Token-driven, so components
 * recolor without per-file edits. The admin keeps its own scoped palette.
 */
export const SITE_LIGHT_TOKENS = {
  "--background": "250 33% 99%",
  "--foreground": "252 40% 11%",
  "--card": "0 0% 100%",
  "--card-foreground": "252 40% 11%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "252 40% 11%",
  /* Deep indigo = primary brand / CTA */
  "--primary": "252 48% 40%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "250 30% 96%",
  "--secondary-foreground": "252 40% 11%",
  "--muted": "250 28% 96%",
  "--muted-foreground": "250 12% 46%",
  /* Orange = energy accent. Lightness 53% → 40.5% (hue and saturation kept):
     at 53% the orange measured 2.97:1 on --background and 3.05:1 on --card,
     failing WCAG AA for normal text (4.5:1) everywhere `text-accent` is used —
     and failing SC 1.4.11 (3:1) for the accent icons too. 40.5% is the
     smallest step that clears 4.5:1 on both (4.61:1 / 4.73:1); the 42% first
     estimated only reaches 4.34:1 on --background. */
  "--accent": "22 90% 40.5%",
  "--accent-foreground": "0 0% 100%",
  "--destructive": "0 72% 51%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "250 22% 92%",
  "--input": "250 22% 92%",
  "--ring": "252 48% 40%",
  /* Legacy brand-accent tokens used by shared components */
  "--gold": "22 90% 53%",
  "--purple": "252 48% 40%",
  "--surface": "0 0% 100%",
  "--elevated": "250 28% 96%",
  "--text-secondary": "250 12% 38%",
  "--text-muted": "250 10% 50%",
} as CSSProperties
