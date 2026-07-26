/**
 * Shown when no session exists — i.e. always, until someone deliberately
 * spends money to generate one.
 *
 * The generation command is printed rather than wired to a button. Producing
 * the 20 pairs costs real AI calls (both models, plus the judge twice per
 * pair), and this page is a judging surface, not a spending surface. The
 * estimate mode is listed FIRST because it is free and answers "what will
 * this cost" without committing to anything.
 */

// Leaf module, not the barrel — see the note in panel-client.tsx.
import { PANEL_PAIR_COUNT } from "@/lib/ai-router/blind-panel/stats"
import { LimitsNote } from "./limits-note"

function Command({ children }: { children: string }) {
  return (
    <code
      dir="ltr"
      className="block overflow-x-auto rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-start font-mono text-[13px] text-foreground"
    >
      {children}
    </code>
  )
}

export function PanelEmptyState() {
  return (
    <div dir="rtl" lang="ar" className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
          لوحة الحكم الأعمى
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          ما فيه جلسة تحكيم حالياً — لازم تُولَّد الأزواج أولاً.
        </p>
      </header>

      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-2 text-[15px] font-semibold text-foreground">
            شنو تسوي هذي اللوحة
          </h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            تعرض عليك{" "}
            <strong className="font-semibold text-foreground tabular-nums">
              {PANEL_PAIR_COUNT}
            </strong>{" "}
            زوجًا من المخرجات — عناوين وأوصاف حلقات منشورة فعلاً — أحدهما من
            الموديل الحالي والثاني من المرشّح، بترتيب عشوائي ومصدر مخفي. تختار A
            أو B أو «لا فرق»، والتسمية ما تنكشف إلا بعد ما تخلص الـ
            {PANEL_PAIR_COUNT} كلها.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-foreground">
            التوليد — أمر صريح من الطرفية
          </h2>
          <p className="mb-2 text-[13px] text-muted-foreground">
            أولاً، تقدير الكلفة بلا أي استدعاء مدفوع:
          </p>
          <Command>npm run ai:blind-panel</Command>
          <p className="mb-2 mt-4 text-[13px] text-muted-foreground">
            وبعدين — وبس إذا وافقت على الرقم — التوليد الفعلي:
          </p>
          <Command>npm run ai:blind-panel -- --generate</Command>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            التوليد يسحب نصوص الحلقات عبر yt-dlp (مجاني)، ويشغّل نفس البرومبت
            الإنتاجي على الموديلين، ويشغّل الحَكَم النموذجي مرتين لكل زوج
            (بالاتجاهين، لإلغاء انحياز الموضع). ما فيه زر يسوي هذا — الصرف يصير
            بأمر مكتوب، مو بضغطة.
          </p>
        </section>

        <LimitsNote variant="judging" />
      </div>
    </div>
  )
}
