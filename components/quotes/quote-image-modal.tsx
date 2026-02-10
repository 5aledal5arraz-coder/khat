"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, Download, Share2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/lib/use-toast"
import { QuoteImageTemplate, type TemplateType } from "./quote-image-templates"
import type { Quote, Guest } from "@/types/database"

interface QuoteImageModalProps {
  quote: Quote & { guest?: Guest | null }
  episodeTitle?: string
  onClose: () => void
}

const TEMPLATES: { key: TemplateType; label: string }[] = [
  { key: "minimal", label: "بسيط" },
  { key: "framed", label: "مؤطر" },
  { key: "gradient", label: "متدرج" },
]

export function QuoteImageModal({ quote, episodeTitle, onClose }: QuoteImageModalProps) {
  const [mounted, setMounted] = useState(false)
  const [template, setTemplate] = useState<TemplateType>("minimal")
  const [generating, setGenerating] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  async function generateImage() {
    if (!captureRef.current || generating) return
    setGenerating(true)

    try {
      const { domToPng } = await import("modern-screenshot")

      const dataUrl = await domToPng(captureRef.current, {
        scale: 1,
        quality: 1,
      })

      const response = await fetch(dataUrl)
      const blob = await response.blob()
      const quoteId = quote.id || "unknown"
      const file = new File([blob], `khat-quote-${quoteId}.png`, { type: "image/png" })

      return { dataUrl, file }
    } catch (error) {
      console.error("Screenshot failed:", error)
      toast({
        title: "حدث خطأ في إنشاء الصورة",
        variant: "destructive",
        duration: 2000,
      })
      return null
    } finally {
      setGenerating(false)
    }
  }

  function downloadImage(dataUrl: string) {
    const quoteId = quote.id || "unknown"
    const link = document.createElement("a")
    link.download = `khat-quote-${quoteId}.png`
    link.href = dataUrl
    link.click()
    toast({
      title: "تم تحميل الصورة",
      description: "يمكنك الآن مشاركتها على أي منصة",
      variant: "success",
      duration: 3000,
    })
  }

  async function handleDownload() {
    const result = await generateImage()
    if (result) {
      downloadImage(result.dataUrl)
    }
  }

  async function handleShare() {
    const result = await generateImage()
    if (!result) return

    if (navigator.canShare && navigator.canShare({ files: [result.file] })) {
      try {
        await navigator.share({
          files: [result.file],
          title: quote.guest?.name ? `اقتباس من ${quote.guest.name}` : "اقتباس من خط",
          text: quote.text.substring(0, 100) + (quote.text.length > 100 ? "..." : ""),
        })
        toast({
          title: "تم المشاركة بنجاح",
          variant: "success",
          duration: 2000,
        })
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          downloadImage(result.dataUrl)
        }
      }
    } else {
      downloadImage(result.dataUrl)
    }
  }

  const modalContent = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bg-card border rounded-xl shadow-xl"
        style={{
          width: "min(90vw, 420px)",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px",
          direction: "rtl",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">مشاركة كصورة</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Template selector */}
        <div className="flex gap-2 mb-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTemplate(t.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors border ${
                template === t.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Live preview (scaled down) */}
        <div
          className="rounded-lg overflow-hidden border mb-4"
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            position: "relative",
          }}
        >
          <div
            style={{
              width: "1080px",
              height: "1080px",
              transform: "scale(calc(300 / 1080))",
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            <QuoteImageTemplate
              quote={quote}
              episodeTitle={episodeTitle}
              template={template}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleDownload}
            disabled={generating}
            className="flex-1 gap-2"
            variant="outline"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            تحميل
          </Button>
          <Button
            onClick={handleShare}
            disabled={generating}
            className="flex-1 gap-2"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            مشاركة
          </Button>
        </div>
      </div>

      {/* Hidden full-size capture div */}
      <div
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          pointerEvents: "none",
        }}
      >
        <QuoteImageTemplate
          ref={captureRef}
          quote={quote}
          episodeTitle={episodeTitle}
          template={template}
        />
      </div>
    </div>
  )

  if (!mounted) return null
  return createPortal(modalContent, document.body)
}
