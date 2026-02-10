"use client"

import { useToast } from "@/lib/use-toast"
import { Toast } from "@/components/ui/toast"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div
      className="pointer-events-none fixed top-4 end-4 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-[420px]"
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
