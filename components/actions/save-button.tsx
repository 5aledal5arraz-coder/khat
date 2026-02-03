"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Bookmark } from "lucide-react"
import { isItemSaved, toggleSaveItem, SavedItem } from "@/lib/saved"
import { cn } from "@/lib/utils"

interface SaveButtonProps {
  item: Omit<SavedItem, "savedAt">
  variant?: "ghost" | "outline" | "default"
  size?: "default" | "sm" | "lg" | "icon"
  showLabel?: boolean
  className?: string
}

export function SaveButton({
  item,
  variant = "ghost",
  size = "icon",
  showLabel = false,
  className,
}: SaveButtonProps) {
  const [isSaved, setIsSaved] = useState(() => {
    if (typeof window === "undefined") return false
    return isItemSaved(item.id, item.type)
  })

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newState = toggleSaveItem(item)
    setIsSaved(newState)
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={cn(
        showLabel && "gap-2",
        isSaved && "text-primary",
        className
      )}
      title={isSaved ? "إزالة من المحفوظات" : "حفظ"}
    >
      <Bookmark className={cn("h-4 w-4", isSaved && "fill-current")} />
      {showLabel && (isSaved ? "محفوظ" : "حفظ")}
    </Button>
  )
}
