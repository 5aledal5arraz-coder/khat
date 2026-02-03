"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const avatarVariants = cva(
  "relative flex shrink-0 overflow-hidden rounded-full bg-muted",
  {
    variants: {
      size: {
        sm: "h-8 w-8 text-xs",
        md: "h-10 w-10 text-sm",
        lg: "h-14 w-14 text-base",
        xl: "h-20 w-20 text-lg",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  src?: string | null
  alt?: string
  fallback?: string
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
  }
  return name.charAt(0) || "?"
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, size, src, alt, fallback, ...props }, ref) => {
    const [imageError, setImageError] = React.useState(false)
    const showImage = src && !imageError

    return (
      <div
        ref={ref}
        className={cn(avatarVariants({ size, className }))}
        {...props}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt || ""}
            className="aspect-square h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-elevated text-muted-foreground font-medium uppercase">
            {fallback ? getInitials(fallback) : alt ? getInitials(alt) : "?"}
          </div>
        )}
      </div>
    )
  }
)
Avatar.displayName = "Avatar"

export { Avatar, avatarVariants }
