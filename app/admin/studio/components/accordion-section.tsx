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

const STATUS_LABEL: Record<TabStatus, string> = {
  idle: "",
  generating: "جارٍ...",
  ready: "جاهز",
  error: "خطأ",
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
    <div className={cn(
      "rounded-xl border border-border/30 bg-card/50 overflow-hidden transition-shadow",
      open && "shadow-sm"
    )}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-right transition-colors hover:bg-muted/40"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            status === "ready" ? "bg-emerald-500/10" : "bg-muted/40"
          )}>
            <Icon className={cn("h-4 w-4", status === "ready" ? "text-emerald-600 dark:text-emerald-400" : iconColor)} />
          </div>
          <span className="text-[13px] font-semibold">{title}</span>
          <StatusDot status={status} />
          {status !== "idle" && (
            <span className={cn(
              "text-[11px] font-medium",
              status === "ready" && "text-emerald-600 dark:text-emerald-400",
              status === "generating" && "text-amber-600 dark:text-amber-400",
              status === "error" && "text-red-600 dark:text-red-400",
            )}>
              {STATUS_LABEL[status]}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground/50 transition-transform duration-200",
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
          <div className="border-t border-border/30 p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
