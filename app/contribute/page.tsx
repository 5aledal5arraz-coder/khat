import type { Metadata } from "next"
import { Sparkles } from "lucide-react"
import { CommunityContributeForm } from "@/components/forms/community-contribute-form"

export const metadata: Metadata = {
  title: "ساهم في خط — بودكاست خط",
  description:
    "خط يُصنع معكم. اقترح ضيفًا، أو فكرة حلقة، أو سؤالًا للنقاش، أو فكرة محتوى، أو اقتراحًا يجعل خط أفضل.",
}

export default function ContributePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[12px] font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          مجتمع خط
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">خط يُصنع معكم</h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          أفضل الحلقات تبدأ من فكرة سمعناها منكم. شاركنا ما تتمنّى أن يتناوله خط — ضيفًا، فكرة، سؤالًا، أو
          اقتراحًا — ونقرأ كل مساهمة بعناية. وإن بنينا عليها، يسعدنا أن نذكر فضلك.
        </p>
      </div>

      <div className="mt-10">
        <CommunityContributeForm />
      </div>

      <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground/60">
        لا حاجة لحساب. مساهمتك تصلنا مباشرةً، ونحتفظ بالأفكار القوية ونعود إليها حين يحين وقتها.
      </p>
    </div>
  )
}
