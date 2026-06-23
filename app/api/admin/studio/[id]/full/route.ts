import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import {
  getTranscriptForSession,
  getAiOutputForSession,
  getChaptersForSession,
  getClipsForSession,
  getWebsitePackageForSession,
  getAnalyzerForSession,
  getDeepAnalysisForSession,
  getGuestIntelligenceForSession,
  getGrowthPackageForSession,
} from "@/lib/studio"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id: sessionId } = await params

  const [transcript, output, chapters, clips, websitePackage, analyzer, deepAnalysis, guestIntelligence, growth] =
    await Promise.all([
      getTranscriptForSession(sessionId),
      getAiOutputForSession(sessionId),
      getChaptersForSession(sessionId),
      getClipsForSession(sessionId),
      getWebsitePackageForSession(sessionId),
      getAnalyzerForSession(sessionId),
      getDeepAnalysisForSession(sessionId),
      getGuestIntelligenceForSession(sessionId),
      getGrowthPackageForSession(sessionId),
    ])

  return NextResponse.json({
    transcript,
    output,
    chapters,
    clips,
    package: websitePackage,
    analyzer,
    deepAnalysis,
    guestIntelligence,
    growth,
  })
}
