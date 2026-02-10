"use server"

import { revalidatePath } from "next/cache"
import { saveThemeConfig } from "@/lib/theme"
import { saveModerationConfig } from "@/lib/moderation-config"
import type { ThemeMode } from "@/types/ads"

const VALID_MODES: ThemeMode[] = ["system", "dark", "light"]

export async function updateThemeMode(mode: ThemeMode) {
  if (!VALID_MODES.includes(mode)) {
    throw new Error("Invalid theme mode")
  }

  await saveThemeConfig({ mode })
  revalidatePath("/", "layout")
}

export async function updateAIModeration(enabled: boolean) {
  await saveModerationConfig({ aiEnabled: enabled })
  revalidatePath("/admin/settings")
}
