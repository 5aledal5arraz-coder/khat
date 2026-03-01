import { Sparkles } from "lucide-react"

interface AdminPageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  badge?: "ai" | string
}

export function AdminPageHeader({ title, description, actions, badge }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          {badge === "ai" && (
            <span className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              <Sparkles className="h-3 w-3" />
              AI
            </span>
          )}
          {badge && badge !== "ai" && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
