"use client"

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>حدث خطأ ما</h2>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          عذراً، حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1.5rem",
            borderRadius: "0.375rem",
            border: "1px solid #ccc",
            cursor: "pointer",
            fontSize: "1rem",
          }}
        >
          إعادة المحاولة
        </button>
      </body>
    </html>
  )
}
