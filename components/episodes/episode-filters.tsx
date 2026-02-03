"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Search } from "lucide-react"
import type { Topic, Guest } from "@/types/database"

interface EpisodeFiltersProps {
  topics: Topic[]
  guests: Guest[]
  seasons: number[]
}

export function EpisodeFilters({ topics, guests, seasons }: EpisodeFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/episodes?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ابحث في الحلقات..."
          className="ps-10"
          defaultValue={searchParams.get("search") || ""}
          onChange={(e) => {
            const timer = setTimeout(() => {
              updateFilter("search", e.target.value)
            }, 300)
            return () => clearTimeout(timer)
          }}
        />
      </div>

      <Select
        value={searchParams.get("topic") || ""}
        onChange={(e) => updateFilter("topic", e.target.value)}
      >
        <option value="">جميع المواضيع</option>
        {topics.map((topic) => (
          <option key={topic.id} value={topic.slug}>
            {topic.name}
          </option>
        ))}
      </Select>

      <Select
        value={searchParams.get("guest") || ""}
        onChange={(e) => updateFilter("guest", e.target.value)}
      >
        <option value="">جميع الضيوف</option>
        {guests.map((guest) => (
          <option key={guest.id} value={guest.slug}>
            {guest.name}
          </option>
        ))}
      </Select>

      {seasons.length > 0 && (
        <Select
          value={searchParams.get("season") || ""}
          onChange={(e) => updateFilter("season", e.target.value)}
        >
          <option value="">جميع المواسم</option>
          {seasons.map((season) => (
            <option key={season} value={season.toString()}>
              الموسم {season}
            </option>
          ))}
        </Select>
      )}
    </div>
  )
}
