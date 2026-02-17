"use client"

import type { EventType } from "@/types/personalization"

// ---------------------------------------------------------------------------
// Event queue — batches events and flushes periodically
// ---------------------------------------------------------------------------

interface QueuedEvent {
  event_type: EventType
  target_id: string
  metadata?: Record<string, unknown>
}

const queue: QueuedEvent[] = []
const FLUSH_INTERVAL_MS = 10_000 // 10 seconds
const FLUSH_THRESHOLD = 20 // or 20 events
let flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, FLUSH_INTERVAL_MS)
}

async function flush() {
  if (queue.length === 0) return

  const batch = queue.splice(0, queue.length)

  try {
    await fetch("/api/events/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-requested-with": "khat",
      },
      credentials: "include",
      body: JSON.stringify({ events: batch }),
    })
  } catch {
    // On failure, push events back to retry on next flush
    queue.unshift(...batch)
    scheduleFlush()
  }
}

// Flush on page unload so events aren't lost
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush()
    }
  })
  window.addEventListener("beforeunload", () => {
    if (queue.length === 0) return
    // Use sendBeacon for reliability during unload
    const payload = JSON.stringify({ events: queue.splice(0, queue.length) })
    navigator.sendBeacon("/api/events/batch", new Blob([payload], { type: "application/json" }))
  })
}

// ---------------------------------------------------------------------------
// Public API — simple track(eventType, targetId) function
// ---------------------------------------------------------------------------

export function track(eventType: EventType, targetId: string, metadata?: Record<string, unknown>) {
  queue.push({ event_type: eventType, target_id: targetId, metadata })

  if (queue.length >= FLUSH_THRESHOLD) {
    flush()
  } else {
    scheduleFlush()
  }
}

// Backward compat alias
export const trackEvent = track
