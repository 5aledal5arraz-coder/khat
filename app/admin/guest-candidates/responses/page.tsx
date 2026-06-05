import { listAllPrepResponses, listTemplates } from "@/lib/guest-candidates"
import { ResponsesArchiveClient } from "./responses-archive-client"

export const dynamic = "force-dynamic"

export default async function PrepResponsesArchivePage() {
  const [rawRows, templates] = await Promise.all([
    listAllPrepResponses({ limit: 200 }),
    listTemplates(),
  ])

  const rows = rawRows.map((row) => ({
    response: {
      ...row.response,
      submitted_at: row.response.submitted_at
        ? new Date(row.response.submitted_at as unknown as Date).toISOString()
        : null,
      created_at: new Date(row.response.created_at as unknown as Date).toISOString(),
      updated_at: new Date(row.response.updated_at as unknown as Date).toISOString(),
    },
    link: row.link,
    candidate: row.candidate,
  }))

  const serializedTemplates = templates.map((t) => ({
    ...t,
    created_at: new Date(t.created_at as unknown as Date).toISOString(),
    updated_at: new Date(t.updated_at as unknown as Date).toISOString(),
  })) as unknown as import("@/types/database").PrepFormTemplate[]

  return <ResponsesArchiveClient rows={rows} templates={serializedTemplates} />
}
