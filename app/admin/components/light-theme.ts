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
  "--background": "210 20% 98%",
  "--foreground": "222 47% 11%",
  "--card": "0 0% 100%",
  "--card-foreground": "222 47% 11%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "222 47% 11%",
  "--primary": "38 46% 47%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "210 20% 96%",
  "--secondary-foreground": "222 47% 11%",
  "--muted": "210 20% 96%",
  "--muted-foreground": "215 16% 47%",
  "--accent": "266 40% 50%",
  "--accent-foreground": "0 0% 100%",
  "--destructive": "0 72% 51%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "214 20% 91%",
  "--input": "214 20% 91%",
  "--ring": "38 46% 47%",
} as CSSProperties
