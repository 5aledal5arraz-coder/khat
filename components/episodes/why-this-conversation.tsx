interface WhyThisConversationProps {
  text?: string
}

export function WhyThisConversation({ text }: WhyThisConversationProps) {
  if (!text) return null

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
      <h2 className="mb-3 text-lg font-semibold">لماذا هذه المحادثة؟</h2>
      <p className="leading-relaxed text-muted-foreground whitespace-pre-line">{text}</p>
    </div>
  )
}
