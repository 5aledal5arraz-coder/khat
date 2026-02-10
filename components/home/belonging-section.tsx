import { NewsletterForm } from "@/components/forms/newsletter-form"
import { Mail } from "lucide-react"

export function BelongingSection() {
  return (
    <section className="py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" />
        </div>

        <h2 className="text-xl font-bold">
          احصل على فكرة مُلهمة كل أسبوع
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          نرسل لك اقتباسات مختارة وتأملات وأحدث الحلقات — بدون إزعاج.
        </p>

        <div className="mt-6">
          <NewsletterForm />
        </div>
      </div>
    </section>
  )
}
