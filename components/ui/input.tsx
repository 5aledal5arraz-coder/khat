import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // h-11 = 44px, the touch-target minimum — and the height `Button`
          // already uses by default, so the two stopped disagreeing. It was
          // h-9 (36px): fine under a mouse, short under a thumb, and the public
          // guest and partner forms render their fields straight from here with
          // no className of their own, so every one of them was undersized on a
          // phone. The handful of deliberately dense admin spots pass their own
          // h-8/h-9 and still win through `cn`.
          "flex h-11 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-field shadow-sm transition-all duration-200 file:border-0 file:bg-transparent file:text-control file:font-medium file:text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-control",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
