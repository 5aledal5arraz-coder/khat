interface UnsaidReflectionsProps {
  items?: string[]
}

export function UnsaidReflections({ items }: UnsaidReflectionsProps) {
  if (!items || items.length === 0) return null

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">ما لم يُقال</h2>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex gap-3 rounded-lg border border-muted bg-muted/30 p-4">
            <span className="shrink-0 text-lg font-bold text-primary tabular-nums">{i + 1}</span>
            <p className="text-sm leading-relaxed text-muted-foreground">{item}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
