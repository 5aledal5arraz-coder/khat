import { cn } from "@/lib/utils"

const glowMap = {
  primary: "from-primary/15 via-primary/5 to-transparent",
  purple: "from-accent/15 via-accent/5 to-transparent",
  destructive: "from-destructive/15 via-destructive/5 to-transparent",
  muted: "from-muted-foreground/8 via-muted-foreground/3 to-transparent",
  green: "from-emerald-500/15 via-emerald-500/5 to-transparent",
}

const borderGlowMap = {
  primary: "group-hover/card:border-primary/30",
  purple: "group-hover/card:border-accent/30",
  destructive: "group-hover/card:border-destructive/30",
  muted: "group-hover/card:border-border",
  green: "group-hover/card:border-emerald-500/30",
}

interface GlowCardProps {
  children: React.ReactNode
  color?: keyof typeof glowMap
  className?: string
}

export function GlowCard({ children, color = "primary", className }: GlowCardProps) {
  return (
    <div
      className={cn(
        "group/card admin-card relative overflow-hidden transition-all duration-300",
        borderGlowMap[color],
        className
      )}
    >
      {/* Gradient glow overlay */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover/card:opacity-100",
          glowMap[color]
        )}
      />
      {/* Top edge highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-white/5 to-transparent" />
      <div className="relative">{children}</div>
    </div>
  )
}
