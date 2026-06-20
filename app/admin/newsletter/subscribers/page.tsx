import { getSubscribersWithStatus } from "@/lib/newsletter/queries"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { SubscriberList } from "./subscriber-list"

export const dynamic = "force-dynamic"

export default async function NewsletterSubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>
}) {
  const params = await searchParams
  const status = params.status || "all"
  const search = params.search || ""

  const { subscribers, counts } = await getSubscribersWithStatus({ status, search })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">المشتركون</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">إدارة مشتركي النشرة البريدية</p>
        </div>
        <Link
          href="/admin/newsletter"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          العودة
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <SubscriberList
        subscribers={subscribers}
        counts={counts}
        currentStatus={status}
        currentSearch={search}
      />
    </div>
  )
}
