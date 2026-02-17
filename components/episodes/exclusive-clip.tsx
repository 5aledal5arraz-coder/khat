import { getYouTubeEmbedUrl } from "@/lib/utils"

interface ExclusiveClipProps {
  data?: {
    youtube_url?: string
    message?: string
  }
}

export function ExclusiveClip({ data }: ExclusiveClipProps) {
  if (!data) return null
  const { youtube_url, message } = data
  if (!youtube_url && !message) return null

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">الدقيقة الحصرية</h2>
      {youtube_url && (
        <div className="overflow-hidden rounded-lg border">
          <div className="relative aspect-video w-full">
            <iframe
              src={getYouTubeEmbedUrl(youtube_url)}
              title="الدقيقة الحصرية"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{message}</p>
        </div>
      )}
    </div>
  )
}
