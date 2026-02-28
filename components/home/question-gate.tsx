"use client"

import { useEffect, useRef, useState } from "react"

export function QuestionGate() {
  const [status, setStatus] = useState<"loading" | "show" | "skip">("loading")
  const [fadeIn, setFadeIn] = useState(false)
  const gateRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const seen = localStorage.getItem("khat_seen_entry")
    if (seen) {
      setStatus("skip")
      return
    }

    setStatus("show")
    document.documentElement.classList.add("entry-gate-active")

    // Trigger fade-in on next frame for smooth animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setFadeIn(true))
    })

    return () => {
      document.documentElement.classList.remove("entry-gate-active")
    }
  }, [])

  useEffect(() => {
    if (status !== "show" || !gateRef.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          document.documentElement.classList.add("entry-gate-active")
        } else {
          document.documentElement.classList.remove("entry-gate-active")
        }
      },
      { threshold: 0.1 },
    )

    observer.observe(gateRef.current)
    return () => observer.disconnect()
  }, [status])

  const handleStart = () => {
    localStorage.setItem("khat_seen_entry", "true")
    const content = document.getElementById("home-content")
    if (content) {
      content.scrollIntoView({ behavior: "smooth" })
    }
  }

  if (status !== "show") {
    return <div data-gate="inactive" />
  }

  return (
    <div ref={gateRef} data-gate="active">
      <section
        className="flex h-dvh items-center justify-center"
        style={{ backgroundColor: "hsl(212 29% 6%)" }}
      >
        <div
          className={`flex flex-col items-center gap-8 px-6 text-center transition-opacity duration-[1000ms] ease-out ${
            fadeIn ? "opacity-100" : "opacity-0"
          }`}
        >
          <h1
            className="max-w-2xl text-2xl font-light leading-relaxed sm:text-3xl md:text-4xl"
            style={{ color: "hsl(40 41% 92%)" }}
          >
            متى كانت آخر مرة جلست مع أفكارك… دون أن تهرب؟
          </h1>
          <button
            onClick={handleStart}
            className="mt-4 rounded-full border px-8 py-3 text-sm font-medium transition-all duration-300 hover:bg-white/10"
            style={{
              color: "hsl(43 54% 54%)",
              borderColor: "hsl(43 54% 54% / 0.3)",
            }}
          >
            ابدأ
          </button>
        </div>
      </section>
    </div>
  )
}
