"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { MUSEUM_EPISODES, type MuseumEpisode } from "@/lib/content/museum-data"
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Play, Quote, Eye } from "lucide-react"
import { BLUR_DATA_URL_16_9 } from "@/lib/image-utils"

export function MuseumGallery({ episodes }: { episodes?: MuseumEpisode[] | null }) {
  const displayEpisodes = episodes && episodes.length > 0 ? episodes : MUSEUM_EPISODES

  return (
    <section className="relative bg-[#0F0E0D] px-6 py-20 sm:py-32 md:py-40" id="gallery">
      <div className="relative z-10 mx-auto max-w-7xl">
        <header className="mx-auto mb-16 max-w-3xl space-y-6 text-center sm:mb-24 md:mb-32 md:space-y-8">
          <span className="text-[10px] font-bold tracking-[0.3em] text-primary">
            المعرض الرئيسي
          </span>
          <h2 className="museum-font-headline text-3xl tracking-tight sm:text-4xl md:text-5xl lg:text-7xl">
            قاعة الحلقات
          </h2>
          <div className="mx-auto h-px w-16 bg-primary/40 sm:w-24" />
          <p className="text-base font-light italic text-muted-foreground sm:text-lg md:text-xl">
            &ldquo;كل حوار هو قطعة أثرية في متحف الفكر الإنساني.&rdquo;
          </p>
        </header>

        <div className="grid grid-cols-1 gap-12 sm:gap-16 md:grid-cols-2 md:gap-24 lg:grid-cols-3">
          {displayEpisodes.map((episode) => (
            <EpisodeCard key={episode.id} episode={episode} />
          ))}
        </div>
      </div>
    </section>
  )
}

function EpisodeCard({ episode }: { episode: MuseumEpisode }) {
  const [hovered, setHovered] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          className="group flex h-full cursor-pointer flex-col"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="museum-frame mb-8 flex flex-1 flex-col overflow-hidden">
            <div className="relative aspect-[3/4] overflow-hidden bg-black/40">
              <Image
                src={episode.imageUrl}
                alt={episode.title}
                fill
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL_16_9}
                className={`object-cover transition-all duration-[1.5s] ${
                  hovered ? "scale-110 grayscale-0" : "scale-100 grayscale"
                }`}
              />

              {/* Overlay Content */}
              <div
                className={`absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-10 text-center transition-all duration-700 ${
                  hovered
                    ? "translate-y-0 opacity-100"
                    : "translate-y-4 opacity-0"
                }`}
              >
                <Quote className="mb-6 h-10 w-10 text-primary/40" />
                <p className="museum-font-headline mb-8 text-lg italic leading-relaxed md:text-xl">
                  &ldquo;{episode.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.2em] text-primary">
                  <Eye className="h-3 w-3" />
                  عرض المعروضة
                </div>
              </div>

              {/* Gold light effect on top */}
              <div
                className={`absolute inset-0 bg-gradient-to-tr from-transparent via-primary/5 to-transparent transition-opacity duration-700 ${
                  hovered ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
          </div>

          <div className="space-y-3 px-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-widest text-primary/60">
                {episode.number}
              </span>
              <span className="text-[10px] tracking-widest text-muted-foreground">
                {episode.guestName}
              </span>
            </div>
            <h3 className="museum-font-headline text-3xl transition-colors duration-500 group-hover:text-primary">
              {episode.title}
            </h3>
            <div className="pt-4">
              <button className="flex items-center gap-4 text-[10px] font-bold tracking-[0.2em] text-muted-foreground transition-colors group-hover:text-primary">
                <span className="h-px w-8 bg-muted-foreground transition-colors group-hover:bg-primary" />
                ادخل الحوار
              </button>
            </div>
          </div>
        </div>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[calc(100dvh-2rem)] overflow-y-auto border-primary/10 bg-background p-0 shadow-2xl">
        {/* Close button */}
        <DialogClose className="absolute end-3 top-3 z-20 rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm hover:bg-black/80" />

        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Video area */}
          <div className="flex flex-col bg-black lg:col-span-7">
            <div className="aspect-video">
              <iframe
                ref={iframeRef}
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${episode.youtubeUrl.split("v=")[1]}?autoplay=1&mute=1`}
                title={episode.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          </div>

          {/* Text area */}
          <div className="flex flex-col justify-center space-y-6 p-6 sm:p-8 lg:col-span-5 lg:p-10">
            <DialogHeader className="space-y-3">
              <span className="text-[10px] font-bold tracking-[0.3em] text-primary">
                {episode.number}
              </span>
              <DialogTitle className="museum-font-headline text-2xl leading-tight sm:text-3xl lg:text-4xl">
                {episode.title}
              </DialogTitle>
              <div className="h-px w-12 bg-primary/30" />
              <DialogDescription className="border-s-2 border-primary/20 ps-4 pt-2 text-base font-light italic leading-relaxed text-muted-foreground sm:text-lg">
                &ldquo;{episode.quote}&rdquo;
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold tracking-widest text-primary">
                  الضيف:
                </span>
                <span className="text-sm tracking-widest text-foreground">
                  {episode.guestName}
                </span>
              </div>
              <p className="text-sm font-light leading-relaxed text-muted-foreground sm:text-base">
                {episode.description}
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => {
                  const iframe = iframeRef.current
                  if (iframe?.requestFullscreen) {
                    iframe.requestFullscreen()
                  } else if ((iframe as HTMLIFrameElement & { webkitRequestFullscreen?: () => void })?.webkitRequestFullscreen) {
                    ;(iframe as HTMLIFrameElement & { webkitRequestFullscreen: () => void }).webkitRequestFullscreen()
                  }
                }}
                className="group flex items-center gap-4 border border-primary/20 px-6 py-3 text-xs font-bold tracking-[0.3em] transition-all duration-500 hover:bg-primary hover:text-background sm:px-8 sm:py-4"
              >
                <Play className="h-4 w-4 fill-current transition-transform group-hover:scale-125" />
                عِش الحوار
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
