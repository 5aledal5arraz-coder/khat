import { cn } from "@/lib/utils"

/**
 * Khat brand mark — the new identity (deep-indigo squircle, white خط wordmark,
 * orange diamond accent). Built from the loaded Arabic font so it's crisp at any
 * size and theme-independent (brand colors are fixed). Replaces the legacy
 * /logo.png across the site. The pixel-exact production asset can later be
 * dropped at public/logo.png; this mark carries the identity until then.
 */

const INDIGO = "#3a2d70"
const ORANGE = "#ee6a2c"

export function KhatLogo({
  size = 40,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label="خط"
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: `linear-gradient(160deg, #45367f 0%, ${INDIGO} 55%, #2f2560 100%)`,
        boxShadow: `0 ${size * 0.04}px ${size * 0.18}px -${size * 0.06}px rgba(58,45,112,0.55)`,
      }}
    >
      {/* خط wordmark */}
      <span
        aria-hidden
        className="font-bold leading-none text-white"
        style={{ fontSize: size * 0.46, marginTop: size * 0.06 }}
      >
        خط
      </span>
      {/* orange diamond accent (the dot of the خ) */}
      <span
        aria-hidden
        className="absolute"
        style={{
          width: size * 0.15,
          height: size * 0.15,
          top: size * 0.2,
          insetInlineStart: size * 0.34,
          background: ORANGE,
          borderRadius: size * 0.03,
          transform: "rotate(45deg)",
          boxShadow: `0 0 ${size * 0.12}px ${ORANGE}66`,
        }}
      />
    </span>
  )
}

/** Logo + Arabic/Latin wordmark lockup, for the footer and wide placements. */
export function KhatLogoLockup({
  size = 40,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <KhatLogo size={size} />
      <span className="flex flex-col leading-none">
        <span
          className="font-bold tracking-tight text-foreground"
          style={{ fontSize: size * 0.42 }}
        >
          بودكاست خط
        </span>
        <span
          className="mt-1 font-medium uppercase tracking-[0.28em] text-muted-foreground"
          style={{ fontSize: size * 0.2 }}
        >
          Podcast Khat
        </span>
      </span>
    </span>
  )
}
