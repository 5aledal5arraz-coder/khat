"use client"

import Image from "next/image"

export function MuseumHost() {
  return (
    <section className="relative overflow-hidden bg-[#1D1B18] px-6 py-32">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-center gap-20 md:flex-row">
          <div className="museum-frame relative aspect-[3/4] w-full p-0 md:w-1/2">
            <Image
              src="https://picsum.photos/seed/khat7/800/1200"
              alt="القيّم"
              fill
              className="object-cover"
            />
          </div>
          <div className="w-full space-y-8 md:w-1/2">
            <span className="text-xs font-bold tracking-[0.2em] text-primary">
              البيان
            </span>
            <h2 className="museum-font-headline text-5xl md:text-7xl">
              بيان خط
            </h2>
            <div className="space-y-6 text-lg font-light leading-relaxed text-muted-foreground">
              <p>في عالمٍ يتدفق فيه الكلام بلا توقف، اخترنا أن نتوقف… لننصت.</p>
              <p>
                &ldquo;خط&rdquo; ليس برنامجاً عابراً، بل مساحة تُحفظ فيها
                الحوارات التي تستحق أن تبقى.
              </p>
              <p>
                نحن لا نبحث عن الضيوف الأكثر حضوراً، بل عن العقول التي تطرح
                الأسئلة التي تغيّر طريقة التفكير.
              </p>
              <p>
                كل لقاء في خط هو محاولة لفهم أعمق للإنسان، وللبحث عن الأفكار
                التي تستطيع أن تعبر الزمن.
              </p>
              <p>
                هنا لا نتعامل مع الحلقات كمحتوى سريع الاستهلاك، بل كقطع فكرية
                تُضاف إلى أرشيف الحوار الإنساني.
              </p>
              <p>هذا المشروع ليس مجرد منصة للحديث، بل متحفٌ حيّ للأفكار.</p>
            </div>
            <div className="pt-8">
              <div className="flex items-center gap-6">
                <div className="h-px w-20 bg-primary/30" />
                <p className="museum-font-headline text-xl italic text-primary">
                  &ldquo;الحوار أحد أرقى أشكال الفن.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
