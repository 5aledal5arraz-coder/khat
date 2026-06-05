import type { Metadata } from "next"
import { getPreparationByLiveToken } from "@/lib/preparation/queries"
import { LiveModeClient } from "./live-client"

export const metadata: Metadata = {
  title: "وضع التسجيل المباشر",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ token: string }>
}

export default async function LiveModePage({ params }: Props) {
  const { token } = await params
  const view = await getPreparationByLiveToken(token)

  if (!view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-center text-white">
        <div>
          <h1 className="mb-2 text-xl font-bold">الرابط غير صالح</h1>
          <p className="text-sm text-neutral-400">
            قد يكون الرابط منتهياً أو الجلسة لم تُعتمد بعد.
          </p>
        </div>
      </div>
    )
  }

  return <LiveModeClient token={token} initial={view} />
}
