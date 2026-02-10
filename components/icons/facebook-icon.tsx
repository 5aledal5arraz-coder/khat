import { cn } from "@/lib/utils"

interface FacebookIconProps {
  className?: string
}

export function FacebookIcon({ className }: FacebookIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("h-4 w-4", className)}
    >
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 1.092.04 1.543.12v3.31a8.39 8.39 0 0 0-.986-.036c-1.4 0-1.943.53-1.943 1.908v2.256h3.783l-.65 3.667h-3.133v7.98z" />
    </svg>
  )
}
