"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth"
import { auth as getAuth } from "@/lib/firebase/config"

interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_admin: boolean
  is_banned: boolean
  articles_count: number
  followers_count: number
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  isLoading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isLoading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), async (firebaseUser) => {
      setUser(firebaseUser)

      if (firebaseUser) {
        try {
          const res = await fetch("/api/auth/profile")
          const data = await res.json()
          setProfile(data.profile)
        } catch {
          setProfile(null)
        }
      } else {
        setProfile(null)
      }

      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const signOut = async () => {
    await firebaseSignOut(getAuth())
    await fetch("/api/auth/session", { method: "DELETE" })
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
