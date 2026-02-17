interface ConversationMapProps {
  data?: {
    beginning?: { title: string; description: string }
    middle?: { title: string; description: string }
    conclusion?: { title: string; description: string }
  }
}

export function ConversationMap({ data }: ConversationMapProps) {
  if (!data) return null
  const { beginning, middle, conclusion } = data
  if (!beginning && !middle && !conclusion) return null

  const nodes = [
    { key: "beginning", label: "البداية", node: beginning },
    { key: "middle", label: "المنتصف", node: middle },
    { key: "conclusion", label: "الخاتمة", node: conclusion },
  ].filter((n) => n.node)

  if (nodes.length === 0) return null

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">خريطة المحادثة</h2>
      <div className="relative flex flex-col gap-4 sm:flex-row sm:gap-0">
        {nodes.map((n, i) => (
          <div key={n.key} className="relative flex-1">
            {/* Connector line between nodes */}
            {i < nodes.length - 1 && (
              <div className="absolute start-1/2 top-5 hidden h-0.5 w-full -translate-x-1/2 bg-border sm:block" />
            )}
            <div className="relative rounded-lg border bg-card p-4 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {i + 1}
              </div>
              <p className="text-xs text-muted-foreground">{n.label}</p>
              <p className="mt-1 font-medium">{n.node!.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{n.node!.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
