"use client"

import { useEffect } from "react"

export function ThemeSync() {
  useEffect(() => {
    const html = document.documentElement
    const mode = html.getAttribute("data-theme-mode")
    if (mode !== "system") return

    const mq = window.matchMedia("(prefers-color-scheme: dark)")

    function apply(dark: boolean) {
      html.classList.toggle("dark", dark)
    }

    apply(mq.matches)

    function onChange(e: MediaQueryListEvent) {
      apply(e.matches)
    }

    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return null
}
