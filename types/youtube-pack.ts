export interface YouTubePackSection {
  id: string
  type: "titles" | "description" | "timestamps" | "hashtags" | "clips" | "tweets"
  label: string
  content: string
}

export interface YouTubePackEntry {
  episodeId: string
  episodeTitle: string
  sections: YouTubePackSection[]
  transcript: string | null
  generatedAt: string
}

export type YouTubePackConfig = Record<string, YouTubePackEntry>
