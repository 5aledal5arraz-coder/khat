import { ExternalLink, BookOpen, Link as LinkIcon, FileText } from "lucide-react"
import type { Resource } from "@/types/database"

interface ResourcesListProps {
  resources: Resource[]
}

const typeIcons: Record<string, typeof BookOpen> = {
  book: BookOpen,
  article: FileText,
  link: LinkIcon,
}

export function ResourcesList({ resources }: ResourcesListProps) {
  if (resources.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">موارد ذُكرت في الحلقة</h3>
      <ul className="space-y-2">
        {resources.map((resource) => {
          const Icon = typeIcons[resource.type || 'link'] || LinkIcon
          return (
            <li key={resource.id}>
              <a
                href={/^https?:\/\//.test(resource.url) ? resource.url : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 font-medium">{resource.title}</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
