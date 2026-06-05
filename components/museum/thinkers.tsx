"use client"

import Image from "next/image"
import { MUSEUM_THINKERS, type MuseumThinker } from "@/lib/content/museum-data"
import { BLUR_DATA_URL_16_9 } from "@/lib/image-utils"

export function MuseumThinkers({ thinkers }: { thinkers?: MuseumThinker[] | null }) {
  const displayThinkers = thinkers && thinkers.length > 0 ? thinkers : MUSEUM_THINKERS
  return (
    <section
      className="border-t border-white/5 bg-background px-6 py-40"
      id="hall-of-minds"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-24 lg:flex-row lg:items-center">
          <div className="w-full space-y-10 lg:w-1/3">
            <span className="text-[10px] font-bold tracking-[0.3em] text-primary">
              المجموعة الدائمة
            </span>
            <h2 className="museum-font-headline text-6xl leading-none tracking-tighter md:text-8xl">
              معرض العقول
            </h2>
            <div className="h-px w-20 bg-primary/30" />
            <p className="text-xl font-light italic leading-relaxed text-muted-foreground">
              &ldquo;كل عقل هنا ليس ضيفاً بل أثر فكري يُعرض في متحف
              الحوار&rdquo;
            </p>
            <div className="pt-8">
              <button className="text-[10px] font-bold tracking-[0.2em] text-primary transition-colors hover:text-white">
                عرض جميع المفكرين &larr;
              </button>
            </div>
          </div>

          <div className="w-full lg:w-2/3">
            <div className="grid grid-cols-1 gap-16 sm:grid-cols-2 md:gap-24">
              {displayThinkers.map((thinker) => (
                <div key={thinker.id} className="group">
                  <div className="museum-frame mb-10 overflow-hidden p-0 grayscale transition-all duration-[1.5s] hover:grayscale-0">
                    <div className="relative aspect-[3/4] transition-transform duration-[2s] group-hover:scale-110">
                      {thinker.imageUrl ? (
                        <Image
                          src={thinker.imageUrl}
                          alt={thinker.name}
                          fill
                          placeholder="blur"
                          blurDataURL={BLUR_DATA_URL_16_9}
                          className="object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-muted/30" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                    </div>
                  </div>
                  <div className="space-y-4 px-2">
                    <h3 className="museum-font-headline text-4xl tracking-tight transition-colors duration-500 group-hover:text-primary">
                      {thinker.name}
                    </h3>
                    <p className="text-[10px] font-bold tracking-[0.2em] text-primary">
                      {thinker.title}
                    </p>
                    <div className="h-px w-8 bg-white/10" />
                    <p className="line-clamp-3 text-lg font-light italic leading-relaxed text-muted-foreground">
                      {thinker.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
