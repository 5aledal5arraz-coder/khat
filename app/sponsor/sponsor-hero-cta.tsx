"use client"

import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"

export function SponsorHeroCTA() {
  return (
    <Button
      size="lg"
      className="gap-2 text-lg px-8 py-6 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25"
      onClick={() => {
        document
          .getElementById("partnership-form")
          ?.scrollIntoView({ behavior: "smooth" })
      }}
    >
      قدّم طلب شراكة
      <ChevronDown className="w-5 h-5" />
    </Button>
  )
}
