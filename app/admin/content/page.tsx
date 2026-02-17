import { getAboutContent } from "@/lib/static-content"
import { ContentEditor } from "./content-editor"

export default async function ContentAdminPage() {
  const aboutContent = await getAboutContent()
  return <ContentEditor initialContent={aboutContent} />
}
