interface CentralQuestionProps {
  question?: string
}

export function CentralQuestion({ question }: CentralQuestionProps) {
  if (!question) return null

  return (
    <div className="flex items-center justify-center rounded-lg border bg-muted/30 px-6 py-8 text-center">
      <div className="max-w-2xl space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">السؤال المحوري</h2>
        <p className="text-xl font-semibold leading-relaxed">{question}</p>
      </div>
    </div>
  )
}
