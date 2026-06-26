"use client"

import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
}

export function PartnerHeroCTA() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button
        size="lg"
        className="gap-2 px-8 py-6 text-lg shadow-lg shadow-primary/25"
        onClick={() => scrollTo("partnership-form")}
      >
        قدّم طلب شراكة
        <ChevronDown className="h-5 w-5" />
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="px-8 py-6 text-lg"
        onClick={() => scrollTo("packages")}
      >
        استعرض الباقات
      </Button>
    </div>
  )
}
