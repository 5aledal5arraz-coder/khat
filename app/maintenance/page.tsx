import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "الموقع قيد الصيانة",
  description: "نحن نعمل على تحسين الموقع. سنعود قريباً.",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default function MaintenancePage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-4xl font-bold">الموقع قيد الصيانة</h1>
        <p className="text-lg text-muted-foreground">
          نحن نعمل على تحسين تجربتك. سنعود قريباً — شكراً لصبرك.
        </p>
      </div>
    </div>
  )
}
