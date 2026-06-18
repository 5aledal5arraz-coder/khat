import type { CSSProperties } from "react"

/**
 * Apple-clean LIGHT token palette for the admin workspace.
 *
 * The admin shell (sidebar/header) stays dark; the content area is scoped to
 * this light palette ("dark rail + light workspace" — a deliberate premium
 * pattern). Because every admin primitive reads the KHAT semantic tokens
 * (`bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`, …),
 * applying these CSS variables to the content container recolors the whole
 * subtree cohesively with no per-component rewrite. Applied once in
 * admin-layout-client.tsx.
 */
export const ADMIN_LIGHT_TOKENS = {
  "--background": "250 33% 99%",
  "--foreground": "252 40% 11%",
  "--card": "0 0% 100%",
  "--card-foreground": "252 40% 11%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "252 40% 11%",
  /* Deep indigo = primary brand / active states */
  "--primary": "252 48% 40%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "250 28% 96%",
  "--secondary-foreground": "252 40% 11%",
  "--muted": "250 28% 96%",
  "--muted-foreground": "250 12% 46%",
  /* Orange = energy accent */
  "--accent": "22 90% 53%",
  "--accent-foreground": "0 0% 100%",
  "--destructive": "0 72% 51%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "250 22% 92%",
  "--input": "250 22% 92%",
  "--ring": "252 48% 40%",
} as CSSProperties
