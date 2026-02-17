import { cn } from "@/lib/utils"

const glowMap = {
  primary: "from-primary/20 via-transparent to-primary/5",
  purple: "from-accent/20 via-transparent to-accent/5",
  destructive: "from-destructive/20 via-transparent to-destructive/5",
  muted: "from-muted-foreground/10 via-transparent to-muted-foreground/5",
  green: "from-emerald-500/20 via-transparent to-emerald-500/5",
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
        "group/card relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm transition-all hover:border-border",
        className
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity group-hover/card:opacity-100",
          glowMap[color]
        )}
      />
      <div className="relative">{children}</div>
    </div>
  )
}
