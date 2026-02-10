interface EpisodeIdeasProps {
  keyIdeas?: string[]
  takeaways?: string[]
}

export function EpisodeIdeas({ keyIdeas, takeaways }: EpisodeIdeasProps) {
  const hasIdeas = keyIdeas && keyIdeas.length > 0
  const hasTakeaways = takeaways && takeaways.length > 0

  if (!hasIdeas && !hasTakeaways) return null

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">أفكار ودروس</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {hasIdeas && (
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 font-medium">الأفكار الرئيسية</h3>
            <ul className="space-y-2">
              {keyIdeas.map((idea, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-primary shrink-0">•</span>
                  <span>{idea}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {hasTakeaways && (
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 font-medium">دروس وفوائد</h3>
            <ol className="space-y-2">
              {takeaways.map((takeaway, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-primary shrink-0 font-medium tabular-nums">
                    {i + 1}.
                  </span>
                  <span>{takeaway}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
