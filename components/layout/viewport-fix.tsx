"use client"

import { useEffect } from "react"

/**
 * Sets CSS custom properties for the real viewport height and the heights of
 * fixed chrome (header + mobile-nav).  These update on every resize,
 * orientation change, and whenever the iOS Safari address-bar shows / hides
 * (which fires a "resize" event with a different `window.innerHeight`).
 *
 * CSS variables produced:
 *   --vh         : 1 % of the real inner height (use as `calc(var(--vh) * 100)`)
 *   --header-h   : measured height of the sticky header
 *   --mobile-nav-h : measured height of the fixed bottom nav (0 on desktop)
 */
export function ViewportFix() {
  useEffect(() => {
    function update() {
      // Real viewport-height unit
      const vh = window.innerHeight * 0.01
      document.documentElement.style.setProperty("--vh", `${vh}px`)

      // Measure fixed chrome so content can avoid it
      const header = document.querySelector("header")
      const mobileNav = document.querySelector("nav[class*='fixed']")

      if (header) {
        document.documentElement.style.setProperty(
          "--header-h",
          `${header.getBoundingClientRect().height}px`
        )
      }
      if (mobileNav) {
        const rect = mobileNav.getBoundingClientRect()
        // Only count it if it's visible (md:hidden means display:none on desktop)
        const h = rect.height > 0 ? rect.height : 0
        document.documentElement.style.setProperty("--mobile-nav-h", `${h}px`)
      } else {
        document.documentElement.style.setProperty("--mobile-nav-h", "0px")
      }
    }

    update()

    const handleOrientationChange = () => {
      // Safari needs a tick after orientationchange to report the new size
      setTimeout(update, 150)
    }

    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", handleOrientationChange)

    // Also recalculate after the YouTube iframe loads or transitions, which
    // can trigger a delayed address-bar change on iOS
    window.visualViewport?.addEventListener("resize", update)

    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", handleOrientationChange)
      window.visualViewport?.removeEventListener("resize", update)
    }
  }, [])

  return null
}
