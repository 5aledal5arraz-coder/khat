import { NextResponse } from "next/server"
import { requireRole } from "@/lib/api-utils"
import { getHealthStats } from "@/lib/newsletter/queries"

export async function GET() {
  const auth = await requireRole("VIEWER")
  if (auth.error) return auth.error

  const stats = await getHealthStats()

  return NextResponse.json({
    env: {
      resendApiKey: !!process.env.RESEND_API_KEY,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
      fromEmail: process.env.RESEND_FROM_EMAIL || "noreply@khatpodcast.com",
    },
    db: stats,
  })
}
