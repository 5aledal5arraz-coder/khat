"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusDot, type TabStatus } from "./shared"

interface AccordionSectionProps {
  icon: React.ElementType
  iconColor: string
  title: string
  status: TabStatus
  defaultOpen?: boolean
  children: React.ReactNode
}

export function AccordionSection({
  icon: Icon,
  iconColor,
  title,
  status,
  defaultOpen = false,
  children,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-3 text-right hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className={cn("h-4.5 w-4.5", iconColor)} />
          <span className="font-medium text-sm">{title}</span>
          <StatusDot status={status} />
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t p-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
