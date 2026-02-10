"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface PlayerContextValue {
  seekTime: number | null
  seekTo: (seconds: number) => void
}

const PlayerContext = createContext<PlayerContextValue>({
  seekTime: null,
  seekTo: () => {},
})

export function usePlayer() {
  return useContext(PlayerContext)
}

export function EpisodePlayerProvider({ children }: { children: ReactNode }) {
  const [seekTime, setSeekTime] = useState<number | null>(null)

  const seekTo = useCallback((seconds: number) => {
    setSeekTime(seconds)
  }, [])

  return (
    <PlayerContext.Provider value={{ seekTime, seekTo }}>
      {children}
    </PlayerContext.Provider>
  )
}
