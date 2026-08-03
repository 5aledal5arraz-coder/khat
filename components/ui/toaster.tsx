"use client"

import { useToast } from "@/lib/use-toast"
import { Toast } from "@/components/ui/toast"

// `w-full` next to `end-4` is 100vw offset by 1rem, so the container ran 16px
// past the opposite edge on every phone (measured 375px → right 391px, and the
// same at 320px). Below `sm` the width has to account for BOTH insets; from
// `sm` up the max-width caps it long before the edge, so `w-full` is safe there.
const TOASTER_CLASS =
  "pointer-events-none fixed top-4 end-4 z-[100] flex max-h-screen " +
  "w-[calc(100%-2rem)] flex-col gap-2 p-4 sm:w-full sm:max-w-[420px]"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div
      className={TOASTER_CLASS}
      role="region"
      aria-label="الإشعارات"
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          variant={toast.variant}
          title={toast.title}
          description={toast.description}
          onClose={() => dismiss(toast.id)}
        />
      ))}
    </div>
  )
}
