import { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getArticleById, getRelatedArticles } from "@/lib/space-queries"
import { ArticleDetail } from "./article-detail"

interface ArticlePageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { id } = await params
  const article = await getArticleById(id)

  if (!article) {
    return { title: "المقال غير موجود" }
  }

  return {
    title: article.title,
    description: article.excerpt || undefined,
    openGraph: {
      title: `${article.title} — حبر`,
      description: article.excerpt || undefined,
      ...(article.coverImage && { images: [{ url: article.coverImage }] }),
    },
  }
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { id } = await params
  const article = await getArticleById(id)

  if (!article) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">المقال غير موجود</h1>
        <p className="mt-2 text-muted-foreground">عذراً، لم نتمكن من العثور على هذا المقال</p>
        <Link href="/space" className="mt-4 inline-block">
          <Button>العودة لحبر</Button>
        </Link>
      </div>
    )
  }

  const relatedArticles = await getRelatedArticles(id, article.tags)

  const articleUrl = `https://khatpodcast.com/space/${id}`
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: article.title,
        description: article.excerpt || undefined,
        datePublished: article.date,
        ...(article.coverImage && { image: article.coverImage }),
        author: {
          "@type": "Person",
          name: article.author.name,
        },
        url: articleUrl,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "الرئيسية", item: "https://khatpodcast.com" },
          { "@type": "ListItem", position: 2, name: "حبر", item: "https://khatpodcast.com/space" },
          { "@type": "ListItem", position: 3, name: article.title, item: articleUrl },
        ],
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArticleDetail article={article} relatedArticles={relatedArticles} />
    </>
  )
}
