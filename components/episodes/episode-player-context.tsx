"use client"

import { createContext, useContext, useCallback, useRef, type ReactNode } from "react"

interface PlayerContextValue {
  seekTo: (seconds: number) => void
  registerPlayer: (player: YT.Player) => void
}

const PlayerContext = createContext<PlayerContextValue>({
  seekTo: () => {},
  registerPlayer: () => {},
})

export function usePlayer() {
  return useContext(PlayerContext)
}

export function EpisodePlayerProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<YT.Player | null>(null)

  const registerPlayer = useCallback((player: YT.Player) => {
    playerRef.current = player
  }, [])

  const seekTo = useCallback((seconds: number) => {
    const player = playerRef.current
    if (player) {
      player.seekTo(seconds, true)
      player.playVideo()
      // Scroll the player into view
      const el = document.getElementById("episode-player")
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [])

  return (
    <PlayerContext.Provider value={{ seekTo, registerPlayer }}>
      {children}
    </PlayerContext.Provider>
  )
}
