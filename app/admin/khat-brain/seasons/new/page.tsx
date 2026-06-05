import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { requireAdmin } from "@/lib/api-utils"
import { SetupClient } from "./setup-client"

export const dynamic = "force-dynamic"

export default async function NewSeasonPage() {
  await requireAdmin()
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="mx-auto max-w-3xl px-6 pt-8 pb-16">
        <Link
          href="/admin/khat-brain/seasons"
          className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          المواسم
        </Link>
        <div className="mb-8 text-center">
          <div className="inline-block rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
            موسم جديد
          </div>
          <h1 className="mt-4 text-3xl font-bold">ابدأ موسماً جديداً</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            اختر الطريقة التي تريد أن نبني بها موسمك. كل شيء مصمّم ليأخذك خطوة بخطوة.
          </p>
        </div>
        <SetupClient />
      </div>
    </div>
  )
}
