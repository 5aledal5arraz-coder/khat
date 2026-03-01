"use client"

import { useState, useEffect } from "react"

export function ReadingProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    function onScroll() {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight <= 0) return
      setProgress(Math.min(100, Math.round((window.scrollY / docHeight) * 100)))
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  if (progress <= 0) return null

  return (
    <div
      className="fixed top-0 start-0 z-50 h-[3px] bg-primary transition-[width] duration-150 ease-out"
      style={{ width: `${progress}%` }}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="تقدم القراءة"
    />
  )
}
