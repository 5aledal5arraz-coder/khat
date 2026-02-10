import { forwardRef } from "react"
import type { Quote, Guest } from "@/types/database"

export type TemplateType = "minimal" | "framed" | "gradient"

interface QuoteImageTemplateProps {
  quote: Quote & { guest?: Guest | null }
  episodeTitle?: string
  template: TemplateType
}

// Brand colors as inline HSL strings
const COLORS = {
  gold: "hsl(43, 54%, 54%)",
  darkBg: "hsl(212, 29%, 6%)",
  cream: "hsl(40, 41%, 92%)",
  purple: "hsl(266, 32%, 44%)",
  mutedText: "hsl(36, 5%, 54%)",
}

function getFontSize(text: string): number {
  const len = text.length
  if (len <= 50) return 48
  if (len <= 120) return 40
  if (len <= 200) return 34
  return 28
}

const FONT_FAMILY = "var(--font-ibm-plex-arabic), 'IBM Plex Sans Arabic', sans-serif"

function BrandingBar() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: "24px",
        marginTop: "auto",
      }}
    >
      <img
        src="/logo-small.jpg"
        alt="KHAT"
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "12px",
          objectFit: "cover",
        }}
      />
      <span
        style={{
          fontSize: "20px",
          color: COLORS.mutedText,
          fontFamily: FONT_FAMILY,
          letterSpacing: "0.5px",
        }}
      >
        khatpodcast.com
      </span>
    </div>
  )
}

function QuoteContent({
  quote,
  episodeTitle,
  textShadow,
}: {
  quote: Quote & { guest?: Guest | null }
  episodeTitle?: string
  textShadow?: string
}) {
  const fontSize = getFontSize(quote.text)

  return (
    <>
      {/* Opening quotation mark */}
      <div
        style={{
          fontSize: "120px",
          lineHeight: "1",
          color: COLORS.gold,
          opacity: 0.3,
          fontFamily: "serif",
          marginBottom: "-20px",
        }}
      >
        ❝
      </div>

      {/* Quote text */}
      <div
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: "2",
          color: COLORS.cream,
          fontFamily: FONT_FAMILY,
          fontWeight: 500,
          textAlign: "center",
          textShadow: textShadow || "none",
          wordBreak: "break-word",
        }}
      >
        {quote.text}
      </div>

      {/* Gold divider */}
      <div
        style={{
          width: "80px",
          height: "2px",
          background: COLORS.gold,
          margin: "32px auto",
          borderRadius: "1px",
        }}
      />

      {/* Guest name */}
      {quote.guest && (
        <div
          style={{
            fontSize: "24px",
            color: COLORS.gold,
            fontFamily: FONT_FAMILY,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {quote.guest.name}
        </div>
      )}

      {/* Episode title */}
      {episodeTitle && (
        <div
          style={{
            fontSize: "18px",
            color: COLORS.mutedText,
            fontFamily: FONT_FAMILY,
            textAlign: "center",
            marginTop: "8px",
          }}
        >
          {episodeTitle}
        </div>
      )}
    </>
  )
}

// Template 1: Minimal
function MinimalTemplate({ quote, episodeTitle }: Omit<QuoteImageTemplateProps, "template">) {
  return (
    <div
      style={{
        width: "1080px",
        height: "1080px",
        background: COLORS.darkBg,
        direction: "rtl",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "80px",
        fontFamily: FONT_FAMILY,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <QuoteContent quote={quote} episodeTitle={episodeTitle} />
      </div>
      <BrandingBar />
    </div>
  )
}

// Template 2: Framed
function FramedTemplate({ quote, episodeTitle }: Omit<QuoteImageTemplateProps, "template">) {
  return (
    <div
      style={{
        width: "1080px",
        height: "1080px",
        background: COLORS.darkBg,
        direction: "rtl",
        display: "flex",
        flexDirection: "column",
        padding: "60px",
        fontFamily: FONT_FAMILY,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          flex: 1,
          border: `2px solid ${COLORS.gold}`,
          borderRadius: "16px",
          padding: "60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
        }}
      >
        {/* Corner diamonds */}
        {(["top:12px;right:12px", "top:12px;left:12px", "bottom:12px;right:12px", "bottom:12px;left:12px"] as const).map(
          (pos, i) => {
            const parts = pos.split(";")
            const styleObj: Record<string, string> = {
              position: "absolute",
              color: COLORS.gold,
              fontSize: "16px",
              lineHeight: "1",
            }
            parts.forEach((p) => {
              const [key, val] = p.split(":")
              styleObj[key] = val
            })
            return (
              <span key={i} style={styleObj}>
                ◆
              </span>
            )
          }
        )}

        <QuoteContent quote={quote} episodeTitle={episodeTitle} />
      </div>
      <div style={{ paddingTop: "16px" }}>
        <BrandingBar />
      </div>
    </div>
  )
}

// Template 3: Gradient
function GradientTemplate({ quote, episodeTitle }: Omit<QuoteImageTemplateProps, "template">) {
  return (
    <div
      style={{
        width: "1080px",
        height: "1080px",
        background: `linear-gradient(135deg, hsl(266, 32%, 20%) 0%, ${COLORS.darkBg} 50%, hsl(212, 40%, 12%) 100%)`,
        direction: "rtl",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "80px",
        fontFamily: FONT_FAMILY,
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* Radial gold glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "hsla(43, 54%, 54%, 0.08)",
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <QuoteContent
          quote={quote}
          episodeTitle={episodeTitle}
          textShadow="0 2px 8px rgba(0, 0, 0, 0.5)"
        />
      </div>
      <div style={{ position: "relative", zIndex: 1, width: "100%" }}>
        <BrandingBar />
      </div>
    </div>
  )
}

export const QuoteImageTemplate = forwardRef<HTMLDivElement, QuoteImageTemplateProps>(
  function QuoteImageTemplate({ quote, episodeTitle, template }, ref) {
    return (
      <div ref={ref}>
        {template === "minimal" && <MinimalTemplate quote={quote} episodeTitle={episodeTitle} />}
        {template === "framed" && <FramedTemplate quote={quote} episodeTitle={episodeTitle} />}
        {template === "gradient" && <GradientTemplate quote={quote} episodeTitle={episodeTitle} />}
      </div>
    )
  }
)
