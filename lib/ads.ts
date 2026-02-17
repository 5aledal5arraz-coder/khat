import { createConfigStore } from "@/lib/config-store"
import type { AdSettings, EnhancedAdSettings, AdSlot, AdSlotPosition } from "@/types/ads"

export const defaultAdSettings: AdSettings = {
  sponsoredCard: {
    enabled: false,
    data: {
      name: "الراعي الرسمي",
      logo: "",
      title: "عنوان الإعلان الترويجي",
      description: "وصف قصير عن المنتج أو الخدمة المُعلن عنها.",
      url: "#",
      image: "",
    },
  },
  bannerAd: {
    enabled: false,
    data: {
      image: "",
      url: "#",
      alt: "إعلان",
    },
  },
}

function createDefaultSlots(): AdSlot[] {
  const now = new Date().toISOString()
  return [
    {
      id: "slot-home-sponsored",
      position: "home_sponsored",
      label: "المحتوى المدعوم - الرئيسية",
      enabled: false,
      schedule: { startDate: null, endDate: null },
      type: "sponsored_card",
      sponsoredData: { name: "", logo: "", title: "", description: "", url: "#", image: "" },
      updatedAt: now,
    },
    {
      id: "slot-episode-banner",
      position: "episode_banner",
      label: "بانر صفحة الحلقات",
      enabled: false,
      schedule: { startDate: null, endDate: null },
      type: "banner",
      bannerData: { image: "", url: "#", alt: "إعلان" },
      updatedAt: now,
    },
    {
      id: "slot-space-sidebar",
      position: "space_sidebar",
      label: "الشريط الجانبي - حبر",
      enabled: false,
      schedule: { startDate: null, endDate: null },
      type: "banner",
      bannerData: { image: "", url: "#", alt: "إعلان" },
      updatedAt: now,
    },
    {
      id: "slot-footer-banner",
      position: "footer_banner",
      label: "بانر أسفل الصفحة",
      enabled: false,
      schedule: { startDate: null, endDate: null },
      type: "banner",
      bannerData: { image: "", url: "#", alt: "إعلان" },
      updatedAt: now,
    },
  ]
}

// Use Record<string, unknown> to support migration from old format
const store = createConfigStore<Record<string, unknown>>("ads.json", {})

/** Detect old format { sponsoredCard, bannerAd } and migrate to enhanced slots */
function migrateOldFormat(data: Record<string, unknown>): EnhancedAdSettings | null {
  if ("sponsoredCard" in data && "bannerAd" in data && !("slots" in data)) {
    const old = data as unknown as AdSettings
    const slots = createDefaultSlots()
    // Migrate sponsored card data
    const sponsoredSlot = slots.find((s) => s.position === "home_sponsored")!
    sponsoredSlot.enabled = old.sponsoredCard.enabled
    sponsoredSlot.sponsoredData = old.sponsoredCard.data
    // Migrate banner data
    const bannerSlot = slots.find((s) => s.position === "episode_banner")!
    bannerSlot.enabled = old.bannerAd.enabled
    bannerSlot.bannerData = old.bannerAd.data
    return { slots }
  }
  return null
}

export async function getEnhancedAdSettings(): Promise<EnhancedAdSettings> {
  const data = await store.read()
  if (Object.keys(data).length === 0) {
    return { slots: createDefaultSlots() }
  }
  // Auto-migrate old format
  const migrated = migrateOldFormat(data)
  if (migrated) {
    await store.write(migrated as unknown as Record<string, unknown>)
    return migrated
  }
  return data as unknown as EnhancedAdSettings
}

export async function saveEnhancedAdSettings(settings: EnhancedAdSettings): Promise<void> {
  await store.write(settings as unknown as Record<string, unknown>)
}

/** Check if an ad slot is active (enabled + within schedule date range) */
export async function getActiveAdForSlot(position: AdSlotPosition): Promise<AdSlot | null> {
  const settings = await getEnhancedAdSettings()
  const slot = settings.slots.find((s) => s.position === position)
  if (!slot || !slot.enabled) return null

  const now = new Date()
  if (slot.schedule.startDate && new Date(slot.schedule.startDate) > now) return null
  if (slot.schedule.endDate && new Date(slot.schedule.endDate) < now) return null

  return slot
}

// Backward-compatible wrappers
export async function getAdSettings(): Promise<AdSettings> {
  const data = await store.read()
  if (Object.keys(data).length === 0) {
    return defaultAdSettings
  }
  // If already enhanced format, convert back
  if ("slots" in data) {
    const enhanced = data as unknown as EnhancedAdSettings
    const sponsoredSlot = enhanced.slots.find((s) => s.position === "home_sponsored")
    const bannerSlot = enhanced.slots.find((s) => s.position === "episode_banner")
    return {
      sponsoredCard: {
        enabled: sponsoredSlot?.enabled ?? false,
        data: sponsoredSlot?.sponsoredData ?? defaultAdSettings.sponsoredCard.data,
      },
      bannerAd: {
        enabled: bannerSlot?.enabled ?? false,
        data: bannerSlot?.bannerData ?? defaultAdSettings.bannerAd.data,
      },
    }
  }
  return data as unknown as AdSettings
}

export async function saveAdSettings(settings: AdSettings): Promise<void> {
  // If file is already in enhanced format, update the relevant slots
  const data = await store.read()
  if ("slots" in data) {
    const enhanced = data as unknown as EnhancedAdSettings
    const sponsoredSlot = enhanced.slots.find((s) => s.position === "home_sponsored")
    if (sponsoredSlot) {
      sponsoredSlot.enabled = settings.sponsoredCard.enabled
      sponsoredSlot.sponsoredData = settings.sponsoredCard.data
      sponsoredSlot.updatedAt = new Date().toISOString()
    }
    const bannerSlot = enhanced.slots.find((s) => s.position === "episode_banner")
    if (bannerSlot) {
      bannerSlot.enabled = settings.bannerAd.enabled
      bannerSlot.bannerData = settings.bannerAd.data
      bannerSlot.updatedAt = new Date().toISOString()
    }
    await saveEnhancedAdSettings(enhanced)
    return
  }
  await store.write(settings as unknown as Record<string, unknown>)
}
