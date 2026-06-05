"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { StudioSession } from "@/types/database"

interface SessionContextValue {
  session: StudioSession
  sessionId: string
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error("useSession must be used within SessionProvider")
  return ctx
}

export function SessionProvider({
  session,
  children,
}: {
  session: StudioSession
  children: ReactNode
}) {
  return (
    <SessionContext.Provider value={{ session, sessionId: session.id }}>
      {children}
    </SessionContext.Provider>
  )
}
