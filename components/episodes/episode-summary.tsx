interface EpisodeSummaryProps {
  summary: string
}

export function EpisodeSummary({ summary }: EpisodeSummaryProps) {
  return (
    <div className="rounded-lg bg-muted/50 p-5">
      <h2 className="mb-3 text-lg font-semibold">ملخص الحلقة</h2>
      <p className="leading-relaxed text-muted-foreground whitespace-pre-line">
        {summary}
      </p>
    </div>
  )
}
