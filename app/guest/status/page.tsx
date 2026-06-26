import { Suspense } from "react"
import type { Metadata } from "next"
import { GuestStatusClient } from "./status-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "متابعة حالة الطلب — بودكاست خط",
  description: "تابِع حالة طلبك للظهور ضيفًا في بودكاست خط برقمك المرجعي وبريدك.",
  robots: { index: false, follow: false },
}

export default function GuestStatusPage() {
  return (
    <div className="mx-auto max-w-lg px-5 py-16 sm:py-24">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">متابعة حالة طلبك</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          أدخل رقمك المرجعي والبريد الإلكتروني الذي تقدّمت به لتطّلع على حالة طلبك.
        </p>
      </div>
      <Suspense>
        <GuestStatusClient />
      </Suspense>
    </div>
  )
}
