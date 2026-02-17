import { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getAuthorById, getArticlesByAuthor } from "@/lib/space-queries"
import { AuthorProfile } from "./author-profile"

interface AuthorPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { id } = await params
  const author = await getAuthorById(id)

  if (!author) {
    return { title: "الكاتب غير موجود" }
  }

  return {
    title: `${author.name} — حبر`,
    description: author.bio || `مقالات ${author.name} في حبر`,
    openGraph: {
      title: `${author.name} — حبر`,
      description: author.bio || `مقالات ${author.name} في حبر`,
      ...(author.avatar && { images: [{ url: author.avatar }] }),
    },
  }
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  const { id } = await params
  const author = await getAuthorById(id)

  if (!author) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">الكاتب غير موجود</h1>
        <p className="mt-2 text-muted-foreground">عذراً، لم نتمكن من العثور على هذا الكاتب</p>
        <Link href="/space" className="mt-4 inline-block">
          <Button>العودة لحبر</Button>
        </Link>
      </div>
    )
  }

  const articles = await getArticlesByAuthor(id)

  return <AuthorProfile author={author} articles={articles} />
}
