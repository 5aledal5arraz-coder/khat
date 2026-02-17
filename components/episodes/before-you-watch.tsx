interface BeforeYouWatchProps {
  data?: {
    who_is_it_for?: string
    who_is_it_not_for?: string
    what_you_gain?: string
  }
}

export function BeforeYouWatch({ data }: BeforeYouWatchProps) {
  if (!data) return null
  const { who_is_it_for, who_is_it_not_for, what_you_gain } = data
  if (!who_is_it_for && !who_is_it_not_for && !what_you_gain) return null

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">قبل أن تشاهد</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {who_is_it_for && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
            <h3 className="mb-2 text-sm font-medium text-green-600 dark:text-green-400">لمن هذه الحلقة؟</h3>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{who_is_it_for}</p>
          </div>
        )}
        {who_is_it_not_for && (
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
            <h3 className="mb-2 text-sm font-medium text-orange-600 dark:text-orange-400">ليست لك إذا...</h3>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{who_is_it_not_for}</p>
          </div>
        )}
        {what_you_gain && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <h3 className="mb-2 text-sm font-medium text-blue-600 dark:text-blue-400">ماذا ستكسب؟</h3>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{what_you_gain}</p>
          </div>
        )}
      </div>
    </div>
  )
}
