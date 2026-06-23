"use client"

import type { ReactNode } from "react"
import type { StudioSession } from "@/types/database"
import { SessionProvider } from "./session-context"
import { PreloadProvider } from "./preload-context"
import { TranscriptProvider } from "./transcript-context"
import { ContentProvider } from "./content-context"
import { ChaptersProvider } from "./chapters-context"
import { ClipsProvider } from "./clips-context"
import { WebsitePkgProvider } from "./website-pkg-context"
import { GuestProvider } from "./guest-context"
import { AnalyzerProvider } from "./analyzer-context"
import { AudioProvider } from "./audio-context"
import { DeepAnalysisProvider } from "./deep-analysis-context"
import { GuestIntelligenceProvider } from "./guest-intelligence-context"
import { GrowthProvider } from "./growth-context"
import { PublishProvider } from "./publish-context"

// ---------------------------------------------------------------------------
// Composed Provider — wraps all domain contexts in correct nesting order
// ---------------------------------------------------------------------------

export function StudioSessionProvider({
  session,
  children,
}: {
  session: StudioSession
  children: ReactNode
}) {
  return (
    <SessionProvider session={session}>
      <PreloadProvider>
      <TranscriptProvider>
        <ContentProvider>
          <ChaptersProvider>
            <ClipsProvider>
              <WebsitePkgProvider>
                <GuestProvider>
                  <AnalyzerProvider>
                    <AudioProvider>
                      <DeepAnalysisProvider>
                        <GuestIntelligenceProvider>
                          <GrowthProvider>
                            <PublishProvider>
                              {children}
                            </PublishProvider>
                          </GrowthProvider>
                        </GuestIntelligenceProvider>
                      </DeepAnalysisProvider>
                    </AudioProvider>
                  </AnalyzerProvider>
                </GuestProvider>
              </WebsitePkgProvider>
            </ClipsProvider>
          </ChaptersProvider>
        </ContentProvider>
      </TranscriptProvider>
      </PreloadProvider>
    </SessionProvider>
  )
}

// ---------------------------------------------------------------------------
// Re-exports — consumers import hooks from here
// ---------------------------------------------------------------------------

export { useSession } from "./session-context"
export { useTranscript } from "./transcript-context"
export { useContent } from "./content-context"
export { useChapters } from "./chapters-context"
export { useClips } from "./clips-context"
export { useWebsitePkg } from "./website-pkg-context"
export { useGuest } from "./guest-context"
export { useAnalyzer } from "./analyzer-context"
export { useAudio } from "./audio-context"
export { useDeepAnalysis } from "./deep-analysis-context"
export { useGuestIntelligence } from "./guest-intelligence-context"
export { useGrowth } from "./growth-context"
export { usePublish, GENERATE_ALL_STEPS } from "./publish-context"
export type { GenerateAllStep } from "./publish-context"
