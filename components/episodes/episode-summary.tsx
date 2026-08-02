interface EpisodeSummaryProps {
  summary: string
}

export function EpisodeSummary({ summary }: EpisodeSummaryProps) {
  return (
    <div className="rounded-lg bg-muted/50 p-5">
      <h2 className="mb-3 text-lead font-semibold">ملخص الحلقة</h2>
      <p className="max-w-measure text-muted-foreground whitespace-pre-line">
        {summary}
      </p>
    </div>
  )
}
