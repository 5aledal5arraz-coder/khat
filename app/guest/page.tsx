import { Metadata } from "next"
import Link from "next/link"
import { Mailbox } from "lucide-react"
import { GuestApplicationForm } from "@/components/forms/guest-application-form"
import { getSiteSettings } from "@/lib/site-settings"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "كن ضيفًا في خط",
  description: "قدم طلباً لتكون ضيفاً على بودكاست خط",
}

export default async function GuestPage() {
  const settings = await getSiteSettings().catch(() => null)
  const applicationsOpen = settings?.featureFlags.guestApplicationsEnabled ?? true

  return (
    <div className="container mx-auto px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        {/* Intro */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            كن ضيفًا في خط
          </h1>
          <div className="mx-auto mt-6 max-w-lg space-y-2 text-base leading-relaxed text-muted-foreground">
            <p>هذا ليس نموذج تقديم عادي.</p>
            <p>
              نحن لا نبحث عن شهرة، أو ألقاب، أو أرقام متابعين.
            </p>
            <p>
              نبحث عن <span className="text-foreground">قصة</span>، أو{" "}
              <span className="text-foreground">فكرة</span>، أو{" "}
              <span className="text-foreground">تجربة إنسانية</span> تستحق أن
              تُروى.
            </p>
          </div>
        </div>

        {applicationsOpen ? (
          <>
            {/* Form */}
            <GuestApplicationForm />

            {/* Note */}
            <p className="mt-10 text-center text-xs leading-relaxed text-muted-foreground/50">
              نراجع جميع الطلبات بعناية. قد نتواصل معك لمزيد من التفاصيل.
              <br />
              عدم الرد لا يعني الرفض — فقد نعود لطلبك لاحقاً.
            </p>
          </>
        ) : (
          /* Applications closed — gated by the guestApplicationsEnabled flag */
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-10 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Mailbox className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              باب الطلبات مغلق حالياً
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              نستقبل طلبات الضيوف على دفعات. الباب مغلق في الوقت الحالي — تابعنا
              لتعرف متى نفتحه من جديد.
            </p>
            <Link
              href="/episodes"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              استكشف الحلقات
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
