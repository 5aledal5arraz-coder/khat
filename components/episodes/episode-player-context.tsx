"use client"

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react"

interface PlayerContextValue {
  seekTo: (seconds: number) => void
  registerPlayer: (player: YT.Player) => void
  /**
   * Set when someone asked to seek before a player existed. `<YouTubeEmbed>`
   * watches it, mounts the real player at that second, and clears it.
   */
  pendingStart: number | null
  clearPendingStart: () => void
}

const PlayerContext = createContext<PlayerContextValue>({
  seekTo: () => {},
  registerPlayer: () => {},
  pendingStart: null,
  clearPendingStart: () => {},
})

export function usePlayer() {
  return useContext(PlayerContext)
}

export function EpisodePlayerProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<YT.Player | null>(null)
  const [pendingStart, setPendingStart] = useState<number | null>(null)

  const registerPlayer = useCallback((player: YT.Player) => {
    playerRef.current = player
  }, [])

  const clearPendingStart = useCallback(() => setPendingStart(null), [])

  /**
   * Jump to a second — WHETHER OR NOT THE VIDEO HAS BEEN STARTED.
   *
   * This used to `return` silently when `playerRef.current` was null, and null
   * is the NORMAL state: `<YouTubeEmbed>` is a facade that shows a thumbnail
   * and only constructs a player when someone clicks it. So every timestamp on
   * the page did nothing until the visitor had already pressed play — and now
   * that the full transcript lives on this page, the first thing a reader does
   * is click a timestamp several screens below a player they never touched.
   *
   * With no player, the request is remembered instead of dropped; the embed
   * mounts at that second on its next render.
   */
  const seekTo = useCallback((seconds: number) => {
    const player = playerRef.current
    if (player) {
      player.seekTo(seconds, true)
      player.playVideo()
    } else {
      setPendingStart(seconds)
    }
    // Bring the video into view either way — a jump the reader cannot see
    // reads as a dead control.
    document.getElementById("episode-player")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    })
  }, [])

  return (
    <PlayerContext.Provider
      value={{ seekTo, registerPlayer, pendingStart, clearPendingStart }}
    >
      {children}
    </PlayerContext.Provider>
  )
}
