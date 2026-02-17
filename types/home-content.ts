import type { HomeQuote } from "@/types/database"
import type { EmotionalPath } from "@/types/database"
import type { DailyReflection } from "@/types/database"

export interface HomeQuotesConfig {
  quotes: HomeQuote[]
}

export interface EmotionalPathsConfig {
  paths: EmotionalPath[]
}

export interface DailyReflectionsConfig {
  reflections: DailyReflection[]
}
