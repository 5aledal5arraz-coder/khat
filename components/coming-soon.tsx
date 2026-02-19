import Image from "next/image"

export function ComingSoon() {
  return (
    <>
      {/* Google Fonts for the standalone page */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cormorant+Garamond:wght@400;500&family=Tajawal:wght@300;400;500&display=swap"
        rel="stylesheet"
      />

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes cs-fadeDown {
              from { opacity: 0; transform: translateY(-15px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes cs-logoFadeIn {
              from { opacity: 0; transform: scale(0.95); }
              to   { opacity: 1; transform: scale(1); }
            }
            @keyframes cs-fadeUp {
              from { opacity: 0; transform: translateY(25px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes cs-fadeIn {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
            .cs-yt-btn:hover {
              background: #c9a227 !important;
              color: #0a0a0a !important;
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(201,162,39,0.3);
            }
            .cs-social:hover {
              background: rgba(201,162,39,0.15);
              border-color: #c9a227 !important;
              transform: translateY(-2px);
            }
          `,
        }}
      />

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "#0a0a0a",
          color: "#f5f0e1",
          fontFamily: "'Amiri', serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          overflowX: "hidden",
          overflowY: "auto",
        }}
      >
        {/* Cinematic bar — top */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 40,
            background: "#000",
            zIndex: 100,
            borderBottom: "1px solid rgba(201,162,39,0.15)",
          }}
        />

        {/* Ambient glow */}
        <div
          style={{
            position: "fixed",
            top: -300,
            left: "50%",
            transform: "translateX(-50%)",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(201,162,39,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />

        {/* Main content */}
        <div
          style={{
            textAlign: "center",
            padding: "60px 30px",
            position: "relative",
            zIndex: 10,
            maxWidth: 900,
            width: "100%",
          }}
        >
          {/* COMING SOON badge */}
          <div
            style={{
              display: "inline-block",
              marginBottom: 30,
              opacity: 0,
              animation: "cs-fadeDown 1s ease-out 0.3s forwards",
            }}
          >
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "0.85rem",
                letterSpacing: 8,
                textTransform: "uppercase",
                color: "#c9a227",
                padding: "12px 30px",
                border: "1px solid rgba(201,162,39,0.4)",
                display: "inline-block",
              }}
            >
              COMING SOON
            </span>
          </div>

          {/* Logo */}
          <div
            style={{
              marginBottom: 30,
              opacity: 0,
              animation: "cs-logoFadeIn 1.5s ease-out 0.6s forwards",
            }}
          >
            <Image
              src="/newlogo.png"
              alt="خط بودكاست"
              width={520}
              height={200}
              priority
              style={{
                width: 520,
                maxWidth: "95vw",
                height: "auto",
              }}
            />
          </div>

          {/* Divider */}
          <div
            style={{
              width: 100,
              height: 1,
              background:
                "linear-gradient(90deg, transparent, #c9a227, transparent)",
              margin: "0 auto 30px",
              opacity: 0,
              animation: "cs-fadeIn 1s ease-out 1.2s forwards",
            }}
          />

          {/* Arabic tagline */}
          <div
            style={{
              fontSize: "1.6rem",
              fontWeight: 400,
              color: "#f5f0e1",
              lineHeight: 2.2,
              marginBottom: 15,
              opacity: 0,
              animation: "cs-fadeUp 1s ease-out 1.5s forwards",
            }}
          >
            ما انتهى، كان <span style={{ color: "#c9a227" }}>بداية</span>
            <br />
            وما سيأتي، هو <span style={{ color: "#c9a227" }}>الحكاية</span>
          </div>

          {/* Message */}
          <p
            style={{
              fontFamily: "'Tajawal', sans-serif",
              fontSize: "1rem",
              color: "rgba(245,240,225,0.7)",
              marginBottom: 40,
              opacity: 0,
              animation: "cs-fadeUp 1s ease-out 1.8s forwards",
            }}
          >
            نُعيد صياغة الخط... بروح جديدة، ورؤية أعمق
          </p>

          {/* YouTube button */}
          <div
            style={{
              marginBottom: 50,
              opacity: 0,
              animation: "cs-fadeUp 1s ease-out 2.1s forwards",
            }}
          >
            <a
              href="https://www.youtube.com/@KhatPodcast"
              target="_blank"
              rel="noopener noreferrer"
              className="cs-yt-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                background: "transparent",
                border: "1px solid #c9a227",
                color: "#c9a227",
                padding: "12px 28px",
                fontFamily: "'Tajawal', sans-serif",
                fontSize: "0.95rem",
                textDecoration: "none",
                transition: "all 0.4s ease",
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              شاهدونا على يوتيوب
            </a>
          </div>

          {/* Social links */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 20,
              opacity: 0,
              animation: "cs-fadeIn 1s ease-out 2.4s forwards",
            }}
          >
            {/* YouTube */}
            <a
              href="https://www.youtube.com/@KhatPodcast"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTube"
              className="cs-social"
              style={socialLinkStyle}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </a>

            {/* Instagram */}
            <a
              href="https://www.instagram.com/khat.podcast"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="cs-social"
              style={socialLinkStyle}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </a>

            {/* TikTok */}
            <a
              href="https://www.tiktok.com/@khatpodcast"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok"
              className="cs-social"
              style={socialLinkStyle}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.72a8.27 8.27 0 0 0 4.83 1.56v-3.45a4.84 4.84 0 0 1-1.07-.14z" />
              </svg>
            </a>

            {/* X / Twitter */}
            <a
              href="https://x.com/kaborakhat"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X"
              className="cs-social"
              style={socialLinkStyle}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>

          {/* Footer text */}
          <p
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "0.75rem",
              letterSpacing: 4,
              color: "rgba(245,240,225,0.3)",
              marginTop: 60,
              textTransform: "uppercase",
              opacity: 0,
              animation: "cs-fadeIn 1s ease-out 2.7s forwards",
            }}
          >
            KHAT PODCAST 2026
          </p>
        </div>

        {/* Cinematic bar — bottom */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: 40,
            background: "#000",
            zIndex: 100,
            borderTop: "1px solid rgba(201,162,39,0.15)",
          }}
        />
      </div>
    </>
  )
}

const socialLinkStyle: React.CSSProperties = {
  width: 46,
  height: 46,
  border: "1px solid rgba(201,162,39,0.3)",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#c9a227",
  textDecoration: "none",
  transition: "all 0.3s ease",
}
