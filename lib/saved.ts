export interface SavedItem {
  id: string
  type: "episode" | "quote" | "timestamp"
  title: string
  subtitle?: string
  slug?: string
  savedAt: string
}

const STORAGE_KEY = "khat_saved_items"

export function getSavedItems(): SavedItem[] {
  if (typeof window === "undefined") return []
  try {
    const items = localStorage.getItem(STORAGE_KEY)
    return items ? JSON.parse(items) : []
  } catch {
    return []
  }
}

export function saveItem(item: Omit<SavedItem, "savedAt">): void {
  if (typeof window === "undefined") return
  try {
    const items = getSavedItems()
    const exists = items.some((i) => i.id === item.id && i.type === item.type)
    if (!exists) {
      items.push({ ...item, savedAt: new Date().toISOString() })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    }
  } catch {
    console.error("Failed to save item")
  }
}

export function removeSavedItem(id: string, type: SavedItem["type"]): void {
  if (typeof window === "undefined") return
  try {
    const items = getSavedItems()
    const filtered = items.filter((i) => !(i.id === id && i.type === type))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch {
    console.error("Failed to remove item")
  }
}

export function isItemSaved(id: string, type: SavedItem["type"]): boolean {
  if (typeof window === "undefined") return false
  const items = getSavedItems()
  return items.some((i) => i.id === id && i.type === type)
}

export function toggleSaveItem(item: Omit<SavedItem, "savedAt">): boolean {
  if (isItemSaved(item.id, item.type)) {
    removeSavedItem(item.id, item.type)
    return false
  } else {
    saveItem(item)
    return true
  }
}
